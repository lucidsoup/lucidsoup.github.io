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

It prints the one address to open. The token is in it; without the token the
WebSocket is refused, and only loopback is ever listened on.

### NDI

The SDK is a **licensed download from Vizrt**, not a package:
<https://ndi.video/for-developers/ndi-sdk/>. You also need the NDI runtime,
which is a separate install.

```sh
make ndi NDI_SDK="/path/to/NDI SDK"
./soupsend --sink ndi --name "LucidSoup"
```

### Spout — Windows only

```
cl /std:c++17 /EHsc /DHAVE_SPOUT send.c sha1.c sink_test.c sink_spout.cpp ^
   /I path\to\Spout2\SPOUTSDK\SpoutDirectX\SpoutDX ^
   SpoutDX.lib d3d11.lib dxgi.lib ws2_32.lib
soupsend.exe --sink spout --name "LucidSoup"
```

## What has actually been tested, and what has not

Be clear-eyed about this before trusting it on a show.

**Verified, on Linux, end to end:** the page is served, the WebSocket upgrades
(handshake checked against RFC 6455's own worked example), frames arrive whole
at the size asked for, and **the pixel the page sends is the pixel that
arrives** — matched by timestamp, so channel order and orientation are proven
rather than assumed. A wrong token is refused; another site's origin is
refused; only loopback is bound. The server sustains **539 MB/s — 138 fps at
1280×800** against a synthetic client.

**Not verified:** `sink_ndi.c` and `sink_spout.cpp` have **never been through a
compiler**. The SDK could not be downloaded and Spout cannot exist on Linux.
The shape is right and the calls come from each SDK's own headers, but expect
to fix something the first time you build either, and please send back what.

**Not measurable here:** the frame rate the page can actually manage. The
bottleneck is the canvas readback, and this was developed in a container with
software OpenGL where the renderer itself runs at about 15 fps. The numbers
you get on a real GPU will be different and no claim is made about them. If it
is slow, lower the send width in the Out panel — fewer pixels read back is the
only lever that matters.

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
