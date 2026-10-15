#!/usr/bin/env node
// Turn camera/phone footage into web-ready masters you can upload.
//
//   node scripts/transcode-masters.mjs ~/path/to/footage
//
// Writes dist/masters/<name>.mp4 — not in the repo, because masters never go in
// the repo (see videos/README.md). Upload those, then run
// scripts/make-previews.mjs on the same folder to get the committable previews.
//
// What this fixes that a plain re-encode does not:
//
//   HDR.  iPhones shoot 10-bit HEVC in BT.2020/PQ. Re-encoding to H.264 without
//         tone mapping leaves the HDR colour tags on 8-bit SDR data, so browsers
//         show it lifted and desaturated — the washed-out, milky look. This tone
//         maps properly and retags as BT.709.
//   HEVC. Safari plays HEVC; Chrome and Firefox largely do not. H.264 plays
//         everywhere, which is the whole point of a web master.
//   GPS.  Phone clips embed the coordinates where you filmed. A plain re-encode
//         carries them through, so publishing the file publishes the location.
//         All container metadata is dropped.
//   Start. Without +faststart the player waits for the entire file before the
//         first frame. The index is moved to the front instead.
//
// Env knobs: SIZE (default 1080) caps the SHORT edge, so 1080 means 1920x1080
//              landscape or 1080x1920 vertical — vertical footage keeps its
//              full width instead of being shrunk to fit a height.
//            CRF (23, lower = better/bigger), PRESET (medium), ABR (160k),
//              FPS (unset = keep source).
//
// Re-encoding an already-compressed file costs quality (generation loss), so the
// output can come out LARGER than the input at a low CRF while looking no better.
// Feed this the original camera files where you can, not an export of an export.
// It warns when a file grows.
//
// Needs ffmpeg and ffprobe on PATH (brew install ffmpeg / apt install ffmpeg).
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';

const run = promisify(execFile);
const SRC = process.argv[2];
const OUT = process.argv[3] || 'dist/masters';
const SIZE = Number(process.env.SIZE || process.env.HEIGHT || 1080);
const CRF = process.env.CRF || '23';
const PRESET = process.env.PRESET || 'medium';
const ABR = process.env.ABR || '160k';
const FPS = process.env.FPS || '';

if (!SRC) {
  console.error('usage: node scripts/transcode-masters.mjs <folder-of-footage> [outdir]');
  console.error('  SIZE=720 CRF=26 node scripts/transcode-masters.mjs ~/footage');
  process.exit(1);
}
if (!fs.existsSync(SRC) || !fs.statSync(SRC).isDirectory()) {
  console.error(SRC + ' is not a folder.');
  process.exit(1);
}
for (const bin of ['ffmpeg', 'ffprobe']) {
  try {
    await run(bin, ['-version']);
  } catch {
    console.error(bin + ' not found on PATH. Install ffmpeg first (brew install ffmpeg).');
    process.exit(1);
  }
}

const VIDEO = /\.(mp4|mov|m4v|webm|avi|mkv|mts|m2ts)$/i;
const files = fs.readdirSync(SRC).filter(f => VIDEO.test(f) && !f.startsWith('.')).sort();
if (!files.length) {
  console.error('No video files found in ' + SRC);
  process.exit(1);
}

const slug = (name) =>
  path.parse(name).name.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'clip';

const mb = (bytes) => (bytes / 1048576).toFixed(1);

async function probe(src) {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,codec_name,pix_fmt,color_transfer,color_primaries,duration',
    '-of', 'json', src]);
  const s = (JSON.parse(stdout).streams || [])[0] || {};
  // Both HDR transfer functions in the wild: PQ (HDR10, what iPhones use) and HLG.
  const hdr = s.color_transfer === 'smpte2084' || s.color_transfer === 'arib-std-b67';
  return {
    width: Number(s.width) || 0,
    height: Number(s.height) || 0,
    codec: s.codec_name || '?',
    tenBit: /10|12/.test(s.pix_fmt || ''),
    hdr,
    transfer: s.color_transfer || 'unset',
    seconds: Number(s.duration) || 0
  };
}

async function hasAudio(src) {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-select_streams', 'a',
    '-show_entries', 'stream=index', '-of', 'csv=p=0', src]);
  return stdout.trim().length > 0;
}

// PQ/HLG -> linear light -> BT.709 primaries -> tone map -> BT.709 transfer.
// Done in float so the tone map has headroom to work in.
const TONEMAP = 'zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,' +
                'tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv';

