/**
 * lucidsoup ripper — the server half of "take the audio from any URL".
 *
 * A browser cannot do this. Sites that matter keep their audio behind
 * short-lived signed URLs on hosts that share nothing with other origins, and
 * no amount of JavaScript on a static page gets past that. Recording the tab
 * works, but only on desktop Chrome and Edge, and only in real time. On a
 * phone there is no route at all.
 *
 * So: one endpoint. Give it a URL, it hands back audio with the CORS headers
 * the page needs to read it. yt-dlp does the extracting, ffmpeg the converting
 * when a conversion is actually wanted.
 *
 *   GET  /health            what is installed, and whether it works
 *   GET  /rip?url=…&format= the audio
 *
 * Run it yourself. It is deliberately small enough to read in one sitting.
 */
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdtemp, rm, readdir, stat, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import dns from 'node:dns/promises';
import net from 'node:net';

const PORT = Number(process.env.PORT || 8080);
const TOKEN = process.env.RIPPER_TOKEN || '';          // empty = open; set one if it faces the internet
const ORIGIN = process.env.RIPPER_ORIGIN || '*';
const MAX_SECONDS = Number(process.env.RIPPER_MAX_SECONDS || 3600);
const MAX_CONCURRENT = Number(process.env.RIPPER_MAX_CONCURRENT || 2);
// A download runs far faster than real time, so this is only ever hit by
// something that is not going to end. is_live catches the streams that say so;
// plenty do not, and a plain endless MP3 looks like an ordinary file until you
// try to reach the end of it.
const TIMEOUT = Number(process.env.RIPPER_TIMEOUT || 600);
const MAX_BYTES = process.env.RIPPER_MAX_SIZE || '500M';
// Development only. With it set, the service will fetch from the network it
// is running in — which is the whole thing the check below exists to stop.
// Never set it on anything reachable from outside.
const ALLOW_PRIVATE = process.env.RIPPER_ALLOW_PRIVATE === '1';
const YTDLP = process.env.YTDLP || 'yt-dlp';
const FFMPEG = process.env.FFMPEG || 'ffmpeg';

// m4a is the default, and it is *selected* rather than converted. YouTube
// serves the same track as both AAC (itag 140) and Opus (251); asking for
// "bestaudio" picks one on bitrate and then --audio-format m4a re-encodes it
// if it picked the Opus. Measured on a 3:33 track: selecting the AAC takes
// 3.6s and 3.4MB; taking bestaudio and converting takes 14.5s and 9.0MB, and
// what comes out is a 338kbps re-encode of a 129kbps Opus — slower, fatter,
// and a generation of loss worse than the 128kbps AAC that was there all
// along. The other formats are real requests for a conversion and still get
// one.
const FORMATS = {
  m4a:  { mime: 'audio/mp4',  ext: 'm4a',  convert: false },
  mp3:  { mime: 'audio/mpeg', ext: 'mp3',  convert: true  },
  flac: { mime: 'audio/flac', ext: 'flac', convert: true  },
  wav:  { mime: 'audio/wav',  ext: 'wav',  convert: true  }
};

// What came out, rather than what was asked for: with no AAC on offer the
// selector falls back to whatever the site does have, and labelling an Opus
// webm as audio/mp4 would be a lie the browser then has to see through.
const MIME_BY_EXT = {
  m4a: 'audio/mp4', mp4: 'audio/mp4', aac: 'audio/aac',
  webm: 'audio/webm', opus: 'audio/ogg', ogg: 'audio/ogg', oga: 'audio/ogg',
  mp3: 'audio/mpeg', flac: 'audio/flac', wav: 'audio/wav', m4b: 'audio/mp4'
};

let running = 0;

const json = (res, code, body, extra = {}) => {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', ...cors(), ...extra });
  res.end(JSON.stringify(body));
};
const cors = () => ({
  'access-control-allow-origin': ORIGIN,
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-expose-headers': 'x-rip-title, x-rip-duration, content-disposition, content-length',
  'vary': 'origin'
});

function run(cmd, args, opts = {}) {
  // Always with a deadline. A live stream has no end, and a yt-dlp left
  // pointed at one holds a slot for ever.
  const { timeoutMs = 0, ...rest } = opts;
  return new Promise((resolve) => {
    const p = spawn(cmd, args, rest);
    let out = '', err = '', timer = 0;
    if (timeoutMs) timer = setTimeout(() => {
      err += `\ntimed out after ${Math.round(timeoutMs / 1000)}s`;
      try { p.kill('SIGKILL'); } catch {}
    }, timeoutMs);
    p.stdout.on('data', d => { out += d; });
    p.stderr.on('data', d => { err += d; });
    p.on('error', e => { clearTimeout(timer); resolve({ code: -1, out, err: String(e) }); });
    p.on('close', code => { clearTimeout(timer); resolve({ code, out, err }); });
  });
}

