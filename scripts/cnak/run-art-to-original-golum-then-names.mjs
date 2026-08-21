#!/usr/bin/env node
// One restrained semantic animation of the supplied Golem poster, followed by
// the two supplied, source-pixel information sheets. No model sees their text.
import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
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
const generationsRoot = join(root, 'GENERATIONS-CNAK-KINETIC-MODEL-LOCAL');
const streamStatePath = join(generationsRoot, 'cnak-garten-golum-poster-stream-state.json');
const originalPoster = join(root, 'scripts', 'cnak', 'assets', '9-16-Insta-Reel.jpg');
const originalNamesCard = join(root, 'scripts', 'cnak', 'assets', '9-16-Insta2-Reel.jpg');
const originalVernissageCard = join(root, 'scripts', 'cnak', 'assets', '9-16-Insta-Vernissage.jpg');
const configuredWords = [['Department store', 'en'], ['Horror', 'en'], ['Art exhibition', 'en']];
const defaultStreamState = { iteration: 0, advances: [0, 0, 0] };

const hasAudioStream = (file) => {
  try {
    return execFileSync('ffprobe', [
      '-v', 'error',
      '-select_streams', 'a:0',
      '-show_entries', 'stream=codec_type',
      '-of', 'csv=p=0',
      file,
    ], { encoding: 'utf8' }).trim() === 'audio';
  } catch {
    return false;
  }
};

let streamState = defaultStreamState;
if (existsSync(streamStatePath)) {
  try { streamState = { ...defaultStreamState, ...JSON.parse(readFileSync(streamStatePath, 'utf8')) }; } catch {}
}
streamState.iteration = Math.max(0, Number(streamState.iteration) || 0);
streamState.advances = configuredWords.map((_, index) => Math.max(0, Number(streamState.advances?.[index]) || 0));

const selectedStreamIndex = streamState.iteration % configuredWords.length;
const selectedWord = configuredWords[selectedStreamIndex];
const runNumber = 17 + streamState.iteration;
const folder = `cnak-garten-golum-art-to-original-seedance-names-${String(runNumber).padStart(3, '0')}`;
const output = join(generationsRoot, folder);

for (const required of [originalPoster, originalNamesCard, originalVernissageCard]) {
  if (!existsSync(required)) throw new Error(`Required supplied poster stage missing: ${required}`);
}
if (!process.env.OPENAI_API_KEY) throw new Error('Missing OPENAI_API_KEY.');
if (!resolveRunwareKey()) throw new Error('Missing RUNWARE_API_KEY (or RUNWARE_KEY).');
mkdirSync(output, { recursive: true });

// The stream selects one tiny event inside the existing drawing. It is mood
// and timing only: it may never redesign, replace, or spatially transform it.
const streams = await getWordStreams([selectedWord], { forceRefresh: true });
for (let step = 0; step < streamState.advances[selectedStreamIndex]; step += 1) {
  await streams[0].getNext();
}
const [cue] = await buildCollisionSourceCueRecords({ streams, sceneCount: 1 });
const semanticCue = `${cue.anchor.term} → ${cue.collision.term}; ${cue.collision.description || ''}`;
const cachedAnimationPath = join(output, 'seedance-original-golum-micro-motion.mp4');
const cachedAnimationMetadataPath = join(output, 'seedance-original-golum-micro-motion.json');
const hasCachedAnimation = existsSync(cachedAnimationPath) && statSync(cachedAnimationPath).size > 0;
let microMotion = '';
if (hasCachedAnimation && existsSync(cachedAnimationMetadataPath)) {
  try {
    const cached = JSON.parse(readFileSync(cachedAnimationMetadataPath, 'utf8'));
    microMotion = String(cached.payload?.prompt || '').match(/Semantic micro-motion: (.*?) First and last frame/)?.[1] || '';
  } catch {}
}
if (!microMotion) {
  const planner = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await planner.chat.completions.create({
    model: 'gpt-4.1-mini-2025-04-14',
    temperature: 0.55,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: 'Return JSON only: {"microMotion":"..."}. Translate the semantic cue into exactly one subtle four-second kinetic event already possible inside the supplied hand-drawn Garten-Golum poster. Choose one existing feature: one slow eye blink, one restrained lamp shimmer, one slight flower inclination, one faint paper-shadow passage, or one tiny root tremor. The drawing must remain the same image and return to the identical pose. No transformation, morph, growth, new object, new character, scene, camera move, dramatic action, title animation, typography, montage, or combination of effects.',
      },
      { role: 'user', content: `Semantic source: ${semanticCue}` },
    ],
  });
  let plan = {};
  try { plan = JSON.parse(response.choices[0]?.message?.content || '{}'); } catch {}
  microMotion = plan.microMotion || 'The existing yellow eyes close once very slowly and reopen to their original position.';
}

