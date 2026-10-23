import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';

const { values: options } = parseArgs({
  options: {
    'run-dir': { type: 'string' },
    'scene-glue-dir': { type: 'string' },
    limit: { type: 'string' },
    output: { type: 'string' },
    'card-seconds': { type: 'string', default: '4' },
    font: { type: 'string' },
    help: { type: 'boolean', default: false },
  },
});

if (options.help) {
  console.log('Usage: npm run news:assemble-film -- --run-dir=PATH [--scene-glue-dir=PATH] [--limit=5] [--output=PATH]');
  process.exit(0);
}

if (!options['run-dir']) throw new Error('--run-dir is required');

const runDirectory = resolve(options['run-dir']);
const mergedDirectory = join(runDirectory, 'merged');
const sceneGlueDirectory = options['scene-glue-dir'] ? resolve(options['scene-glue-dir']) : null;
const outputDirectory = sceneGlueDirectory || mergedDirectory;
const cardsDirectory = join(outputDirectory, 'title-cards');
const manifestPath = join(outputDirectory, sceneGlueDirectory ? 'film-order.txt' : 'full-film.txt');
const cardDuration = Number(options['card-seconds']);
const ffmpeg = process.env.FFMPEG_BIN || 'ffmpeg';
const magick = process.env.MAGICK_BIN || 'magick';
const iterationLimit = options.limit === undefined ? Infinity : Number(options.limit);

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
if (!(iterationLimit === Infinity || (Number.isInteger(iterationLimit) && iterationLimit > 0))) {
  throw new Error('--limit must be a positive integer');
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
  const textLayerPath = join(cardsDirectory, `.text-${iterationId}.png`);
  const titleVideoPath = join(cardsDirectory, `title-${iterationId}.mp4`);
  await writeFile(titleTextPath, `${title}\n`, 'utf8');

  runWithOutput(magick, [
    '-size', '760x320', '-background', 'none', '-fill', 'white', '-font', font,
    '-pointsize', '36', '-gravity', 'center', `caption:@${titleTextPath}`, textLayerPath,
  ], 'ImageMagick');
  runWithOutput(magick, [
    '-size', '832x480', 'xc:#101820', textLayerPath, '-gravity', 'center',
    '-composite', titleImagePath,
  ], 'ImageMagick');
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
const outputPath = resolve(options.output || join(
  outputDirectory,
  sceneGlueDirectory ? `eu-reski-first-${iterations.length}-glued.mp4` : 'eu-reski-gesamtfilm.mp4',
));
await mkdir(outputDirectory, { recursive: true });
await mkdir(cardsDirectory, { recursive: true });

const font = findFont();
const manifestEntries = [];
for (let index = 0; index < iterations.length; index += 1) {
  const iterationDirectory = iterations[index];
  const iterationNumber = Number(iterationDirectory.match(/iteration-(\d+)/)?.[1]);
  if (!Number.isInteger(iterationNumber)) throw new Error(`Invalid iteration directory: ${iterationDirectory}`);
  const iterationId = padIteration(iterationNumber);
  const titleVideoPath = await renderTitleCard(iterationDirectory, iterationNumber, font);

  manifestEntries.push(`file '${relative(dirname(manifestPath), titleVideoPath).split(sep).join('/')}'`);
  if (sceneGlueDirectory) {
    const record = JSON.parse(await readFile(join(runDirectory, iterationDirectory, 'record.json'), 'utf8'));
    const scenes = record.plan?.scenes || [];
    if (!scenes.length) throw new Error(`No scenes found in ${iterationDirectory}/record.json`);
    for (let index = 0; index < scenes.length; index += 1) {
      const scene = scenes[index];
      const sceneVideo = join(runDirectory, iterationDirectory, 'media', `scene-${scene.index}-video.mp4`);
      manifestEntries.push(`file '${relative(dirname(manifestPath), sceneVideo).split(sep).join('/')}'`);
      if (index < scenes.length - 1) {
        const nextScene = scenes[index + 1];
        const bridge = join(
          sceneGlueDirectory,
          `iteration-${iterationId}`,
          `scene-${padIteration(scene.index)}-to-${padIteration(nextScene.index)}.mp4`,
        );
        if (!await exists(bridge)) throw new Error(`Missing scene bridge: ${bridge}`);
        manifestEntries.push(`file '${relative(dirname(manifestPath), bridge).split(sep).join('/')}'`);
      }
    }
  } else {
    const mergedClip = join(mergedDirectory, `iteration-${iterationId}.mp4`);
    manifestEntries.push(`file '${relative(dirname(manifestPath), mergedClip).split(sep).join('/')}'`);
  }
}

await writeFile(manifestPath, `${manifestEntries.join('\n')}\n`, 'utf8');
await mkdir(dirname(outputPath), { recursive: true });

runWithOutput(ffmpeg, [
  '-hide_banner', '-y', '-f', 'concat', '-safe', '0', '-i', manifestPath,
  '-vf', 'fps=24,format=yuv420p', '-af', 'aresample=async=1:first_pts=0',
  '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-c:a', 'aac', '-b:a', '160k',
  '-ar', '32000', '-ac', '2', '-movflags', '+faststart', outputPath,
], 'FFmpeg');

console.log(`Film: ${outputPath}`);
