#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..', '..');
const folder = process.env.CNAK_FOLDER || 'CNAK-formen-der-abweichung-garten-golum-kinetic-001';
const output = resolve(process.env.CNAK_OUTPUT_DIR || join(root, 'tmp', folder));
const preferred = [
  join(root, 'lib', 'Plak-2_images', '9-16-Insta-Reel.jpg'),
  join(root, 'lib', 'Plak-2_images', '9-16-Insta2-Reel.jpg'),
];
// These are current repository's only complete, printed Garten-Golum posters.
const fallback = join(root, 'lib', 'Plak-2_images', 'page-1.jpg');
const source = process.env.CNAK_POSTER_SOURCE
  ? resolve(process.env.CNAK_POSTER_SOURCE)
  : preferred.find(existsSync) || fallback;

if (!existsSync(source)) throw new Error(`Poster missing. Set CNAK_POSTER_SOURCE. Checked: ${[...preferred, fallback].join(', ')}`);

const run = (bin, args) => execFileSync(bin, args, { stdio: 'inherit' });
const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

for (const dir of ['source', 'video', 'preview', 'metadata']) mkdirSync(join(output, dir), { recursive: true });
const copiedPoster = join(output, 'source', basename(source));
copyFileSync(source, copiedPoster);

const glow = join(output, 'eye-glow.png');
// page-1 coordinates scaled to 1080×1920: both eyes are local, soft overlays only.
run('magick', ['-size', '1080x1920', 'xc:none', '-fill', '#fff36b', '-draw', 'circle 441,981 491,981 circle 625,981 675,981', '-blur', '0x22', glow]);

const video = join(output, 'video', 'formen-der-abweichung-kinetic-v001.mp4');
// Main frame is always original poster. Dark title cover is temporary; exact original title crop returns at its original coordinates.
const filter = [
  '[0:v]scale=1039:1920,pad=1080:1920:20:0:black,setsar=1[poster]',
  '[poster]drawbox=x=20:y=45:w=1040:h=180:color=0x1b130c@1:enable=\'between(t,0,5.5)\'[covered]',
  '[0:v]crop=352:68:0:12,scale=1039:201,format=rgba,fade=t=in:st=3.5:d=2:alpha=1[title]',
  '[1:v]format=rgba,fade=t=in:st=1.5:d=0.22:alpha=1,fade=t=out:st=2.18:d=0.22:alpha=1[glow]',
  '[covered][glow]overlay=0:0:enable=\'between(t,1.5,2.4)\'[eyes]',
  '[eyes][title]overlay=20:35:enable=\'between(t,3.5,5.5)\'[out]',
].join(';');
run('ffmpeg', ['-y', '-loop', '1', '-i', copiedPoster, '-loop', '1', '-i', glow, '-filter_complex', filter, '-map', '[out]', '-t', '7.5', '-r', '24', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', video]);

const frame = (name, time) => run('ffmpeg', ['-y', '-ss', String(time), '-i', video, '-frames:v', '1', '-update', '1', join(output, 'preview', name)]);
frame('first-frame.jpg', 0.2);
frame('eye-motion-frame.jpg', 1.9);
frame('typography-motion-frame.jpg', 4.5);
frame('final-frame.jpg', 7.1);

const metadata = {
  project: 'Formen der Abweichung',
  experiment: 'Garten-Golum kinetic poster',
  folder,
  sourcePoster: source,
  sourceSelection: preferred.includes(source) ? 'requested canonical filename' : 'repository fallback: page-1.jpg, complete printed Garten-Golum poster',
  video: 'video/formen-der-abweichung-kinetic-v001.mp4',
  width: 1080,
  height: 1920,
  durationSeconds: 7.5,
  generatorCalls: 0,
  posterSha256: sha256(copiedPoster),
  videoSha256: sha256(video),
  createdAt: new Date().toISOString(),
};
writeFileSync(join(output, 'metadata', 'generation.json'), `${JSON.stringify(metadata, null, 2)}\n`);
console.log(JSON.stringify({ output, source, video, ...metadata }, null, 2));
