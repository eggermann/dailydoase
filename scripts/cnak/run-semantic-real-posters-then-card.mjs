#!/usr/bin/env node
// Semantic Stream chooses the motion, but both visible artworks are exact
// supplied campaign files. This avoids AI rewriting any exhibition typography.
import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import OpenAI from 'openai';
import { getWordStreams } from '../../semantic-stream.js';
import { buildCollisionSourceCueRecords } from '../../lib/generator/adapter/shorty-book/source-cues.js';

const root = resolve(import.meta.dirname, '..', '..');
const folder = 'cnak-garten-golum-real-posters-semantic-opening-then-names-card-013';
const output = join(root, 'GENERATIONS-CNAK-KINETIC-MODEL-LOCAL', folder);
const openingPoster = join(root, 'scripts', 'cnak', 'assets', '9-16-Insta-Reel.jpg');
const namesCard = join(root, 'scripts', 'cnak', 'assets', '9-16-Insta2-Reel.jpg');
const configuredWords = [['Department store', 'en'], ['Horror', 'en'], ['Art exhibition', 'en']];
for (const file of [openingPoster, namesCard]) if (!existsSync(file)) throw new Error(`Required supplied artwork missing: ${file}`);
if (!process.env.OPENAI_API_KEY) throw new Error('Missing OPENAI_API_KEY.');
mkdirSync(output, { recursive: true });

const streams = await getWordStreams(configuredWords, { forceRefresh: true });
const [cue] = await buildCollisionSourceCueRecords({ streams, sceneCount: 1 });
const planner = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const response = await planner.chat.completions.create({
  model: 'gpt-4.1-mini-2025-04-14',
  temperature: 0.4,
  response_format: { type: 'json_object' },
  messages: [
    { role: 'system', content: 'Return JSON only: {"effect":"eyes"|"lamps"|"roots","motion":"..."}. Choose one subtle, four-second kinetic effect for a printed Garten-Golum poster.' },
    { role: 'user', content: `Semantic Stream cue: ${cue.anchor.term} → ${cue.collision.term}. Context: ${cue.collision.description || ''}. The effect must be small, pictorial, and cannot alter any artwork or typography.` },
  ],
});
let plan = {};
try { plan = JSON.parse(response.choices[0]?.message?.content || '{}'); } catch {}
const effect = ['eyes', 'lamps', 'roots'].includes(plan.effect) ? plan.effect : 'eyes';
const semanticMotion = plan.motion || 'A quiet sickly light pulse passes through the Garten-Golum motif.';

const openingStage = join(output, 'real-opening-16x9.png');
const namesStage = join(output, 'real-names-card-16x9.png');
for (const [source, target] of [[openingPoster, openingStage], [namesCard, namesStage]]) {
  execFileSync('magick', [source, '-resize', 'x720', '-background', 'black', '-gravity', 'center', '-extent', '1280x720', target], { stdio: 'inherit' });
}

const overlays = {
  eyes: ['#efff66ad', 'ellipse 603,397 14,9 0,360 ellipse 657,397 14,9 0,360'],
  lamps: ['#ffe77088', 'ellipse 552,210 22,15 0,360 ellipse 636,219 22,15 0,360 ellipse 721,235 22,15 0,360'],
  roots: ['#86ff53a0', 'ellipse 630,602 70,21 0,360'],
};
const [color, shape] = overlays[effect];
const glow = join(output, `${effect}-semantic-glow.png`);
execFileSync('magick', ['-size', '1280x720', 'xc:none', '-fill', color, '-draw', shape, '-blur', '0x14', glow], { stdio: 'inherit' });

const finalVideo = join(output, 'semantic-real-posters-opening-then-names-card-16x9.mp4');
const filter = [
  '[0:v]setpts=PTS-STARTPTS[opening]',
  '[1:v]format=rgba,fade=t=in:st=1.8:d=0.45:alpha=1,fade=t=out:st=2.75:d=0.45:alpha=1[glow]',
  '[opening][glow]overlay=0:0:format=auto[motion]',
  '[2:v]setpts=PTS-STARTPTS,fade=t=in:st=0:d=0.7[card]',
  '[motion][card]concat=n=2:v=1:a=0[out]',
].join(';');
execFileSync('ffmpeg', [
  '-y', '-loop', '1', '-t', '4', '-i', openingStage,
  '-loop', '1', '-t', '4', '-i', glow,
  '-loop', '1', '-t', '2', '-i', namesStage,
  '-filter_complex', filter, '-map', '[out]', '-t', '6', '-r', '24', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', finalVideo,
], { stdio: 'inherit' });

const sha256 = createHash('sha256').update(readFileSync(finalVideo)).digest('hex');
writeFileSync(join(output, 'semantic-plan.json'), `${JSON.stringify({ configuredWords, cue, effect, semanticMotion, openingPoster, namesCard, rendering: 'source-pixels-only supplied poster sequence' }, null, 2)}\n`);
writeFileSync(join(output, 'result.json'), `${JSON.stringify({ file: finalVideo, sha256, width: 1280, height: 720, durationSeconds: 6 }, null, 2)}\n`);
console.log(JSON.stringify({ file: finalVideo, sha256, cue, effect, semanticMotion }, null, 2));
