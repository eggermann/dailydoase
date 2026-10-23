import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';

const { values: options } = parseArgs({
  options: {
    'run-dir': { type: 'string' },
    'scene-glue-dir': { type: 'string' },
    limit: { type: 'string' },
    'bridge-limit': { type: 'string' },
    'bridge-random-threshold': { type: 'string' },
    'bridge-random-seed': { type: 'string' },
    output: { type: 'string' },
    'card-seconds': { type: 'string', default: '4' },
    'fade-seconds': { type: 'string', default: '0' },
    font: { type: 'string' },
    help: { type: 'boolean', default: false },
  },
});

if (options.help) {
  console.log('Usage: npm run news:assemble-film -- --run-dir=PATH [--scene-glue-dir=PATH] [--limit=5] [--bridge-limit=2 | --bridge-random-threshold=0.7] [--fade-seconds=0.25] [--output=PATH]');
  process.exit(0);
}

if (!options['run-dir']) throw new Error('--run-dir is required');

const runDirectory = resolve(options['run-dir']);
const mergedDirectory = join(runDirectory, 'merged');
const sceneGlueDirectory = options['scene-glue-dir'] ? resolve(options['scene-glue-dir']) : null;
const outputDirectory = sceneGlueDirectory || mergedDirectory;
const cardsDirectory = join(outputDirectory, 'title-cards');
const cardDuration = Number(options['card-seconds']);
const fadeDuration = Number(options['fade-seconds']);
const ffmpeg = process.env.FFMPEG_BIN || 'ffmpeg';
const ffprobe = process.env.FFPROBE_BIN || 'ffprobe';
const magick = process.env.MAGICK_BIN || 'magick';
const iterationLimit = options.limit === undefined ? Infinity : Number(options.limit);
const bridgeLimit = options['bridge-limit'] === undefined ? null : Number(options['bridge-limit']);
const bridgeRandomThreshold = options['bridge-random-threshold'] === undefined
  ? null
  : Number(options['bridge-random-threshold']);
const bridgeRandomSeed = options['bridge-random-seed'] || basename(runDirectory);
const bridgeSelectionEnabled = bridgeLimit !== null || bridgeRandomThreshold !== null;

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

if (!Number.isFinite(cardDuration) || cardDuration <= 0) {
  throw new Error('--card-seconds must be a positive number');
}
if (!Number.isFinite(fadeDuration) || fadeDuration < 0 || fadeDuration > 2) {
  throw new Error('--fade-seconds must be from 0 to 2 seconds');
}
if (!(iterationLimit === Infinity || (Number.isInteger(iterationLimit) && iterationLimit > 0))) {
  throw new Error('--limit must be a positive integer');
}
if (bridgeLimit !== null && (!Number.isInteger(bridgeLimit) || bridgeLimit < 0)) {
  throw new Error('--bridge-limit must be a non-negative integer');
}
if (bridgeLimit !== null && !sceneGlueDirectory) {
  throw new Error('--bridge-limit requires --scene-glue-dir');
}
if (bridgeRandomThreshold !== null && (!Number.isFinite(bridgeRandomThreshold) || bridgeRandomThreshold < 0 || bridgeRandomThreshold >= 1)) {
  throw new Error('--bridge-random-threshold must be from 0 inclusive to 1 exclusive');
}
if (bridgeRandomThreshold !== null && !sceneGlueDirectory) {
  throw new Error('--bridge-random-threshold requires --scene-glue-dir');
}
if (bridgeRandomThreshold !== null && bridgeLimit !== null) {
  throw new Error('Use either --bridge-limit or --bridge-random-threshold, not both');
}

function run(command, args, label) {
  try {
    return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error(`${label} not found: ${command}`);
    throw error;
  }
}

function runWithOutput(command, args, label) {
  try {
    execFileSync(command, args, { stdio: 'inherit' });
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error(`${label} not found: ${command}`);
    throw error;
  }
}

function padIteration(number) {
  return String(number).padStart(3, '0');
}

