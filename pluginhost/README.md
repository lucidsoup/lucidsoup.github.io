# pluginhost

Your own CLAP plugins, running on your machine, played in your browser.

```sh
cd pluginhost
make
./pluginhost
```

It prints an address. Open it. Pick a plugin, drop a sound on it, move the
knobs, hear the result, save a WAV.

## The thing you cannot get around

**A browser cannot load a `.clap`, a `.vst3` or a `.component`.** Those are
native shared libraries. There is no browser API that will `dlopen` one, there
is no flag, and there is no clever way round it — the sandbox exists precisely
to stop a web page running native code off your disk. Anything claiming to run
your plugin collection *inside* a tab is either running something else
(a web-native plugin, which is not your plugin) or has a local program doing the
real work and is not telling you.

So this is the local program. It loads the plugin; the browser does the
listening and the knobs.

## Why it serves the page itself

The obvious design — a page on `www.lucidsoup.com` talking to a helper on
`127.0.0.1` — is the one that breaks, and it breaks worst on Safari:

- **Safari refuses it outright.** WebKit will not load an `http://` subresource
  into an `https://` document, deliberately departing from the spec's exemption
  for loopback addresses. The request dies as mixed content before it is sent.
- **Chrome 142 began asking permission.** Its new Local Network Access prompt
  gates a public site reaching `127.0.0.1`, replacing the old Private Network
  Access preflight.

Serve the page from the same program that answers the audio calls and all of
that simply does not arise: one origin, no mixed content, no permission prompt,
no CORS, and the same behaviour in Safari, Chrome and Firefox. `page.html` in
this folder *is* the page you get at `127.0.0.1`.

## What it does

```
GET  /                     the page, with a fresh token baked into it
GET  /api/health           what is loaded
GET  /api/plugins          everything the scan found
GET  /api/params?id=…      a plugin's ports and its parameters
POST /api/render           audio in, audio out
```

Rendering is offline, not a live stream, and that is a deliberate choice rather
than a shortcut. A plugin renders far faster than real time, so a selection
comes back in a fraction of its own length; the page re-renders as you move a
slider and you hear the change in about a tenth of a second. Streaming live
audio through a socket would add latency and dropouts to buy nothing, and for
the thing this is actually for — auditioning an effect on a sample and keeping
the good version — rendering is simply better. You get a WAV at the end rather
than a performance you have to capture.

Two details that are easy to get wrong and are handled here:

- **Latency is compensated.** A plugin with lookahead declares its latency, and
  its output arrives that many frames late. The render runs long by that much
  and drops the head, so what comes back lines up with what went in instead of
  being quietly shifted. `test/suite.mjs` holds this to a bit-exact standard.
- **Parameters settle before the audio starts.** Silence is fed in first so a
  plugin's parameter smoothing lands on the value you asked for, rather than
  gliding up to it audibly across the first few milliseconds.

## Where it looks for plugins

| | |
|---|---|
| Linux | `~/.clap`, `/usr/lib/clap`, `/usr/local/lib/clap` |
| macOS | `~/Library/Audio/Plug-Ins/CLAP`, `/Library/Audio/Plug-Ins/CLAP` |
| anywhere | every path in `CLAP_PATH`, and every `--scan PATH` you pass |

```sh
./pluginhost --scan ~/Downloads/some-plugin.clap
./pluginhost --scan /my/plugins --port 9000 --verbose
```

Scanning opens each plugin, reads its descriptors and closes it again. That
means a plugin that crashes on load takes the scanner with it — run with
`--verbose` and the last path printed is the one that did it, then start again
without that folder.

## CLAP first, and what that leaves out

This hosts **CLAP**, and only CLAP, today. That is a real limitation and worth
stating plainly rather than burying:

- **CLAP** is a pure C ABI in MIT-licensed headers, with no SDK to download and
  no licence to agree to. `make` fetches the headers and compiles one file.
  That is why it is first — not because it is the most common format.
- **VST3** is a genuine next step, not a nicety. Its ABI is COM-like and needs
  C++ and Steinberg's SDK, which is dual-licensed GPLv3 / proprietary — so it is
  a few hundred lines of real work plus a licence decision about distribution.
  Nothing about the design here blocks it: the scan, the protocol and the page
  do not care what format produced the audio.
- **Audio Units** are macOS-only, want Objective-C and `AudioToolbox`, and
  cannot be compiled or tested anywhere but a Mac. That one has to be built and
  proven on your machine, not in a Linux container.

If a plugin you own ships a CLAP build as well — many now do — it works today.

## Is this safe to run?

It loads native code from your own disk, which is exactly what any DAW does, and
the care taken is proportionate:

- **It listens on `127.0.0.1` only.** There is no flag to change that.
- **Every API call needs a token**, fresh on each start and substituted into the
  page as it is served, so it never reaches the address bar, your history, or a
  referer header.
- **A foreign `Origin` is refused.** Another website, in your browser, cannot
  drive it even if it guesses the port.
- **Lengths off the socket are checked before anything is read through them.**

It holds nothing between requests and writes nothing to disk.

## Tests

```sh
make test
```

The suite builds `test/gainplug.clap` — a CLAP plugin that exists to be measured
rather than listened to. It computes `out = in[n-64] * gain + offset` and
declares those 64 frames through `clap.latency`, so a correct host hands back
the input **bit for bit** at gain 1. An off-by-one in the delay compensation, a
planar/interleaved mix-up, or a parameter that never reached the plugin all show
up as a failure instead of as something that merely sounds plausible. 35 checks
cover the scan, the descriptors, the parameters, the rendering, the refusals and
the page.

## Options

| | |
|---|---|
| `--port N` | listen on `127.0.0.1:N` (default 7777) |
| `--scan PATH` | also scan this folder, or load this one `.clap` |
| `--page FILE` | serve this `page.html` |
| `--token TOK` | use this token instead of a fresh random one |
| `--no-open` | do not try to open a browser |
| `-v` | log what each plugin says |

## Credits

The CLAP headers are by Alexandre Bique and contributors, MIT licensed, fetched
at build time from [free-audio/clap](https://github.com/free-audio/clap) and
pinned to a tag in the `Makefile`. Nothing is vendored into this repository.
