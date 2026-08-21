#!/usr/bin/env node
// One art-led Semantic Stream poster story: FLUX makes a painterly bridge from
// the supplied drawing, WAN animates it, and source-pixel typography returns.
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
  saveRunwareImageResult,
  saveRunwareVideoResult,
  submitRunwareImageTask,
  submitRunwareVideoJob,
} from '../../lib/generator/image-video/runware/common.js';

const root = resolve(import.meta.dirname, '..', '..');
const folder = 'cnak-garten-golum-art-semantic-flux-wan-names-015';
const output = join(root, 'GENERATIONS-CNAK-KINETIC-MODEL-LOCAL', folder);
const openingPoster = join(root, 'scripts', 'cnak', 'assets', '9-16-Insta-Reel.jpg');
const namesCard = join(root, 'scripts', 'cnak', 'assets', '9-16-Insta2-Reel.jpg');
const configuredWords = [['Art exhibition', 'en'], ['Department store', 'en'], ['Horror', 'en']];
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
  temperature: 0.7,
  response_format: { type: 'json_object' },
  messages: [
    { role: 'system', content: 'Return JSON only: {"transformation":"...","beats":["...","...","..."]}. Direct a four-second poetic micro-story inside a hand-drawn Garten-Golum exhibition poster. It must be visually causal and painterly, using only its lamps, flowers, eyes, leaves and roots. No text, new character, room, or camera move.' },
    { role: 'user', content: `Start with Art exhibition. Semantic collision: ${semanticCue}. Let the collision make the original drawing behave like a living exhibition, with escalation and an unresolved last image.` },
  ],
});
let story = {};
try { story = JSON.parse(planned.choices[0]?.message?.content || '{}'); } catch {}
const transformation = story.transformation || 'The drawing becomes an ink-and-coloured-pencil exhibition apparition: gallery lamps begin to search through the living botanical lines.';
const beats = Array.isArray(story.beats) && story.beats.length >= 3 ? story.beats.slice(0, 3) : [
  'A painterly light sweep activates the lamps and makes their yellow marks leak softly into the paper grain.',
  'The leaf ears and flowers lean toward the scan; the eyes answer and the root network ripples like an exhibition wiring diagram.',
  'The light locks on the Golem while three artist names arrive as physical paper cut-outs, leaving the rest of the names unresolved for the end card.',
];

const protectedPortrait = join(output, 'opening-title-protected-portrait.png');
const titleLayer = join(output, 'exact-original-title-layer.png');
const namesStage = join(output, 'real-names-card-16x9.png');
execFileSync('magick', [openingPoster, '-fill', '#f4ede3', '-draw', 'rectangle 0,0 1800,552', protectedPortrait], { stdio: 'inherit' });
execFileSync('magick', [openingPoster, '-crop', '1800x552+0+0', '+repage', '-resize', '405x124', titleLayer], { stdio: 'inherit' });
execFileSync('magick', [namesCard, '-resize', 'x720', '-background', 'black', '-gravity', 'center', '-extent', '1280x720', namesStage], { stdio: 'inherit' });

const imagePrompt = [
  'Use the supplied image as the exact composition reference. Create a restrained image-to-image art transformation of its Garten-Golum illustration only.',
  transformation,
  'Keep the colored-pencil and ink drawing language, rough paper grain, imperfect hand pressure, flat illustrated shapes, leaf ears, green face, flowers, lamps and roots. The result must look like the same artist made a living exhibition-poster painting.',
  'The top blank band must remain blank: no text or lettering anywhere. No photorealism, 3D, glossy AI paint, new creature, room, signage, collage, or camera framing change.',
].join(' ');
const imagePayload = {
  model: 'bfl:3@1',
  prompt: imagePrompt,
  width: 672,
  height: 1568,
  referenceImages: [await imagePathToDataUrl(protectedPortrait)],
};
const { task, result } = await submitRunwareImageTask({ apiKey: resolveRunwareKey(), ...imagePayload });
const transformed = await saveRunwareImageResult({
  imageDir: output,
  filePrefix: 'art-semantic-flux-kontext',
  model: imagePayload.model,
  payload: task,
  result,
  metadata: { semanticCue, transformation, beats, source: openingPoster },
});