// Model input has no lettering. Exact source-pixel title, names, and event
// details are composited locally and therefore cannot be hallucinated.
const originalNoTextPortrait = join(output, 'original-golum-no-title-portrait.png');
const originalStage = join(output, 'exact-original-golum-no-title-16x9.png');
const titleLayer = join(output, 'exact-original-title-layer.png');
const namesStage = join(output, 'exact-original-names-panel-16x9.png');
const vernissageStage = join(output, 'exact-original-vernissage-panel-16x9.png');

execFileSync('magick', [originalPoster, '-fill', '#f4ede3', '-draw', 'rectangle 0,0 1800,552', originalNoTextPortrait], { stdio: 'inherit' });
execFileSync('magick', [originalPoster, '-crop', '1800x552+0+0', '+repage', '-resize', '405x124', titleLayer], { stdio: 'inherit' });
for (const [source, target] of [
  [originalNoTextPortrait, originalStage],
  [originalNamesCard, namesStage],
  [originalVernissageCard, vernissageStage],
]) {
  execFileSync('magick', [source, '-resize', 'x720', '-background', 'black', '-gravity', 'center', '-extent', '1280x720', target], { stdio: 'inherit' });
}

// Identical first and last frames constrain the one model shot to a loop-like
// micro-motion. Everything after it is deterministic FFmpeg composition.
const seedanceModel = 'bytedance:seedance@2.0-mini';
const animationPrompt = [
  'One restrained four-second kinetic moment inside this exact supplied hand-drawn Garten-Golum poster.',
  `Semantic micro-motion: ${microMotion}`,
  'First and last frame are identical. Preserve the same face, leaf ears, flowers, lamps, roots, coloured-pencil marks, ink contours, rough paper, proportions, framing and flat composition at every moment. Static camera. Only the named existing feature may move, very slightly, then return exactly.',
  'Native audio is quiet exhibition-room atmosphere caused by that same tiny movement: soft electrical lamp hum and slight paper rustle only. No speech, voice, music, melody, impact, narration or reading of text.',
  'No transformation, morphing, growth, redesign, replacement, new object, new character, room, photorealism, 3D, glossy repaint, crop change, pan, zoom, cutaway, montage, text, letters, names or signs.',
].join(' ');
const animationPayload = {
  frameImages: [
    { frame: 'first', image: await imagePathToDataUrl(originalStage) },
    { frame: 'last', image: await imagePathToDataUrl(originalStage) },
  ],
  prompt: animationPrompt,
  durationSeconds: 4,
  resolution: '720p',
  settings: { audio: true },
};
let animationVideo = { file: cachedAnimationPath };
if (!hasCachedAnimation) {
  const animationResult = await submitRunwareVideoJob({ apiKey: resolveRunwareKey(), model: seedanceModel, ...animationPayload });
  animationVideo = await saveRunwareVideoResult({
    imageDir: output,
    filePrefix: 'seedance-original-golum-micro-motion',
    model: seedanceModel,
    payload: animationPayload,
    result: animationResult,
    targetDurationSeconds: 4,
    targetFps: 24,
    preserveAudio: true,
  });
}
if (!hasAudioStream(animationVideo.file)) {
  throw new Error(`Seedance Mini returned no native audio stream: ${animationVideo.file}`);
}

