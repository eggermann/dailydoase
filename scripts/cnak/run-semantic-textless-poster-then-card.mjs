#!/usr/bin/env node
// Semantic Stream drives the moving, text-free opening. The ending is a
// literal original-poster card, so WAN can never corrupt exhibition details.
import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import OpenAI from 'openai';
import { getWordStreams } from '../../semantic-stream.js';
import { buildCollisionSourceCueRecords } from '../../lib/generator/adapter/shorty-book/source-cues.js';
import {
  imagePathToDataUrl,
  resolveRunwareKey,
  saveRunwareVideoResult,
  submitRunwareVideoJob,
} from '../../lib/generator/image-video/runware/common.js';

const root = resolve(import.meta.dirname, '..', '..');
const folder = 'cnak-garten-golum-semantic-textless-opening-then-original-card-012';
const output = join(root, 'GENERATIONS-CNAK-KINETIC-MODEL-LOCAL', folder);
const textlessPoster = join(root, 'scripts', 'cnak', 'assets', 'garten-golum-no-text-v001.png');
const originalPoster = process.env.CNAK_POSTER_SOURCE || join(root, 'lib', 'Plak-2_images', 'page-1.jpg');
const configuredWords = [['Department store', 'en'], ['Horror', 'en'], ['Art exhibition', 'en']];
for (const file of [textlessPoster, originalPoster]) if (!existsSync(file)) throw new Error(`Required poster missing: ${file}`);
if (!process.env.OPENAI_API_KEY) throw new Error('Missing OPENAI_API_KEY.');
if (!resolveRunwareKey()) throw new Error('Missing RUNWARE_API_KEY (or RUNWARE_KEY).');
mkdirSync(output, { recursive: true });

const streams = await getWordStreams(configuredWords, { forceRefresh: true });
const [cue] = await buildCollisionSourceCueRecords({ streams, sceneCount: 1 });
const semanticContext = `${cue.anchor.term} → ${cue.collision.term}; ${cue.collision.description || ''}`;
const planner = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const response = await planner.chat.completions.create({
  model: 'gpt-4.1-mini-2025-04-14',
  temperature: 0.55,
  response_format: { type: 'json_object' },
  messages: [
    { role: 'system', content: 'Return JSON only: {"motion":"..."}. Plan one subtle four-second magic action inside a text-free Garten-Golum illustration. No typography, camera move, new figure, or location.' },
    { role: 'user', content: `Semantic Stream cue: ${semanticContext}. Use it as a causal mood, not literal signage. Keep one expressive event: eyes, flower-lamps, roots, or light may move.` },
  ],
});
let semanticMotion = '';
try { semanticMotion = JSON.parse(response.choices[0]?.message?.content || '{}').motion || ''; } catch {}
if (!semanticMotion) semanticMotion = 'The yellow eyes blink once while a sickly department-store lamp glow slowly travels through the roots.';

const openingStage = join(output, 'textless-opening-16x9.png');
const finalCard = join(output, 'original-poster-card-16x9.png');
for (const [source, target] of [[textlessPoster, openingStage], [originalPoster, finalCard]]) {
  execFileSync('magick', [source, '-resize', 'x720', '-background', 'black', '-gravity', 'center', '-extent', '1280x720', target], { stdio: 'inherit' });
}

const providerPrompt = [
  '16:9 landscape. Animate only the supplied text-free Garten-Golum illustration, kept sharp and centered in its neutral black matte.',
  `Semantic Stream motion: ${semanticMotion}`,
  'Dirty botanical horror, restrained and pictorial: a single blink or a slow pulse of lamp-light through existing roots. Static camera, one continuous moment.',
  'Preserve the exact Golem face, leaf ears, roots, flowers, lamps, hand-drawn colored-pencil texture, composition, and black matte.',
  'No words, letters, signs, typography, new character, room, cutaway, camera movement, action scene, 3D, redraw, collage, or transformation.',
].join(' ');
const payload = {
  frameImages: [{ frame: 'first', image: await imagePathToDataUrl(openingStage) }],
  prompt: providerPrompt,
  durationSeconds: 4,
  resolution: '720p',
  providerSettings: { alibaba: { audio: false, promptExtend: false } },
};
writeFileSync(join(output, 'semantic-plan.json'), `${JSON.stringify({ configuredWords, cue, semanticMotion, providerPrompt, textlessPoster, originalPoster }, null, 2)}\n`);
const result = await submitRunwareVideoJob({ apiKey: resolveRunwareKey(), model: 'alibaba:wan@2.6-flash', ...payload });
const opening = await saveRunwareVideoResult({ imageDir: output, filePrefix: 'semantic-textless-opening-wan26-flash', model: 'alibaba:wan@2.6-flash', payload, result, targetDurationSeconds: 4, targetFps: 24 });

const finalVideo = join(output, 'semantic-poster-opening-then-original-card-16x9.mp4');
execFileSync('ffmpeg', [
  '-y', '-i', opening.file, '-loop', '1', '-i', finalCard,
  '-filter_complex', '[0:v]trim=duration=4,setpts=PTS-STARTPTS[opening];[1:v]trim=duration=2,setpts=PTS-STARTPTS,fade=t=in:st=0:d=0.7[card];[opening][card]concat=n=2:v=1:a=0[out]',
  '-map', '[out]', '-r', '24', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', finalVideo,
], { stdio: 'inherit' });
const sha256 = createHash('sha256').update(readFileSync(finalVideo)).digest('hex');
writeFileSync(join(output, 'result.json'), `${JSON.stringify({ file: finalVideo, sha256, width: 1280, height: 720, durationSeconds: 6, openingFile: opening.file }, null, 2)}\n`);
console.log(JSON.stringify({ file: finalVideo, sha256, cue, semanticMotion }, null, 2));