const wanStage = join(output, 'flux-art-opening-16x9.png');
execFileSync('magick', [transformed.file, '-resize', 'x720', '-background', 'black', '-gravity', 'center', '-extent', '1280x720', wanStage], { stdio: 'inherit' });
const videoPrompt = [
  '16:9 landscape. Animate this supplied painterly Garten-Golum drawing as one continuous gallery apparition. Preserve exact colored-pencil/ink linework, paper grain, flat illustration, face, ears, flowers, lamps, roots and black matte.',
  `Semantic progression: ${beats[0]} Then ${beats[1]} Finally ${beats[2]}.`,
  'The motion is artistic, tactile and visible: drawn light bleeds through paper, flower lamps pivot, roots make an organic graphic ripple, eyes react. Static camera.',
  'No text, letters, sign, barcode, new character, new room, cutaway, zoom, pan, photorealism, 3D, glossy repaint, collage, or transformation into another creature.',
].join(' ');
const videoPayload = {
  frameImages: [{ frame: 'first', image: await imagePathToDataUrl(wanStage) }],
  prompt: videoPrompt,
  durationSeconds: 4,
  resolution: '720p',
  providerSettings: { alibaba: { audio: false, promptExtend: false } },
};
const videoResult = await submitRunwareVideoJob({ apiKey: resolveRunwareKey(), model: 'alibaba:wan@2.6-flash', ...videoPayload });
const animated = await saveRunwareVideoResult({ imageDir: output, filePrefix: 'art-semantic-wan26-flash', model: 'alibaba:wan@2.6-flash', payload: videoPayload, result: videoResult, targetDurationSeconds: 4, targetFps: 24 });

// Three supplied artist-name crops arrive late in the opening. Brown card
// paper becomes transparent; the type itself is never generated or rewritten.
const nameCrops = [
  ['tuli-mariola-alex', '0x650+0+700', '437', '158'],
  ['catherine-nadine-donne', '800x420+500+1020', '543', '228'],
  ['gabriel-john-tania', '1100x420+130+1510', '468', '340'],
].map(([name, crop, x, y]) => {
  const file = join(output, `${name}-source-type.png`);
  execFileSync('magick', [namesCard, '-crop', crop, '+repage', '-resize', 'x94', '-alpha', 'on', '-fuzz', '26%', '-transparent', '#513700', file], { stdio: 'inherit' });
  return { name, file, x, y };
});

const finalVideo = join(output, 'art-semantic-poster-story-then-real-names-card-16x9.mp4');
const filter = [
  '[0:v]trim=duration=4,setpts=PTS-STARTPTS[animated]',
  '[1:v]format=rgba,setpts=PTS-STARTPTS[title]',
  '[animated][title]overlay=437:0:format=auto[with-title]',
  '[2:v]format=rgba,setpts=PTS-STARTPTS[n1]',
  '[3:v]format=rgba,setpts=PTS-STARTPTS[n2]',
  '[4:v]format=rgba,setpts=PTS-STARTPTS[n3]',
  "[with-title][n1]overlay=x='if(lt(t,3.05),-250+(t-2.35)*1400,437)':y=158:enable='between(t,2.35,4)'[names1]",
  "[names1][n2]overlay=x='if(lt(t,3.25),1450-(t-2.55)*1300,543)':y=228:enable='between(t,2.55,4)'[names2]",
  "[names2][n3]overlay=x='if(lt(t,3.45),-400+(t-2.75)*1240,468)':y=340:enable='between(t,2.75,4)'[story]",
  '[5:v]trim=duration=2,setpts=PTS-STARTPTS,fade=t=in:st=0:d=0.65[card]',
  '[story][card]concat=n=2:v=1:a=0[out]',
].join(';');
execFileSync('ffmpeg', [
  '-y', '-i', animated.file,
  '-loop', '1', '-t', '4', '-i', titleLayer,
  '-loop', '1', '-t', '4', '-i', nameCrops[0].file,
  '-loop', '1', '-t', '4', '-i', nameCrops[1].file,
  '-loop', '1', '-t', '4', '-i', nameCrops[2].file,
  '-loop', '1', '-t', '2', '-i', namesStage,
  '-filter_complex', filter, '-map', '[out]', '-t', '6', '-r', '24', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', finalVideo,
], { stdio: 'inherit' });

const sha256 = createHash('sha256').update(readFileSync(finalVideo)).digest('hex');
writeFileSync(join(output, 'semantic-plan.json'), `${JSON.stringify({ configuredWords, cue, semanticCue, transformation, beats, imagePrompt, videoPrompt, openingPoster, namesCard }, null, 2)}\n`);
writeFileSync(join(output, 'result.json'), `${JSON.stringify({ file: finalVideo, sha256, width: 1280, height: 720, durationSeconds: 6, fluxImage: transformed.file, wanOpening: animated.file }, null, 2)}\n`);
console.log(JSON.stringify({ file: finalVideo, sha256, cue, transformation, beats }, null, 2));
