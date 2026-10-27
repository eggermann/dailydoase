import { execFileSync } from 'node:child_process';
import { mkdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const { values: options } = parseArgs({ options: {
  input: { type: 'string' },
  output: { type: 'string' },
  help: { type: 'boolean', default: false },
} });

if (options.help) {
  console.log('node eu-reski-news/scripts/normalize-iteration-audio.mjs --input=ITERATION.mp4 --output=ITERATION-normalized.mp4');
  process.exit(0);
}
if (!options.input || !options.output) throw new Error('Pass both --input=PATH and --output=PATH');

const inputPath = resolve(options.input);
const outputPath = resolve(options.output);
if (inputPath === outputPath) throw new Error('--output must differ from --input');
if (!outputPath.toLowerCase().endsWith('.mp4')) throw new Error('--output must end with .mp4');
await stat(inputPath);
await mkdir(dirname(outputPath), { recursive: true });

const ffmpeg = process.env.FFMPEG_BIN || 'ffmpeg';
const filter = 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=summary';
const temporaryPath = resolve(dirname(outputPath), `.${basename(outputPath, '.mp4')}.normalizing-${process.pid}.mp4`);
try {
  execFileSync(ffmpeg, [
    '-hide_banner', '-y', '-i', inputPath,
    '-map', '0:v:0', '-map', '0:a:0', '-map_metadata', '0',
    '-c:v', 'copy', '-af', filter, '-c:a', 'aac', '-b:a', '192k',
    '-movflags', '+faststart', temporaryPath,
  ], { stdio: 'inherit' });
  await rename(temporaryPath, outputPath);
} catch (error) {
  await unlink(temporaryPath).catch(() => {});
  if (error.code === 'ENOENT') throw new Error(`FFmpeg not found: ${ffmpeg}`);
  throw error;
}

const reportPath = `${outputPath}.normalization.json`;
await writeFile(reportPath, `${JSON.stringify({
  inputPath,
  outputPath,
  audioFilter: filter,
  targetIntegratedLufs: -16,
  maximumTruePeakDbtp: -1.5,
  targetLoudnessRangeLu: 11,
  video: 'copied without re-encoding',
  completedAt: new Date().toISOString(),
}, null, 2)}\n`, 'utf8');
console.log(`AUDIO_NORMALIZED ${outputPath}`);
