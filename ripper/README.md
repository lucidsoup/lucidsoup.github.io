# ripper

Takes a URL, hands back its audio with the CORS headers a browser needs to read
it. The SP-404 converter uses it for the links it cannot fetch itself.

## Why this exists

Everything else on the converter runs in your browser, and that is the point of
it: nothing is uploaded, nothing is logged, there is no server to trust. This
one thing cannot work that way.

YouTube, SoundCloud, Bandcamp and the rest hand their audio out on short-lived
signed links, from hosts that send no `access-control-allow-origin`. A page
served from somewhere else may not read them. That is not a gap in the
converter; it is the rule every browser enforces, and no amount of JavaScript
gets round it.

There are two ways past it:

- **Record the tab while it plays.** The converter does this, with the **Rip**
  button. It needs `getDisplayMedia`, which exists only on desktop Chrome and
  Edge — not Firefox, not Safari, and on **no** browser on a phone. It also runs
  in real time: a four-minute track takes four minutes.
- **Ask something that is not a browser.** That is this.

With this running, every link works, on every browser and every phone, in
seconds rather than in real time.

## What it does

```
GET /health                      what is installed, and whether your key is right
GET /rip?url=<encoded>&format=   the audio
```

`format` is `m4a` (default), `mp3`, `flac` or `wav`. **m4a is the default on
purpose**: it is what the site already stored, so nothing is re-encoded, every
browser's `decodeAudioData` reads AAC, and it is a tenth the size of WAV over a
phone connection. The converter turns it into a WAV locally anyway. Ask for
`wav` or `flac` if you want the bytes lossless over the wire.

The reply carries `x-rip-title`, so the converter names the file after the
track rather than after the URL.

## Running it

```sh
docker build -t ripper .
docker run -p 8080:8080 \
  -e RIPPER_TOKEN=$(openssl rand -hex 24) \
  -e RIPPER_ORIGIN=https://www.lucidsoup.com \
  ripper
```

Or without Docker, if `yt-dlp` and `ffmpeg` are already on the box:

```sh
RIPPER_TOKEN=... RIPPER_ORIGIN=https://www.lucidsoup.com node server.mjs
```

### On Fly.io

`fly.toml` is here and already set to scale to zero, so it costs nothing while
nobody is sampling.

```sh
fly launch --no-deploy          # accept the existing fly.toml
fly secrets set RIPPER_TOKEN=$(openssl rand -hex 24)
fly secrets set RIPPER_ORIGIN=https://www.lucidsoup.com
fly deploy
```

Render, Railway, Koyeb and a Raspberry Pi all work the same way: it is one
container with no state and no database.

### Then

Open the converter, **Video → WAV**, and under the link box open **Audio
service**. Put in the address and the key, press **Check**. It should say which
yt-dlp it found. From then on, any link this browser cannot read goes there.

The address and key are kept in that browser's local storage. They are sent to
your service and nowhere else.

## Settings

| variable | default | |
|---|---|---|
| `PORT` | `8080` | |
| `RIPPER_TOKEN` | *(empty)* | Required key. **Set one** if the service is reachable from the internet; without it anyone who finds the URL can use your bandwidth. |
| `RIPPER_ORIGIN` | `*` | The site allowed to call it. Set it to yours. |
| `RIPPER_MAX_SECONDS` | `3600` | Longest clip it will fetch. |
| `RIPPER_MAX_CONCURRENT` | `2` | Rips at once; the rest get a 503 and can retry. |
| `RIPPER_TIMEOUT` | `600` | Seconds a single rip may take before it is killed. A download runs far faster than real time, so only something endless reaches this. |
| `RIPPER_MAX_SIZE` | `500M` | Passed to yt-dlp as `--max-filesize`. |
| `RIPPER_ALLOW_PRIVATE` | *(off)* | **Development only.** Lets it fetch private and loopback addresses — which is exactly what the guard below exists to prevent. |

Live streams are refused: there is no end to download. The converter takes
those itself — paste the station's `.pls`, `.m3u` or stream URL straight into
the page and press **Stop** when you have enough.

## What it will not do

It refuses anything that is not `http:` or `https:`, and it refuses private,
loopback, link-local and multicast addresses — so a URL handed to it cannot be
used to reach your cloud provider's metadata endpoint, your router, or anything
else that is only reachable from where the service runs. It holds nothing
between requests: each rip lands in a temporary directory that is deleted when
the response ends.

Keep `yt-dlp` current. Sites change what they serve, and an old yt-dlp is the
usual reason a link stops working:

```sh
docker build --no-cache -t ripper .     # or: pip install -U yt-dlp
```

## One more thing

What you rip is between you and whoever you are ripping from. YouTube's terms
do not permit downloading. This service does what you point it at; deciding
what to point it at is yours.
