# Video on this site

The site is served by GitHub Pages, which has two hard facts behind everything here:

- A published site can be **at most 1 GB**, and bandwidth is soft-capped around
  100 GB/month.
- **Git LFS files are not served.** If you commit a video through LFS, visitors
  get the LFS pointer text instead of the video. It looks like it worked in the
  repo and is broken on the live site.

So masters never go in the repo. Instead each piece of work is split in two:

| | lives in | size | what it is |
|---|---|---|---|
| preview | `videos/previews/` in this repo | 200–600 KB | 2–4s silent loop, plays on hover |
| poster | `videos/posters/` in this repo | 50–200 KB | still frame, shows first |
| full | **external host**, referenced by URL | whatever you like | the real piece |

At ~500 KB a preview, a hundred works is ~50 MB — nowhere near the 1 GB limit.

## Adding work

1. **Reformat the footage for the web.** Do not upload straight off a phone —
   see [why](#why-reformatting-matters) below.

   ```
   node scripts/transcode-masters.mjs ~/path/to/your/footage
   ```

   Writes `dist/masters/*.mp4` (gitignored). `SIZE=720 CRF=23` to go smaller;
   `SIZE` caps the short edge, so vertical clips keep their full width.

2. **Make the previews and posters:**

   ```
   node scripts/make-previews.mjs dist/masters
   ```

   Writes both files per clip and prints ready-made `media.json` entries.
   `START=5 SECONDS=4 HEIGHT=360` tune where it samples and how big it gets.
   It detects vertical footage and sets `portrait: true` so the card goes tall.

3. **Upload** `dist/masters/*.mp4` to your host and copy each URL.

4. **Paste** the printed entries into `works` in `media.json`, filling in `full`
   with the URL, plus `title`, `blurb`, and `category`. Set `featured: true` on
   anything you want to surface in the box on the home page.

5. **Commit.** No HTML to touch — `index.html` renders whatever is in `media.json`.

## Why reformatting matters

Four things go wrong with footage used as it comes off a phone. Each was
reproduced and measured, and both scripts handle all four.

**HDR washout.** iPhones shoot 10-bit HEVC in BT.2020/PQ. Re-encode that to
H.264 without tone mapping and the HDR colour tags stay on 8-bit SDR data, so
browsers display it lifted and flat. Measured on the same clip, same bit depth:

| | luma avg | saturation avg | tags on output |
|---|---|---|---|
| plain re-encode | 126.3 | 114.3 | bt2020 / smpte2084 ← wrong |
| tone mapped | 80.6 | 145.0 | bt709 / bt709 |

**HEVC playback.** Safari plays HEVC; Chrome and Firefox largely do not. H.264
plays everywhere, which is the point of a web master.

**Embedded GPS.** Phone clips carry the coordinates where you filmed. A plain
re-encode carries them into the output — verified, and it even duplicates the
tag. Publishing the file would publish the location. All container metadata is
dropped instead.

**Slow start.** Without `-movflags +faststart` the index sits at the end of the
file, so the player downloads the whole thing before showing a frame.

If you would rather run ffmpeg yourself, this is what the script does per clip:

```
ffmpeg -i IN.MOV -map_metadata -1 -map 0:v:0 -map 0:a:0 \
  -vf "zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,\
       tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,\
       scale=-2:1080,format=yuv420p" \
  -c:v libx264 -profile:v high -level 4.1 -crf 20 -preset medium \
  -color_primaries bt709 -color_trc bt709 -colorspace bt709 \
  -c:a aac -b:a 160k -ac 2 -movflags +faststart OUT.mp4
```

Two things the script does that the snippet above cannot: it skips the three
`zscale`/`tonemap` filters when the source is already SDR (applying them to SDR
footage darkens it), and for vertical clips it uses `scale=1080:-2` instead, so
a 1080x1920 clip stays 1080x1920 rather than being squeezed to 608x1080.

## Where to host the masters

The site has its own player (the lightbox), and it only gets to use it when the
URL points at a plain `.mp4` file. Any of these give you that:

- **Cloudflare R2** — 10 GB free, and egress is free, which is the unusual part.
  Put it behind a custom domain and you get a plain URL. Best fit.
- **Bunny.net Storage + CDN** — pennies per GB, very fast, no free tier.
- **Backblaze B2 + Cloudflare** — cheap storage, free egress through Cloudflare.
- **S3 / DigitalOcean Spaces** — fine, you just pay for egress.

`transcode-masters.mjs` already produces exactly the format these want.

If you'd rather not deal with hosting, set `vimeo` or `youtube` to the video id
instead of `full`. Those cards open on that site rather than embedding a
third-party player in the page, which keeps the site's own look intact — the
trade-off is the visitor leaves.