const namesDuration = 3.5;
const vernissageDuration = 4.5;
const transitionDuration = 0.35;
const finalDuration = 4 + namesDuration + vernissageDuration;
const finalVideo = join(output, 'golum-micro-motion-then-names-and-vernissage-16x9.mp4');
const filter = [
  '[0:v]trim=duration=4,fps=24,setsar=1,settb=AVTB,setpts=PTS-STARTPTS[animation]',
  '[1:v]format=rgba,fps=24,settb=AVTB,setpts=PTS-STARTPTS[title]',
  '[animation][title]overlay=437:0:format=auto,fps=24,format=yuv420p,setsar=1,settb=AVTB,setpts=PTS-STARTPTS[story]',
  `[2:v]trim=duration=${namesDuration},fps=24,format=yuv420p,setsar=1,fade=t=in:st=0:d=${transitionDuration},settb=AVTB,setpts=PTS-STARTPTS[names]`,
  `[3:v]trim=duration=${vernissageDuration},fps=24,format=yuv420p,setsar=1,fade=t=in:st=0:d=${transitionDuration},settb=AVTB,setpts=PTS-STARTPTS[vernissage]`,
  '[story][names][vernissage]concat=n=3:v=1:a=0[out]',
].join(';');
execFileSync('ffmpeg', [
  '-y', '-i', animationVideo.file,
  '-framerate', '24', '-loop', '1', '-t', '4', '-i', titleLayer,
  '-framerate', '24', '-loop', '1', '-t', String(namesDuration), '-i', namesStage,
  '-framerate', '24', '-loop', '1', '-t', String(vernissageDuration), '-i', vernissageStage,
  '-filter_complex', filter,
  '-map', '[out]', '-t', String(finalDuration), '-r', '24', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', finalVideo,
], { stdio: 'inherit' });

// Keep the native AI atmosphere during the animated opening, fade it gently,
// then leave both information panels quiet and fully readable.
const finalVideoWithAudio = join(output, 'golum-micro-motion-then-names-and-vernissage-16x9-with-audio.mp4');
execFileSync('ffmpeg', [
  '-y', '-i', finalVideo, '-i', animationVideo.file,
  '-filter_complex', `[1:a]atrim=duration=4,afade=t=out:st=3.65:d=0.35,apad=pad_dur=${finalDuration - 4},atrim=duration=${finalDuration},asetpts=PTS-STARTPTS[outa]`,
  '-map', '0:v:0', '-map', '[outa]', '-t', String(finalDuration),
  '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', finalVideoWithAudio,
], { stdio: 'inherit' });
renameSync(finalVideoWithAudio, finalVideo);
if (!hasAudioStream(finalVideo)) {
  throw new Error(`Final poster trailer has no audio stream: ${finalVideo}`);
}

const sha256 = createHash('sha256').update(readFileSync(finalVideo)).digest('hex');
const nextStreamState = {
  iteration: streamState.iteration + 1,
  advances: streamState.advances.map((count, index) => count + (index === selectedStreamIndex ? 1 : 0)),
};
writeFileSync(streamStatePath, `${JSON.stringify(nextStreamState, null, 2)}\n`);
const manifest = {
  configuredWords,
  selectedWord,
  selectedStreamIndex,
  previousStreamAdvances: streamState.advances[selectedStreamIndex],
  nextStreamState,
  cue,
  semanticCue,
  microMotion,
  seedanceModel,
  animationPrompt,
  animationVideo: animationVideo.file,
  namesStage,
  vernissageStage,
  durations: { animation: 4, names: namesDuration, vernissage: vernissageDuration, transition: transitionDuration, final: finalDuration },
  audio: { generatedBy: seedanceModel, native: true, audibleSeconds: 4, finalHasAudio: true },
  finalVideo,
  sha256,
};
writeFileSync(join(output, 'semantic-plan.json'), `${JSON.stringify(manifest, null, 2)}\n`);
writeFileSync(join(output, 'result.json'), `${JSON.stringify({
  file: finalVideo,
  sha256,
  width: 1280,
  height: 720,
  durationSeconds: finalDuration,
  hasAudio: true,
  animationVideo: animationVideo.file,
  namesStage,
  vernissageStage,
}, null, 2)}\n`);
console.log(JSON.stringify({ file: finalVideo, sha256, semanticCue, microMotion, finalDuration }, null, 2));
