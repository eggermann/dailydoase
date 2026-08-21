#!/usr/bin/env node
// A semantic-stream iteration which never hands the printed artwork to a
// redraw model. Every visible poster pixel comes from the source file; the
// stream only selects a small, composited kinetic treatment.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { getWordStreams } from '../../semantic-stream.js';
import { buildCollisionSourceCueRecords } from '../../lib/generator/adapter/shorty-book/source-cues.js';

const root = resolve(import.meta.dirname, '..', '..');
const folder = 'cnak-garten-golum-poster-magic-16x9-local-011-title-reveal-source-pixels-only';
const output = join(root, 'GENERATIONS-CNAK-KINETIC-MODEL-LOCAL', folder);
const poster = process.env.CNAK_POSTER_SOURCE || join(root, 'lib', 'Plak-2_images', 'page-1.jpg');
const configuredWords = [['Department store', 'en'], ['Horror', 'en'], ['Art exhibition', 'en']];
if (!existsSync(poster)) throw new Error(`Poster missing: ${poster}`);
mkdirSync(output, { recursive: true });

const streams = await getWordStreams(configuredWords, { forceRefresh: true });
const [cue] = await buildCollisionSourceCueRecords({ streams, sceneCount: 1 });
const semanticKey = `${cue.anchor.term}|${cue.collision.term}|${cue.collision.description || ''}`;
const cueHash = createHash('sha256').update(semanticKey).digest();
const effect = ['slow sickly eye pulse', 'single dim eye blink', 'quiet green root-line shimmer'][cueHash[0] % 3];

// Source is 352×650. This exact scale gives a complete, uncropped 16:9 card.
// A plain black matte is the only non-poster region; it never changes.
const eyeGlow = join(output, 'eye-glow-source-pixel-safe.png');
execFileSync('magick', [
  '-size', '1280x720', 'xc:none', '-fill', '#e8ff55b0',
  '-draw', 'ellipse 622,378 13,8 0,360 ellipse 681,378 13,8 0,360',
  '-blur', '0x11', eyeGlow,
], { stdio: 'inherit' });

const title = join(output, 'original-title-source-pixels-only.png');
const titleMask = join(output, 'title-mask.png');
// The title layer is a literal crop of the printed source, never generated
// text. The first half shows the illustrated poster without its headline;
// then the exact original lettering grows back into its printed place.
execFileSync('magick', [poster, '-crop', '352x65+0+0', '+repage', '-resize', '390x72', title], { stdio: 'inherit' });
execFileSync('magick', ['-size', '1280x720', 'xc:none', '-fill', 'black', '-draw', 'rectangle 445,0 834,72', titleMask], { stdio: 'inherit' });

const video = join(output, 'poster-semantic-source-pixels-only-16x9.mp4');
const filter = [
  '[0:v]scale=390:720:flags=lanczos,setsar=1[poster]',
  '[1:v][poster]overlay=445:0:format=auto[base]',
  '[2:v]format=rgba,fade=t=out:st=3.15:d=1.35:alpha=1[mask]',
  '[base][mask]overlay=0:0:format=auto[headline-hidden]',
  '[3:v]format=rgba,fade=t=in:st=3.15:d=1.35:alpha=1[title]',
  '[headline-hidden][title]overlay=445:0:format=auto[title-reveal]',
  '[4:v]format=rgba,fade=t=in:st=4.55:d=0.28:alpha=1,fade=t=out:st=5.25:d=0.28:alpha=1[glow]',
  '[title-reveal][glow]overlay=0:0:format=auto[out]',
].join(';');
execFileSync('ffmpeg', [
  '-y', '-loop', '1', '-i', poster,
  '-f', 'lavfi', '-i', 'color=c=black:s=1280x720:r=24:d=6',
  '-loop', '1', '-i', titleMask,
  '-loop', '1', '-i', title,
  '-loop', '1', '-i', eyeGlow,
  '-filter_complex', filter, '-map', '[out]', '-t', '6', '-r', '24',
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', video,
], { stdio: 'inherit' });

const sha256 = createHash('sha256').update(readFileSync(video)).digest('hex');
writeFileSync(join(output, 'semantic-plan.json'), `${JSON.stringify({
  configuredWords,
  cue,
  semanticKey,
  effect,
  rendering: 'source-pixels-only: original poster plus empty black 16:9 matte; the exact source-pixel title is hidden, then revealed; a masked eye-light overlay follows',
  posterSha256: createHash('sha256').update(readFileSync(poster)).digest('hex'),
  video,
}, null, 2)}\n`);
writeFileSync(join(output, 'result.json'), `${JSON.stringify({ file: video, sha256, width: 1280, height: 720, durationSeconds: 6 }, null, 2)}\n`);
console.log(JSON.stringify({ file: video, cue, effect, sha256 }, null, 2));