fs.mkdirSync(OUT, { recursive: true });

let inBytes = 0, outBytes = 0, done = 0;
const results = [];

for (const file of files) {
  const src = path.join(SRC, file);
  const name = slug(file);
  const dst = path.join(OUT, name + '.mp4');
  const info = await probe(src);
  const audio = await hasAudio(src);
  const srcBytes = fs.statSync(src).size;

  const notes = [info.codec, info.width + 'x' + info.height];
  if (info.hdr) notes.push('HDR ' + info.transfer + ' -> SDR');
  if (info.tenBit) notes.push('10-bit -> 8-bit');
  process.stdout.write(`${file}  (${notes.join(', ')}, ${mb(srcBytes)} MB)\n  -> ${name}.mp4 … `);

  // Scale only downward, capping the short edge so vertical footage keeps its
  // full width, and to even dimensions — H.264 requires them.
  const chain = [];
  if (info.hdr) chain.push(TONEMAP);
  const vertical = info.height > info.width;
  const shortEdge = vertical ? info.width : info.height;
  if (shortEdge > SIZE) chain.push(vertical ? `scale=${SIZE}:-2` : `scale=-2:${SIZE}`);
  chain.push('format=yuv420p');

  const args = ['-y', '-i', src,
    // Drop container metadata wholesale: GPS, device name, and anything else
    // the camera wrote. A plain re-encode would carry it into the published file.
    '-map_metadata', '-1',
    '-map', '0:v:0'];
  if (audio) args.push('-map', '0:a:0');
  args.push('-vf', chain.join(','));
  if (FPS) args.push('-r', FPS);
  args.push(
    '-c:v', 'libx264', '-profile:v', 'high', '-level', '4.1',
    '-crf', CRF, '-preset', PRESET, '-pix_fmt', 'yuv420p',
    // Retag as plain BT.709 so no player guesses at the colour space.
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
    // Index at the front, so playback starts before the file finishes arriving.
    '-movflags', '+faststart'
  );
  if (audio) args.push('-c:a', 'aac', '-b:a', ABR, '-ac', '2');
  args.push(dst);

  try {
    await run('ffmpeg', args, { maxBuffer: 1 << 26 });
    const got = fs.statSync(dst).size;
    inBytes += srcBytes; outBytes += got; done++;
    console.log(`${mb(got)} MB`);
    if (got > srcBytes) {
      console.log(`  note: bigger than the source. CRF ${CRF} is spending more bits than`);
      console.log(`  it was encoded with. Try CRF=26 or a smaller SIZE if that is not wanted.`);
    }
    results.push({ name, bytes: got, seconds: info.seconds });
  } catch (err) {
    console.log('FAILED');
    console.error('  ' + String(err.stderr || err.message).trim().split('\n').slice(-2).join('\n  '));
  }
}

console.log(`\n${done} of ${files.length} converted.`);
if (done) {
  console.log(`${mb(inBytes)} MB in -> ${mb(outBytes)} MB out, written to ${OUT}/`);

  const secs = results.reduce((a, r) => a + (r.seconds || 0), 0);
  if (secs > 0) {
    const perMin = outBytes / 1048576 / (secs / 60);
    console.log(`That is about ${perMin.toFixed(1)} MB per minute at these settings.`);
  }

  // Short pieces can simply live in the repo, which skips hosting entirely —
  // but git keeps every version of a binary forever, so re-encodes accumulate.
  const totalMb = outBytes / 1048576;
  if (totalMb < 300) {
    console.log(`\nAt ${mb(outBytes)} MB these are small enough to commit directly:`);
    console.log('  mkdir -p videos/full && cp ' + OUT + '/*.mp4 videos/full/');
    console.log('  then set "full": "videos/full/<name>.mp4" in media.json.');
    console.log('  No host needed. See videos/README.md for when to stop doing that.');
  } else {
    console.log(`\n${mb(outBytes)} MB is past the point where committing these is wise`);
    console.log('(git keeps every version forever). Upload them to a host instead.');
  }

  console.log('\nNext:');
  console.log(`  1. Either copy into videos/full/, or upload ${OUT}/*.mp4 and copy the URLs.`);
  console.log(`  2. node scripts/make-previews.mjs ${OUT}`);
  console.log('  3. Paste the printed entries into media.json and fill in "full".');
}
