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

1. Make the previews and posters:

   ```
   node scripts/make-previews.mjs ~/path/to/your/masters
   ```

   It writes both files per master and prints ready-made `media.json` entries.
   `START=5 SECONDS=4 HEIGHT=360` tune where it samples and how big it gets.

2. Upload the masters to your host and copy each URL.

3. Paste the printed entries into `works` in `media.json`, filling in `full`
   with the URL, plus `title`, `blurb`, and `category`. Set `featured: true` on
   anything you want to surface in the box on the home page.

4. Commit. No HTML to touch — `index.html` renders whatever is in `media.json`.

## Where to host the masters

The site has its own player (the lightbox), and it only gets to use it when the
URL points at a plain `.mp4` file. Any of these give you that:

- **Cloudflare R2** — 10 GB free, and egress is free, which is the unusual part.
  Put it behind a custom domain and you get a plain URL. Best fit.
- **Bunny.net Storage + CDN** — pennies per GB, very fast, no free tier.
- **Backblaze B2 + Cloudflare** — cheap storage, free egress through Cloudflare.
- **S3 / DigitalOcean Spaces** — fine, you just pay for egress.

Encode masters as H.264 + AAC in MP4 (`-movflags +faststart`) so they start
playing before the whole file arrives, and keep them to 1080p unless there's a
reason not to.

If you'd rather not deal with hosting, set `vimeo` or `youtube` to the video id
instead of `full`. Those cards open on that site rather than embedding a
third-party player in the page, which keeps the site's own look intact — the
trade-off is the visitor leaves.
