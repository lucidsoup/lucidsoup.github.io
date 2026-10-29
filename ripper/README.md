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

`format` is `m4a` (default), `mp3`, `flac` or `wav`.

**m4a is the default, and it is *selected* rather than converted.** YouTube
serves the same track twice — AAC as itag 140, Opus as 251. Asking for
`bestaudio` picks one on bitrate and then converting to m4a re-encodes it if it
picked the Opus. Measured on a 3:33 track:

| | time | size | what comes out |
|---|---|---|---|
| `bestaudio` + convert to m4a | 14.5s | 9.0 MB | 338 kbps AAC, re-encoded from 129 kbps Opus |
| `bestaudio[ext=m4a]`, untouched | **3.6s** | **3.4 MB** | 128 kbps AAC, exactly as served |

Slower, fatter, and a generation of loss worse, for nothing. So the AAC is
asked for by name and passed through. `mp3`, `flac` and `wav` are real requests
for a conversion and still get one.

The reply's `content-type` describes what actually came out, not what was asked
for: with no AAC on offer the selector falls back to whatever the site does
have, and labelling an Opus webm as `audio/mp4` would be a lie the browser then
has to see through.

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

### From this repository, with one secret

`.github/workflows/deploy-ripper.yml` deploys this folder to Fly on every push
that touches it. It does nothing and stays green until you give it somewhere to
go:

```sh
flyctl auth signup                                   # or log in
flyctl tokens create deploy -a vst-library
```

Paste that token into **Settings → Secrets and variables → Actions** as
`FLY_API_TOKEN`. Add `RIPPER_TOKEN` (a key for the service) and `RIPPER_ORIGIN`
(`https://www.lucidsoup.com`) there too, or the service runs open to anyone who
finds its URL. Then run the workflow — the summary prints the address to paste
into **Audio service**.

### On Fly.io, by hand

`fly.toml` is here and set up for something used in bursts and idle the rest of
the time:

- `auto_stop_machines = "suspend"` with `min_machines_running = 0`. Suspend
  keeps the machine's memory, so it comes back in about a second rather than
  booting the container again, and costs nothing while it is down. That is the
  reason to pick Fly for this over anything that cold-starts.
- `kill_timeout = "120s"`, because a rip is one long request and the default
  five seconds would cut one in half whenever a deploy landed mid-download.
- Concurrency limits that match `RIPPER_MAX_CONCURRENT`, so the edge does not
  accept fifty rips the service will only turn away.

**Change `primary_region`** to the city nearest you. After the cold start it is
the biggest thing between pressing Fetch and hearing the clip, and the `lhr` in
there is a guess. `fly platform regions` lists them.

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
| `RIPPER_TOKEN` | *(empty)* | Required key. Leave it empty for a service the site uses on everyone's behalf — a key everybody has is not a key. Set one for a private instance. |
| `RIPPER_ORIGIN` | `*` | The site allowed to call it. Set it to yours. |
| `RIPPER_REQUIRE_ORIGIN` | `1` | Enforce that origin server-side, not just in a CORS header. `0` turns the check off. |
| `RIPPER_RATE_PER_HOUR` | `30` | Clips per hour **per address**. `0` for no limit. |
| `RIPPER_RATE_TOTAL_PER_HOUR` | `200` | Clips per hour **across everyone**, so one afternoon cannot eat the day. `0` for no limit. |
| `RIPPER_RATE_TOTAL_PER_DAY` | `300` | Clips per day across everyone. **This is the one that decides the bill.** `0` for no limit. |
| `RIPPER_MAX_SECONDS` | `3600` | Longest clip it will fetch. |
| `RIPPER_MAX_CONCURRENT` | `2` | Rips at once; the rest get a 503 and can retry. |
| `RIPPER_TIMEOUT` | `600` | Seconds a single rip may take before it is killed. A download runs far faster than real time, so only something endless reaches this. |
| `RIPPER_MAX_SIZE` | `500M` | Passed to yt-dlp as `--max-filesize`. |
| `RIPPER_ALLOW_PRIVATE` | *(off)* | **Development only.** Lets it fetch private and loopback addresses — which is exactly what the guard below exists to prevent. |

Before committing to a download it takes one ranged GET and reads the headers,
which costs a few hundred milliseconds and tells it two things:

- **a live stream** — media with no `content-length` — is refused, because
  there is no end to download. The converter takes those itself: paste the
  station's URL straight into the page and press **Stop** when you have enough.
- **a playlist** — `.pls`, `.m3u` — is refused for the same reason, with a
  pointer back to the page, which follows one to the stream behind it.

HEAD would be tidier and is not dependable: a server that streams forever may
never finish answering one, which is the exact case being tested for.

## Running it without a key

A service that exists so nobody has to sign in cannot ask them for a key: one
that is in the page is public, and one that is not makes everybody set it up.
So the instance this site ships with has no `RIPPER_TOKEN`, and two other
things hold it together instead:

- **The origin is enforced here, not just announced.** A CORS header is advice
  a browser chooses to follow. `RIPPER_REQUIRE_ORIGIN` makes the service check
  the `Origin` — which a browser sends on a cross-origin GET and a page cannot
  forge — and answer 403 to anything else. `curl` sends none at all, and gets
  the same 403.
- **Each address gets 30 clips an hour, and the service gives out 200.** The
  first number is what any one abuser costs; the second is what everyone
  together costs, which is the number that reaches the bill. Without the second
  the first bounds a share of an unbounded total. Both are counted in memory and
  forgotten when the machine suspends, which is the right amount of memory for
  this. Past either it is 429 with a pointer at this folder, because anyone who
  wants more than that wants their own copy.

### What a cap is worth, in money

A clip off YouTube is about 3.4 MB, and bandwidth is the cost that matters —
the machine itself is only awake for the few seconds a rip takes. So the daily
cap converts straight into a worst case:

| clips/day | GB/month | at $0.02/GB |
|---|---|---|
| 100 | 10 | ~$0.20 |
| 200 | 20 | ~$0.40 |
| 300 | 30 | ~$0.61 |
| 500 | 50 | ~$1.01 |

Those are worst cases, not forecasts: they assume someone pins the cap every
day of the month. Real use rounds to nothing. There is also a small fixed cost
for the stored image whether anyone uses it or not, so "scales to zero" means
pennies rather than nothing at all.

**Set a spending limit on the organisation as well.** Rate limits live in a
process that restarts and forgets; a spending limit does not, and it is the
only cap that cannot be reasoned around.

Be honest with yourself about what the origin check buys: it stops other
websites, whose browsers will not let them forge an `Origin`, and it stops
anyone who has not thought about it. It does not stop
`curl -H 'origin: https://www.lucidsoup.com'`. The rate limits are what actually
bound the cost, so set them to numbers you would not mind paying for, and set a
spending limit on the Fly organisation as well — that is the only cap that
cannot be reasoned around.

Neither is cryptography and neither pretends to be. Together they are enough
that a public endpoint costs its owner roughly what its own users cost.

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
