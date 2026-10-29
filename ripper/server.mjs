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
import { mkdtemp, rm, readdir, stat } from 'node:fs/promises';
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

// m4a first and without re-encoding: YouTube's audio is already lossy, and
// every browser's decodeAudioData reads AAC. Re-encoding it to be decoded and
// re-encoded again is a generation of loss for nothing.
const FORMATS = {
  m4a:  { mime: 'audio/mp4',  ext: 'm4a'  },
  mp3:  { mime: 'audio/mpeg', ext: 'mp3'  },
  flac: { mime: 'audio/flac', ext: 'flac' },
  wav:  { mime: 'audio/wav',  ext: 'wav'  }
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

  if (running >= MAX_CONCURRENT) return json(res, 503, { error: 'Busy. Try again in a moment.' });
  running++;
  const dir = await mkdtemp(path.join(tmpdir(), 'rip-'));
  try {
    const meta = await run(YTDLP, ['--no-playlist', '--no-warnings', '--socket-timeout', '20',
                                   '--dump-single-json', target], { timeoutMs: 60000 });
    if (meta.code !== 0) {
      return json(res, 502, { error: firstLine(meta.err) || 'Could not read that link.' });
    }
    let info = {};
    try { info = JSON.parse(meta.out); } catch {}
    if (info.is_live) {
      return json(res, 400, { error: 'That is a live stream, which has no end to download. ' +
        'Paste it into the page instead \u2014 it takes streams directly, for as long as you let it.' });
    }
    const duration = Number(info.duration || 0);
    if (duration && duration > MAX_SECONDS) {
      return json(res, 413, { error: `That is ${Math.round(duration / 60)} minutes; this service is set to ${Math.round(MAX_SECONDS / 60)}.` });
    }

    const args = ['--no-playlist', '--no-warnings', '--socket-timeout', '20',
                  '--max-filesize', MAX_BYTES, '-f', 'bestaudio/best',
                  '-x', '--audio-format', want, '-o', path.join(dir, 'a.%(ext)s')];
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

    const files = (await readdir(dir)).filter(f => f.startsWith('a.'));
    if (!files.length) return json(res, 502, { error: 'Nothing came out of that link.' });
    const file = path.join(dir, files[0]);
    const size = (await stat(file)).size;

    res.writeHead(200, {
      'content-type': fmt.mime,
      'content-length': String(size),
      'content-disposition': `inline; filename="${safeName(info.title || 'audio')}.${fmt.ext}"`,
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
