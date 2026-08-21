#!/usr/bin/env node
// A real Semantic Stream micro-story confined to supplied poster artwork.
// WAN animates the motif below the title; exact source typography is composited
// back above every generated frame, then the supplied names card ends the film.
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
const folder = 'cnak-garten-golum-semantic-poster-story-then-real-names-card-014';
const output = join(root, 'GENERATIONS-CNAK-KINETIC-MODEL-LOCAL', folder);
const openingPoster = join(root, 'scripts', 'cnak', 'assets', '9-16-Insta-Reel.jpg');
const namesCard = join(root, 'scripts', 'cnak', 'assets', '9-16-Insta2-Reel.jpg');
const configuredWords = [['Department store', 'en'], ['Horror', 'en'], ['Art exhibition', 'en']];
for (const file of [openingPoster, namesCard]) if (!existsSync(file)) throw new Error(`Required supplied artwork missing: ${file}`);
if (!process.env.OPENAI_API_KEY) throw new Error('Missing OPENAI_API_KEY.');
if (!resolveRunwareKey()) throw new Error('Missing RUNWARE_API_KEY (or RUNWARE_KEY).');
mkdirSync(output, { recursive: true });

const streams = await getWordStreams(configuredWords, { forceRefresh: true });
const [cue] = await buildCollisionSourceCueRecords({ streams, sceneCount: 1 });
const semanticCue = `${cue.anchor.term} → ${cue.collision.term}; ${cue.collision.description || ''}`;
const planner = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const planned = await planner.chat.completions.create({
  model: 'gpt-4.1-mini-2025-04-14',
  temperature: 0.65,
  response_format: { type: 'json_object' },
  messages: [
    { role: 'system', content: 'Return JSON only: {"physicalRule":"...","beats":["...","...","..."]}. Plan one four-second silent micro-story inside a printed Garten-Golum poster. Its existing lamps, flowers, face, leaf ears, roots, and yellow light can act. No typography, new object, camera move, cut, new location, or creature redesign.' },
    { role: 'user', content: `Semantic collision: ${semanticCue}. Make the collision cause a concrete poster-only event with escalation, reaction, and unresolved consequence. Use visual language, not literal signs or words.` },
  ],
});
let story = {};
try { story = JSON.parse(planned.choices[0]?.message?.content || '{}'); } catch {}
const physicalRule = story.physicalRule || 'The lamps behave as one searching department-store scanner: their beams converge on the Golem and cause the roots to wake.';
const beats = Array.isArray(story.beats) && story.beats.length >= 3 ? story.beats.slice(0, 3) : [
  'The flower-lamps swing inward and send a searching yellow beam through the leaves.',
  'The Golem notices the scan; its eyes narrow as the roots recoil, then pulse outward.',
  'The lamps hold on the face while one root line points downward, leaving a charged unresolved trace.',
];

const rawStage = join(output, 'opening-raw-16x9.png');
const modelStage = join(output, 'opening-title-protected-for-wan-16x9.png');
const titleLayer = join(output, 'exact-original-title-layer.png');
const namesStage = join(output, 'real-names-card-16x9.png');
execFileSync('magick', [openingPoster, '-resize', 'x720', '-background', 'black', '-gravity', 'center', '-extent', '1280x720', rawStage], { stdio: 'inherit' });
// The title lives in the top 124px of the centered portrait. Hide that area
// from WAN; it is composited from the literal source in the final movie.
execFileSync('magick', [rawStage, '-fill', '#f4ede3', '-draw', 'rectangle 437,0 842,124', modelStage], { stdio: 'inherit' });
execFileSync('magick', [openingPoster, '-crop', '1800x552+0+0', '+repage', '-resize', '405x124', titleLayer], { stdio: 'inherit' });
execFileSync('magick', [namesCard, '-resize', 'x720', '-background', 'black', '-gravity', 'center', '-extent', '1280x720', namesStage], { stdio: 'inherit' });

const providerPrompt = [
  '16:9 landscape. Animate the supplied hand-drawn Garten-Golum poster illustration below its blank top margin. Keep its portrait composition fixed and sharp in the neutral black matte.',
  `Semantic physical rule: ${physicalRule}`,
  `Four-second progression: first ${beats[0]}; then ${beats[1]}; finally ${beats[2]}.`,
  'Dirty poetic botanical horror. Motion is visible and causal, but small enough to remain a printed-poster miracle: lamp beams, flowers, leaf ears, eyes, and root lines may move.',
  'Preserve exact colored-pencil marks, face, leaf ears, green body, roots, flowers, lamps, white paper and black matte. Static camera, one continuous shot.',
  'No readable text, letters, sign, barcode, new character, new object, new room, cutaway, zoom, pan, 3D, collage, glossy repaint, or transformation.',
].join(' ');
const payload = {
  frameImages: [{ frame: 'first', image: await imagePathToDataUrl(modelStage) }],
  prompt: providerPrompt,
  durationSeconds: 4,
  resolution: '720p',
  providerSettings: { alibaba: { audio: false, promptExtend: false } },
};
writeFileSync(join(output, 'semantic-plan.json'), `${JSON.stringify({ configuredWords, cue, semanticCue, physicalRule, beats, providerPrompt, openingPoster, namesCard }, null, 2)}\n`);
const result = await submitRunwareVideoJob({ apiKey: resolveRunwareKey(), model: 'alibaba:wan@2.6-flash', ...payload });
const generated = await saveRunwareVideoResult({ imageDir: output, filePrefix: 'semantic-poster-story-wan26-flash', model: 'alibaba:wan@2.6-flash', payload, result, targetDurationSeconds: 4, targetFps: 24 });

const finalVideo = join(output, 'semantic-poster-story-then-real-names-card-16x9.mp4');
const filter = [
  '[0:v]trim=duration=4,setpts=PTS-STARTPTS[animated]',
  '[1:v]format=rgba,setpts=PTS-STARTPTS[title]',
  '[animated][title]overlay=437:0:format=auto[story]',
  '[2:v]trim=duration=2,setpts=PTS-STARTPTS,fade=t=in:st=0:d=0.7[card]',
  '[story][card]concat=n=2:v=1:a=0[out]',
].join(';');
execFileSync('ffmpeg', [
  '-y', '-i', generated.file, '-loop', '1', '-t', '4', '-i', titleLayer, '-loop', '1', '-t', '2', '-i', namesStage,
  '-filter_complex', filter, '-map', '[out]', '-t', '6', '-r', '24', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', finalVideo,
], { stdio: 'inherit' });
const sha256 = createHash('sha256').update(readFileSync(finalVideo)).digest('hex');
writeFileSync(join(output, 'result.json'), `${JSON.stringify({ file: finalVideo, sha256, width: 1280, height: 720, durationSeconds: 6, generatedOpening: generated.file }, null, 2)}\n`);
console.log(JSON.stringify({ file: finalVideo, sha256, cue, physicalRule, beats }, null, 2));
