import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, unlink, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

function run(command, args, label) {
  try {
    execFileSync(command, args, { stdio: 'inherit' });
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error(`${label} not found: ${command}`);
    throw error;
  }
}

function findFont(font) {
  if (font) return resolve(font);
  try {
    return execFileSync(process.env.FC_MATCH_BIN || 'fc-match', ['-f', '%{file}', 'DejaVu Sans'], { encoding: 'utf8' }).trim();
  } catch {
    return 'Arial';
  }
}

function decodeNumericHtmlEntities(value) {
  return String(value).replace(/&#(?:x([\da-f]{1,6})|(\d{1,7}));/gi, (entity, hexadecimal, decimal) => {
    const codePoint = Number.parseInt(hexadecimal || decimal, hexadecimal ? 16 : 10);
    if (codePoint === 0 || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) return entity;
    return String.fromCodePoint(codePoint);
  });
}

export async function renderTitleCard({ runDirectory, iterationDirectory, iterationNumber, cardSeconds = 4, font = null, titleCardDirectory = null }) {
  const iterationId = String(iterationNumber).padStart(3, '0');
  const recordPath = join(runDirectory, iterationDirectory, 'record.json');
  const record = JSON.parse(await readFile(recordPath, 'utf8'));
  const title = decodeNumericHtmlEntities(record.article?.title?.trim() || '');
  if (!title) throw new Error(`Article title missing in ${recordPath}`);

  const cardsDirectory = titleCardDirectory || join(runDirectory, 'merged', 'title-cards');
  await mkdir(cardsDirectory, { recursive: true });
  const titleTextPath = join(cardsDirectory, `title-${iterationId}.txt`);
  const titleImagePath = join(cardsDirectory, `title-${iterationId}.png`);
  const textLayerPath = join(cardsDirectory, `.text-${iterationId}.png`);
  const titleVideoPath = join(cardsDirectory, `title-${iterationId}.mp4`);
  const expectedTitleText = `${title}\n`;
  const savedTitleText = await readFile(titleTextPath, 'utf8').catch((error) => {
    if (error.code !== 'ENOENT') throw error;
    return null;
  });
  if (savedTitleText !== expectedTitleText || !await exists(titleImagePath) || !await exists(titleVideoPath)) {
    await writeFile(titleTextPath, expectedTitleText, 'utf8');
    run(process.env.MAGICK_BIN || 'magick', [
      '-size', '760x240', '-background', 'none', '-fill', 'white', '-font', findFont(font),
      '-pointsize', '36', '-gravity', 'center', `caption:@${titleTextPath}`, textLayerPath,
    ], 'ImageMagick');
    run(process.env.MAGICK_BIN || 'magick', [
      '-size', '832x480', 'xc:#101820', textLayerPath, '-gravity', 'center', '-composite', titleImagePath,
    ], 'ImageMagick');
    await unlink(textLayerPath);
    run(process.env.FFMPEG_BIN || 'ffmpeg', [
      '-hide_banner', '-y', '-loop', '1', '-framerate', '24', '-i', titleImagePath,
      '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=32000',
      '-t', String(cardSeconds), '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
      '-pix_fmt', 'yuv420p', '-r', '24', '-c:a', 'aac', '-b:a', '128k', '-ar', '32000',
      '-ac', '2', '-shortest', titleVideoPath,
    ], 'FFmpeg');
  }

  return {
    articleTitle: title,
    imagePath: relative(join(runDirectory, iterationDirectory), titleImagePath),
    imageRunPath: relative(runDirectory, titleImagePath),
    videoPath: relative(join(runDirectory, iterationDirectory), titleVideoPath),
    videoRunPath: relative(runDirectory, titleVideoPath),
    durationSeconds: cardSeconds,
    createdAt: new Date().toISOString(),
  };
}
