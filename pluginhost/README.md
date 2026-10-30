# pluginhost

Your own CLAP and VST3 plugins, running on your machine, played in your browser.

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
| | `~/.vst3`, `/usr/lib/vst3`, `/usr/local/lib/vst3` |
| macOS | `~/Library/Audio/Plug-Ins/CLAP`, `/Library/Audio/Plug-Ins/CLAP` |
| | `~/Library/Audio/Plug-Ins/VST3`, `/Library/Audio/Plug-Ins/VST3` |
| anywhere | every path in `CLAP_PATH` and `VST3_PATH`, and every `--scan PATH` |

```sh
./pluginhost --scan ~/Downloads/some-plugin.clap
./pluginhost --scan /my/plugins --port 9000 --verbose
```

Scanning opens each plugin, reads its descriptors and closes it again. That
means a plugin that crashes on load takes the scanner with it — run with
`--verbose` and the last path printed is the one that did it, then start again
without that folder.

## Two formats, and the one that is missing

- **CLAP** is a pure C ABI in MIT-licensed headers, with no SDK to download and
  no licence to agree to. It was first for that reason, not because it is the
  most common format.
- **VST3** works too, and more easily than its reputation suggests. The main
  VST3 SDK is C++ and dual-licensed GPLv3 / proprietary, which would be both a
  dependency and a licence decision — but Steinberg also publish
  [vst3_c_api](https://github.com/steinbergmedia/vst3_c_api), a **single header
  under a BSD 3-clause licence** that describes the same ABI in plain C. That is
  what `vst3_backend.c` is written against, so VST3 costs this project one more
  file and no licence entanglement at all.
- **Audio Units** are the one still missing. They are macOS-only, want
  Objective-C and `AudioToolbox`, and cannot be compiled or tested anywhere but
  a Mac — so that one has to be built and proven on your machine rather than
  guessed at from a Linux container.

Everything above the backends is format-blind: the scan, the render protocol and
the page never learn which kind a plugin is, beyond printing a label.

### What differs between the two, and is hidden from you

- **Parameters.** CLAP gives plain values with their own range. VST3 normalises
  everything to 0..1 and keeps the real number private, surfacing it only as
  display text. The page gets a range and a value either way.
- **Categories.** VST3 writes `Fx|Delay`; CLAP writes a list. Both arrive as the
  same comma-separated vocabulary.
- **Clearing a tail.** CLAP has `reset()`. VST3 has nothing of the kind, so the
  plugin is switched inactive and active again between renders, which is the
  supported way and is what stops one render's reverb opening the next.
- **The controller.** A VST3 plugin's audio and its parameter names often live
  in two different objects, sometimes two different classes that have to be
  introduced to each other by hand. Both arrangements are tested.

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

The suite builds two plugins that exist to be measured rather than listened to:
`test/gainplug.clap` and `test/gainvst.vst3`. Both compute
`out = in[n-64] * gain + offset` and both declare those 64 frames of latency —
one through `clap.latency`, one through `getLatencySamples()` — so a correct host
hands back the input **bit for bit** at unity gain. An off-by-one in the delay
compensation, a planar/interleaved mix-up, or a parameter that never reached the
plugin all show up as a failure instead of as something that merely sounds
plausible.

The same block of assertions runs against both formats, because the point of the
backend split is that a plugin's format stops mattering the moment it loads. The
VST3 fixture publishes **two** effects on purpose: one object that is its own
edit controller, and one component that names a separate controller class — the
arrangement most commercial plugins use, and the path a host is likelier to get
wrong. 78 checks in all, plus a format-swap test that catches one backend
leaving buffers behind when the other takes over.

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

Neither set of headers is vendored here. `make` fetches both, each pinned to a
tag in the `Makefile`:

- **CLAP** — MIT, by Alexandre Bique and contributors,
  [free-audio/clap](https://github.com/free-audio/clap).
- **VST3 C API** — BSD 3-clause, Steinberg Media Technologies GmbH,
  [steinbergmedia/vst3_c_api](https://github.com/steinbergmedia/vst3_c_api).
  VST3 is a trademark of Steinberg Media Technologies GmbH.
