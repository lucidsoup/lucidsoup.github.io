#!/usr/bin/env node
// Turn a folder of master videos into web-sized previews and posters.
//
//   node scripts/make-previews.mjs ~/path/to/masters
//
// For each master it writes:
//   videos/previews/<name>.mp4   a 3s silent loop, ~480p, a few hundred KB
//   videos/posters/<name>.jpg    a still frame
//
// Those two are small enough to commit. The master itself never enters the
// repo: GitHub Pages caps a published site at 1GB and does not serve Git LFS
// files, so the full video belongs on external storage. Upload the masters
// wherever you like and put the resulting URL in media.json as "full".
//
// Needs ffmpeg on PATH (brew install ffmpeg / apt install ffmpeg).
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';

const run = promisify(execFile);
const SRC = process.argv[2];
const START = process.env.START || '0';     // seconds into the master to sample
const SECONDS = process.env.SECONDS || '3';
const HEIGHT = process.env.HEIGHT || '480';

if (!SRC) {
  console.error('usage: node scripts/make-previews.mjs <folder-of-videos>');
  console.error('  START=5 SECONDS=4 HEIGHT=540 node scripts/make-previews.mjs ~/footage');
  process.exit(1);
}

try {
  await run('ffmpeg', ['-version']);
} catch {
  console.error('ffmpeg not found on PATH. Install it first (brew install ffmpeg).');
  process.exit(1);
}

const VIDEO = /\.(mp4|mov|m4v|webm|avi|mkv)$/i;
const files = fs.readdirSync(SRC).filter(f => VIDEO.test(f));
if (!files.length) {
  console.error('No video files found in ' + SRC);
  process.exit(1);
}

fs.mkdirSync('videos/previews', { recursive: true });
fs.mkdirSync('videos/posters', { recursive: true });

const slug = (name) =>
  path.parse(name).name.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'clip';

// Vertical footage gets a tall card instead of being letterboxed into 16:9.
async function isPortrait(src) {
  try {
    const { stdout } = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height', '-of', 'csv=p=0', src]);
    const [w, h] = stdout.trim().split(',').map(Number);
    return Number.isFinite(w) && Number.isFinite(h) && h > w;
  } catch {
    return false;
  }
}

const entries = [];
let totalKb = 0;
for (const file of files) {
  const name = slug(file);
  const src = path.join(SRC, file);
  const preview = `videos/previews/${name}.mp4`;
  const poster = `videos/posters/${name}.jpg`;
  process.stdout.write(`${file} -> ${name} … `);
  try {
    // Silent, short, even dimensions (H.264 requires them), faststart so it
    // begins playing before the whole file arrives.
    await run('ffmpeg', ['-y', '-ss', START, '-t', SECONDS, '-i', src,
      '-an', '-vf', `scale=-2:${HEIGHT}`, '-c:v', 'libx264', '-profile:v', 'main',
      '-crf', '30', '-preset', 'slow', '-movflags', '+faststart', preview]);
    await run('ffmpeg', ['-y', '-ss', START, '-i', src, '-frames:v', '1',
      '-vf', `scale=-2:720`, '-q:v', '4', poster]);
    const kb = Math.round(fs.statSync(preview).size / 1024);
    console.log(`${kb} KB`);
    if (kb > 900) console.log(`   (large for a preview — try HEIGHT=360 or SECONDS=2)`);
    totalKb += kb + Math.round(fs.statSync(poster).size / 1024);
    const entry = {
      id: name, title: path.parse(file).name, blurb: '', category: 'concert',
      preview, poster, full: '', featured: false
    };
    if (await isPortrait(src)) entry.portrait = true;
    entries.push(entry);
  } catch (err) {
    console.log('FAILED');
    console.error('   ' + String(err.stderr || err.message).split('\n').slice(-2).join(' '));
  }
}

console.log(`\nDone: ${entries.length} of ${files.length}, ${(totalKb / 1024).toFixed(1)} MB added to the repo.`);
console.log('(GitHub Pages serves up to 1GB in total, so previews this size leave plenty of room.)');
console.log('Paste these into the "works" array in media.json, then set "full" on each');
console.log('to the URL of the master once you have uploaded it:\n');
console.log(JSON.stringify(entries, null, 2));