/**
 * Nothing on the far side of this should be able to make the service fetch
 * something only the service can reach — its own metadata endpoint, a printer,
 * whatever else is on the network it runs in.
 */
async function publicUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { return 'That is not a URL.'; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return 'Only http and https.';
  const host = u.hostname.replace(/^\[|\]$/g, '');
  let addrs = [];
  try {
    addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
  } catch { return 'That host does not resolve.'; }
  if (!ALLOW_PRIVATE) {
    for (const { address } of addrs) if (isPrivate(address)) return 'That address is not reachable from here.';
  }
  return null;
}
function isPrivate(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 ||
           (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
           (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const s = ip.toLowerCase();
  return s === '::' || s === '::1' || s.startsWith('fe80') || s.startsWith('fc') ||
         s.startsWith('fd') || s.startsWith('::ffff:');
}

const PLAYLIST_TYPES = /scpls|mpegurl|xspf|ms-asf|ms-wax|pls\+xml/;

/**
 * A glance at what is on the other end, before committing to a download:
 * { endless } for media with no length, { playlist } for a .pls or .m3u,
 * {} for everything else, including anything that would not answer.
 */
async function probeTarget(url) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 8000);
  try {
    // A ranged GET rather than HEAD. The headers are all this needs and they
    // arrive immediately; the body is dropped. HEAD looks tidier and is not
    // dependable — a server that streams forever may simply never finish
    // answering one, which is the exact case being tested for.
    const r = await fetch(url, {
      method: 'GET', redirect: 'follow', signal: ac.signal,
      headers: { range: 'bytes=0-1' }
    });
    try { await r.body?.cancel(); } catch {}
    const type = (r.headers.get('content-type') || '').toLowerCase().split(';')[0].trim();
    const len = r.headers.get('content-length');
    const icy = r.headers.get('icy-name') || r.headers.get('icy-br');
    if (!r.ok) return {};                           // let yt-dlp give the real error
    if (PLAYLIST_TYPES.test(type)) return { playlist: true };
    if (len) return {};                             // it ends somewhere
    if (icy) return { endless: type || 'a stream' };
    // A playlist is audio/x-scpls or audio/x-mpegurl: an audio type by name,
    // a few lines of text in fact, and the thing it points at is what gets
    // judged on its own terms a moment later.
    if (PLAYLIST_TYPES.test(type)) return { playlist: true };
    if (/^(audio|video)\//.test(type)) return { endless: type };
    return {};                                      // html, json, anything else: not ours to judge
  } catch {
    return {};                                      // refused or timed out: carry on regardless
  } finally {
    clearTimeout(timer);
    ac.abort();                                     // never leave the body running
  }
}

async function health(keyOk) {
  const [y, f] = await Promise.all([run(YTDLP, ['--version']), run(FFMPEG, ['-version'])]);
  return {
    ok: y.code === 0 && f.code === 0,
    // Health stays readable without a key, so you can tell "down" from
    // "wrong key" — but it says which of those you are looking at.
    keyOk: keyOk,
    ytdlp: y.code === 0 ? y.out.trim() : null,
    ffmpeg: f.code === 0 ? (f.out.split('\n')[0] || '').trim() : null,
    formats: Object.keys(FORMATS),
    maxSeconds: MAX_SECONDS,
    needsToken: !!TOKEN
  };
}

async function rip(req, res, u) {
  const target = u.searchParams.get('url') || '';
  const want = (u.searchParams.get('format') || 'm4a').toLowerCase();
  const fmt = FORMATS[want];
  if (!fmt) return json(res, 400, { error: `format must be one of ${Object.keys(FORMATS).join(', ')}` });

  const bad = await publicUrl(target);
  if (bad) return json(res, 400, { error: bad });

  // An endless stream has no duration for the filter below to catch and no
  // end for the download to reach, so it would sit here burning a slot until
  // the timeout. One HEAD tells it apart in a few hundred milliseconds: media
  // served with no length is a stream. A YouTube watch page answers text/html
  // and is not caught by this; a plain .mp3 answers with a length and is not
  // either.
  const seen = await probeTarget(target);
  if (seen.endless) {
    return json(res, 400, { error: 'That looks like a live stream: it is ' + seen.endless +
      ' with no length, so there is no end to download. Paste it into the page instead ' +
      '\u2014 that takes streams directly, for as long as you let it.' });
  }
  if (seen.playlist) {
    return json(res, 400, { error: 'That is a playlist rather than audio. Paste it into the ' +
      'page instead \u2014 it follows a .pls or .m3u to the stream behind it and takes that.' });
  }

  if (running >= MAX_CONCURRENT) return json(res, 503, { error: 'Busy. Try again in a moment.' });
  running++;
  const dir = await mkdtemp(path.join(tmpdir(), 'rip-'));
  try {
    // One pass, not two. The separate --dump-single-json cost 3.4s of a 7s
    // request just to learn a title and a duration it was about to fetch
    // again. --match-filter applies the same two guards after yt-dlp has the
    // metadata and before it downloads a byte, and --write-info-json leaves
    // the title behind on the way past.
    // The ? matters: a direct link to a media file has no duration in its
    // metadata, and without it the comparison fails rather than passes, so
    // every plain .wav and .mp3 was turned away as "too long".
    const filter = `!is_live & duration<?${MAX_SECONDS}`;
    const args = ['--no-playlist', '--no-warnings', '--socket-timeout', '20',
                  '--max-filesize', MAX_BYTES, '--match-filter', filter,
                  '--write-info-json', '--no-write-playlist-metafiles',
                  '-f', fmt.convert ? 'bestaudio/best' : 'bestaudio[ext=m4a]/bestaudio/best',
                  '-o', path.join(dir, 'a.%(ext)s')];
    if (fmt.convert) args.push('-x', '--audio-format', want);
    if (want === 'mp3') args.push('--audio-quality', '0');
    args.push(target);                       // left off once, and every rip 400'd
    const got = await run(YTDLP, args, { timeoutMs: TIMEOUT * 1000 });
    if (got.code !== 0) {
      const timedOut = /timed out after/.test(got.err);
      return json(res, timedOut ? 504 : 502, {
        error: timedOut
          ? 'That did not finish in ' + TIMEOUT + ' seconds. If it is a live stream, paste it ' +
            'into the page instead \u2014 that takes streams directly, for as long as you let it.'
          : (firstLine(got.err) || 'Could not get the audio.')
      });
    }

    const all = await readdir(dir);
    let info = {};
    const infoFile = all.find(f => f.endsWith('.info.json'));
    if (infoFile) {
      try { info = JSON.parse(await readFile(path.join(dir, infoFile), 'utf8')); } catch {}
    }
    const files = all.filter(f => f.startsWith('a.') && !f.endsWith('.info.json'));
    if (!files.length) {
      // yt-dlp exits 0 when a filter turns something away, so no file and no
      // error is the one place those two guards now report from.
      if (/has not passed filter|does not pass filter/i.test(got.out + got.err)) {
        return json(res, 413, { error: 'That is either a live stream or longer than ' +
          Math.round(MAX_SECONDS / 60) + ' minutes, and this service takes neither. ' +
          'A live stream can be taken in the page itself.' });
      }
      return json(res, 502, { error: 'Nothing came out of that link.' });
    }
    const file = path.join(dir, files[0]);
    const size = (await stat(file)).size;
    const ext = (files[0].split('.').pop() || '').toLowerCase();
    const mime = MIME_BY_EXT[ext] || fmt.mime;
    const duration = Number(info.duration || 0);

    res.writeHead(200, {
      'content-type': mime,
      'content-length': String(size),
      'content-disposition': `inline; filename="${safeName(info.title || 'audio')}.${ext || fmt.ext}"`,
      'x-rip-title': encodeURIComponent(info.title || ''),
      'x-rip-duration': String(duration || ''),
      'cache-control': 'no-store',
      ...cors()
    });
    await new Promise((done) => {
      const s = createReadStream(file);
      s.pipe(res);
      s.on('close', done);
      s.on('error', done);
      res.on('close', done);
    });
  } catch (e) {
    if (!res.headersSent) json(res, 500, { error: String(e && e.message || e) });
  } finally {
    running--;
    rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

const firstLine = s => String(s || '').split('\n').map(x => x.trim())
  .filter(x => x && !/^\[/.test(x)).pop() || '';
const safeName = s => String(s).replace(/[^\w \-.]+/g, '_').slice(0, 60).trim() || 'audio';

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') { res.writeHead(204, cors()); return res.end(); }
  const given = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') ||
                u.searchParams.get('key') || '';
  const keyOk = !TOKEN || given === TOKEN;
  if (u.pathname === '/health') return json(res, 200, await health(keyOk));
  if (u.pathname !== '/rip') return json(res, 404, { error: 'Try /health or /rip?url=…' });
  if (req.method !== 'GET') return json(res, 405, { error: 'GET only.' });
  if (!keyOk) return json(res, 401, { error: 'Wrong key.' });
  return rip(req, res, u);
}).listen(PORT, () => console.log(`ripper on :${PORT}  token ${TOKEN ? 'required' : 'NOT set'}` +
    (ALLOW_PRIVATE ? '  PRIVATE ADDRESSES ALLOWED — development only' : '')));