async function getIterations() {
  const manifestPath = join(runDirectory, 'run.json');
  try {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const iterations = manifest.iterations?.map((entry) => entry.directory).filter(Boolean);
    if (iterations?.length) return iterations.slice(0, iterationLimit);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  return (await readdir(runDirectory))
    .filter((name) => /^iteration-\d+$/.test(name))
    .sort((left, right) => left.localeCompare(right, 'en', { numeric: true }))
    .slice(0, iterationLimit);
}

function findFont() {
  if (options.font) return resolve(options.font);
  try {
    return run(process.env.FC_MATCH_BIN || 'fc-match', ['-f', '%{file}', 'DejaVu Sans'], 'fc-match').trim();
  } catch {
    return 'Arial';
  }
}

async function renderTitleCard(iterationDirectory, number, font) {
  const iterationId = padIteration(number);
  const recordPath = join(runDirectory, iterationDirectory, 'record.json');
  const record = JSON.parse(await readFile(recordPath, 'utf8'));
  const title = record.article?.title?.trim();
  if (!title) throw new Error(`Article title missing in ${recordPath}`);

  const titleTextPath = join(cardsDirectory, `title-${iterationId}.txt`);
  const titleImagePath = join(cardsDirectory, `title-${iterationId}.png`);
  const headingLayerPath = join(cardsDirectory, `.heading-${iterationId}.png`);
  const textLayerPath = join(cardsDirectory, `.text-${iterationId}.png`);
  const titleVideoPath = join(cardsDirectory, `title-${iterationId}.mp4`);
  const expectedTitleText = `${title}\n`;
  const savedTitleText = await readFile(titleTextPath, 'utf8').catch((error) => {
    if (error.code !== 'ENOENT') throw error;
    return null;
  });
  if (savedTitleText === expectedTitleText && await exists(titleVideoPath)) return titleVideoPath;
  await writeFile(titleTextPath, expectedTitleText, 'utf8');

  runWithOutput(magick, [
    '-size', '760x60', '-background', 'none', '-fill', 'white', '-font', font,
    '-pointsize', '24', '-gravity', 'center', 'caption:Geschichte', headingLayerPath,
  ], 'ImageMagick');
  runWithOutput(magick, [
    '-size', '760x240', '-background', 'none', '-fill', 'white', '-font', font,
    '-pointsize', '36', '-gravity', 'center', `caption:@${titleTextPath}`, textLayerPath,
  ], 'ImageMagick');
  runWithOutput(magick, [
    '-size', '832x480', 'xc:#101820', headingLayerPath, '-gravity', 'north', '-geometry', '+0+110',
    '-composite', textLayerPath, '-gravity', 'center', '-geometry', '+0+70', '-composite', titleImagePath,
  ], 'ImageMagick');
  await unlink(headingLayerPath);
  await unlink(textLayerPath);

  runWithOutput(ffmpeg, [
    '-hide_banner', '-y', '-loop', '1', '-framerate', '24', '-i', titleImagePath,
    '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=32000',
    '-t', String(cardDuration), '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
    '-pix_fmt', 'yuv420p', '-r', '24', '-c:a', 'aac', '-b:a', '128k', '-ar', '32000',
    '-ac', '2', '-shortest', titleVideoPath,
  ], 'FFmpeg');

  return titleVideoPath;
}

const iterations = await getIterations();
if (!iterations.length) throw new Error(`No iteration-NNN folders found in ${runDirectory}`);
const selectedBridgePaths = new Set();
let allBridgeCandidates = [];
if (bridgeLimit !== null || bridgeRandomThreshold !== null) {
  for (const iterationDirectory of iterations) {
    const iterationNumber = Number(iterationDirectory.match(/iteration-(\d+)/)?.[1]);
    const iterationId = padIteration(iterationNumber);
    const record = JSON.parse(await readFile(join(runDirectory, iterationDirectory, 'record.json'), 'utf8'));
    const scenes = record.plan?.scenes || [];
    for (let index = 0; index < scenes.length - 1; index += 1) {
      const previous = scenes[index];
      const next = scenes[index + 1];
      const bridge = join(
        sceneGlueDirectory,
        `iteration-${iterationId}`,
        `scene-${padIteration(previous.index)}-to-${padIteration(next.index)}.mp4`,
      );
      if (!await exists(bridge)) throw new Error(`Missing scene bridge: ${bridge}`);
      const requestPath = bridge.replace(/\.mp4$/, '-request.json');
      const request = JSON.parse(await readFile(requestPath, 'utf8'));
      allBridgeCandidates.push({ path: bridge, duration: Number(request.duration), order: allBridgeCandidates.length });
    }
  }
  if (allBridgeCandidates.some((candidate) => !Number.isFinite(candidate.duration))) {
    throw new Error('Bridge request is missing numeric duration');
  }
  if (bridgeLimit !== null) {
    const chosen = [...allBridgeCandidates]
      .sort((left, right) => right.duration - left.duration || left.order - right.order)
      .slice(0, bridgeLimit);
    for (const candidate of chosen) selectedBridgePaths.add(candidate.path);
  } else {
    for (const candidate of allBridgeCandidates) {
      const digest = createHash('sha256').update(`${bridgeRandomSeed}:${candidate.path}`).digest();
      const randomValue = digest.readUInt32BE(0) / 0x1_0000_0000;
      candidate.randomValue = Number(randomValue.toFixed(8));
      if (randomValue > bridgeRandomThreshold) selectedBridgePaths.add(candidate.path);
    }
  }
  allBridgeCandidates = allBridgeCandidates.map((candidate) => ({
    ...candidate,
    selected: selectedBridgePaths.has(candidate.path),
  }));
}
const outputPath = resolve(options.output || join(
  outputDirectory,
  sceneGlueDirectory ? `eu-reski-first-${iterations.length}-glued.mp4` : 'eu-reski-gesamtfilm.mp4',
));
const outputStem = basename(outputPath, '.mp4');
const manifestFileName = sceneGlueDirectory
  ? (options.output ? `${outputStem}.film-order.txt` : 'film-order.txt')
  : 'full-film.txt';
const manifestPath = join(outputDirectory, manifestFileName);
await mkdir(outputDirectory, { recursive: true });
await mkdir(cardsDirectory, { recursive: true });

const font = findFont();
const manifestEntries = [];
const orderedFiles = [];
function addMedia(path, trimStart = 0) {
  manifestEntries.push(`file '${relative(dirname(manifestPath), path).split(sep).join('/')}'`);
  orderedFiles.push({ path, trimStart });
}
for (let index = 0; index < iterations.length; index += 1) {
  const iterationDirectory = iterations[index];
  const iterationNumber = Number(iterationDirectory.match(/iteration-(\d+)/)?.[1]);
  if (!Number.isInteger(iterationNumber)) throw new Error(`Invalid iteration directory: ${iterationDirectory}`);
  const iterationId = padIteration(iterationNumber);
  const titleVideoPath = await renderTitleCard(iterationDirectory, iterationNumber, font);

  addMedia(titleVideoPath);
  if (sceneGlueDirectory) {
    const record = JSON.parse(await readFile(join(runDirectory, iterationDirectory, 'record.json'), 'utf8'));
    const scenes = record.plan?.scenes || [];
    if (!scenes.length) throw new Error(`No scenes found in ${iterationDirectory}/record.json`);
    for (let index = 0; index < scenes.length; index += 1) {
      const scene = scenes[index];
      const sceneVideo = join(runDirectory, iterationDirectory, 'media', `scene-${scene.index}-video.mp4`);
      const previousBridge = index > 0
        ? join(sceneGlueDirectory, `iteration-${iterationId}`, `scene-${padIteration(scenes[index - 1].index)}-to-${padIteration(scene.index)}.mp4`)
        : null;
      const keepPreviousBridge = previousBridge && (!bridgeSelectionEnabled || selectedBridgePaths.has(previousBridge));
      addMedia(sceneVideo, keepPreviousBridge ? fadeDuration : 0);
      if (index < scenes.length - 1) {
        const nextScene = scenes[index + 1];
        const bridge = join(
          sceneGlueDirectory,
          `iteration-${iterationId}`,
          `scene-${padIteration(scene.index)}-to-${padIteration(nextScene.index)}.mp4`,
        );
        if (!await exists(bridge)) throw new Error(`Missing scene bridge: ${bridge}`);
        if (!bridgeSelectionEnabled || selectedBridgePaths.has(bridge)) addMedia(bridge);
      }
    }
  } else {
    const mergedClip = join(mergedDirectory, `iteration-${iterationId}.mp4`);
    addMedia(mergedClip);
  }
}

await writeFile(manifestPath, `${manifestEntries.join('\n')}\n`, 'utf8');
if (bridgeSelectionEnabled) {
  await writeFile(join(outputDirectory, `${outputStem}.assembly.json`), `${JSON.stringify({
    outputPath,
    iterationCount: iterations.length,
    bridgeLimit,
    bridgeSelection: bridgeRandomThreshold === null ? (bridgeLimit === null ? 'all' : 'longest') : 'seeded-random-threshold',
    bridgeRandomThreshold,
    bridgeRandomSeed: bridgeRandomThreshold === null ? null : bridgeRandomSeed,
    selectedBridgeCount: selectedBridgePaths.size,
    omittedBridgeCount: allBridgeCandidates.length - selectedBridgePaths.size,
    fadeSeconds: fadeDuration,
    bridgeCandidates: allBridgeCandidates,
  }, null, 2)}\n`, 'utf8');
}
await mkdir(dirname(outputPath), { recursive: true });

if (fadeDuration > 0) {
  if (orderedFiles.length < 2) throw new Error('At least two clips are required for an FFmpeg fade');
  const durations = orderedFiles.map(({ path, trimStart }) => {
    const rawDuration = Number(run(ffprobe, [
      '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', path,
    ], 'FFprobe').trim());
    const duration = rawDuration - trimStart;
    if (!Number.isFinite(duration) || duration <= fadeDuration) throw new Error(`Clip too short for fade: ${path}`);
    return duration;
  });

  const filters = [];
  orderedFiles.forEach(({ trimStart }, index) => {
    const videoTrim = trimStart > 0 ? `trim=start=${trimStart},` : '';
    const audioTrim = trimStart > 0 ? `atrim=start=${trimStart},` : '';
    filters.push(`[${index}:v]${videoTrim}settb=AVTB,setpts=PTS-STARTPTS,scale=832:480:force_original_aspect_ratio=decrease,pad=832:480:(ow-iw)/2:(oh-ih)/2,fps=24,format=yuv420p[v${index}]`);
    filters.push(`[${index}:a]${audioTrim}aresample=32000:async=1:first_pts=0,aformat=sample_fmts=fltp:channel_layouts=stereo,asetpts=PTS-STARTPTS[a${index}]`);
  });

  let accumulatedDuration = durations[0];
  let previousVideo = 'v0';
  let previousAudio = 'a0';
  for (let index = 1; index < orderedFiles.length; index += 1) {
    const outputVideo = `vx${index}`;
    const outputAudio = `ax${index}`;
    const offset = Number((accumulatedDuration - fadeDuration).toFixed(6));
    filters.push(`[${previousVideo}][v${index}]xfade=transition=fade:duration=${fadeDuration}:offset=${offset}[${outputVideo}]`);
    filters.push(`[${previousAudio}][a${index}]acrossfade=d=${fadeDuration}:c1=tri:c2=tri[${outputAudio}]`);
    accumulatedDuration = offset + durations[index];
    previousVideo = outputVideo;
    previousAudio = outputAudio;
  }

  const filterPath = join(outputDirectory, `${outputStem}.fade-filter.txt`);
  const filterGraph = filters.join(';');
  await writeFile(filterPath, `${filters.join(';\n')}\n`, 'utf8');
  const args = ['-hide_banner', '-y'];
  for (const { path } of orderedFiles) args.push('-i', path);
  args.push(
    '-filter_complex', filterGraph,
    '-map', `[${previousVideo}]`, '-map', `[${previousAudio}]`,
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '160k', '-ar', '32000', '-ac', '2', '-movflags', '+faststart', outputPath,
  );
  runWithOutput(ffmpeg, args, 'FFmpeg');
} else {
  runWithOutput(ffmpeg, [
    '-hide_banner', '-y', '-f', 'concat', '-safe', '0', '-i', manifestPath,
    '-vf', 'fps=24,format=yuv420p', '-af', 'aresample=async=1:first_pts=0',
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-c:a', 'aac', '-b:a', '160k',
    '-ar', '32000', '-ac', '2', '-movflags', '+faststart', outputPath,
  ], 'FFmpeg');
}

console.log(`Film: ${outputPath}`);
