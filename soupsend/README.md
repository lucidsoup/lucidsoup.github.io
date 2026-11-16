# soupsend

Takes what the playground draws and puts it on an **NDI** or **Spout** output.

A browser can do neither, and that is not a gap to code around. NDI is a
protocol on the network with no web API; Spout is a DirectX shared texture, a
Windows GPU handle a sandboxed tab has no business holding. So the page draws
and sends pixels here, and this does the publishing.

## It is also the web server, and that is the whole trick

Open `http://127.0.0.1:7788/playground.html` — served by soupsend — and the
Send control appears. Open the same page from the public site and it will not,
because it cannot work there:

- **Safari** refuses an `http://127.0.0.1` subresource inside an `https://`
  page as mixed content. WebKit deviates from the spec here deliberately.
- **Chrome 142** gates public-site → 127.0.0.1 behind a Local Network Access
  prompt.

Serve the page from the same place that takes the frames and both problems are
simply absent: one origin, no mixed content, no prompt, no CORS.

## Build and run

```sh
make                       # the test sink — builds anywhere, needs nothing
./soupsend --sink test --name /tmp/frames
```

It prints the one address to open.

**The playground is baked into the binary.** `make` runs `embed.py`, which
bakes `playground.html` and its eight local assets in, so the binary is the
whole thing: copy it anywhere, run it, open the address, and the page is
there with the Send control already on it. A server with nothing to serve is
not a bridge anyone can use.

The baked copy is generated at build time and never committed, because a
checked-in copy of `playground.html` would drift from the real one within a
week. `--root DIR` serves from disk instead, which is what you want while
editing the page:

```sh
./soupsend --root ..       # serve the checkout, not the baked copy
``` The token is in it; without the token the
WebSocket is refused, and only loopback is ever listened on.

### NDI

The SDK is a **licensed download from Vizrt**, not a package:
<https://ndi.video/for-developers/ndi-sdk/>. You also need the NDI runtime,
which is a separate install.

```sh
make ndi NDI_SDK="/path/to/NDI SDK"
./soupsend --sink ndi --name "LucidSoup"
```

### Windows

`send.c` was POSIX sockets, so none of this built on Windows at all — which
made the Spout sink useless however well it compiled. It is ported now.
`plat.h` holds every difference in one file: Winsock for the sockets,
`WSAPoll` for `poll`, `BCryptGenRandom` for `/dev/urandom`, `GetTickCount64`
for the clock, and `SOCKET` for the file descriptor. `send.c` still reads
like the POSIX program it is.

Cross-build from Linux, which is how it is checked:

```sh
make windows          # needs mingw-w64; produces soupsend.exe, test sink
```

### Spout

On Windows, with the Spout SDK:

```
cl /std:c++17 /EHsc /DHAVE_SPOUT send.c sha1.c sink_test.c sink_none.c ^
   embedded.c sink_spout.cpp ^
   /I path\to\Spout2\SPOUTSDK\SpoutDirectX\SpoutDX ^
   SpoutDX.lib d3d11.lib dxgi.lib ws2_32.lib bcrypt.lib
soupsend.exe --sink spout --name "LucidSoup"
```

`SpoutDX.lib` is the part that cannot be checked from here: only Spout's
headers were available, not a built library. The sink compiles against those
headers; linking it is the first thing to try.

## What has actually been tested, and what has not

Be clear-eyed about this before trusting it on a show.

**The transport, end to end, on Linux.** The page is served from the binary
with no checkout present, the WebSocket upgrades (handshake checked against
RFC 6455's own worked example), frames arrive whole at the size asked for,
and **the pixel the page sends is the pixel that arrives** — matched by
timestamp, so channel order and orientation are proven rather than assumed.
A wrong token is refused; another site's origin is refused; only loopback is
bound. The server sustains **539 MB/s — 138 fps at 1280×800** against a
synthetic client.

**Both sinks compile against the real SDKs.**

`sink_ndi.c` compiles and *links* — `make ndi` against NDI SDK v6 for Linux
produces a working binary, with `libndi.so.6` and its Avahi/mDNS stack all
resolving. Two bugs in this Makefile only showed up when that was first
attempted for real:

- the SDK unpacks to a directory called `NDI SDK for Linux`, and the
  unquoted `-I$(NDI_INC)` turned it into three arguments, two of which the
  compiler tried to link;
- the `ndi` target did not include `sink_none.o`, so the "Spout is not in
  this build" stub went missing and `sink_spout_new` was undefined at link.

`sink_spout.cpp` compiles to a Windows object with `x86_64-w64-mingw32-g++`
against Spout's own `SpoutDX.h`, and every call it makes —
`OpenDirectX11`, `SetSenderName`, `SendImage`, `ReleaseSender`,
`CloseDirectX11` — matches the signature the real header declares. The only
warnings are MSVC `#pragma comment(lib, …)` lines inside Spout's headers.

**The Windows host builds and links.** `make windows` produces a real
PE32+ executable with the test sink. That cross-build immediately earned its
keep: the free-slot search still read `conns[i].fd < 0`, and `SOCKET` is
unsigned on Windows, so the test was always false — no free slot would ever
have been found and every connection after the first would have been
dropped. A Linux build cannot see that bug, because there a descriptor
really is a signed int.

**Neither sink has ever been run.** Compiling is not working. The NDI build
could not be executed where it was built — the sandbox there declines to run
a binary linked against a 27 MB closed-source library downloaded minutes
earlier, which is a reasonable thing for it to decline. So: the NDI path is
known to build and link, and is **not** known to put a frame on the network.
The Spout path cannot run at all until `send.c` is ported.

If you are the first person to run either, the interesting moments are
`NDIlib_send_create` returning non-NULL and a receiver actually finding the
source. Please send back whatever happens.

**Not measurable here: the frame rate the page can really manage.** The
bottleneck is the canvas readback, and this was developed in a container with
software OpenGL where the renderer itself runs at about 15 fps. The numbers
you get on a real GPU will be different and no claim is made about them. If
it is slow, lower the send width in the Out panel.

**The NDI SDK is licensed.** It is not committed here and must not be: get it
from Vizrt yourself and accept their agreement, which is yours to accept and
not this repository's to bundle.

## The wire format

One binary WebSocket message per frame: a 16-byte header, then tightly packed
RGBA8, top-left origin.

| bytes | |
|---|---|
| 0–3 | `SOUP` |
| 4 | version, currently 1 |
| 5 | format, 1 = RGBA8 |
| 6–7 | width, u16 LE |
| 8–9 | height, u16 LE |
| 10–13 | timestamp in ms, u32 LE |
| 14–15 | reserved |

Large messages arrive fragmented across continuation frames — Chromium splits
a 4 MB message — so the server reassembles before handing anything to a sink.
Getting that wrong is why the first version connected happily and delivered
nothing at all.

## Adding a sink

Implement `Sink` from `sink.h`: `open`, `frame`, `close`. Frames are RGBA8,
top-left origin, tightly packed; convert to whatever your API wants inside the
sink, because the page should not have to know.
