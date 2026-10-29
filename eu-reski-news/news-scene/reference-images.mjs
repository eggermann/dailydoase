import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, extname, join, resolve } from 'node:path';
import { hash } from './planner.mjs';

async function loadSharp() {
  try {
    return (await import('sharp')).default;
  } catch (error) {
    // Worktrees can use the dependency installation already configured for their stream.
    const modulePath = process.env.NEWS_SEMANTIC_STREAM_MODULE;
    if (error.code !== 'ERR_MODULE_NOT_FOUND' || !modulePath) throw error;
    return createRequire(resolve(modulePath))('sharp');
  }
}

export async function prepareImageReference(directory, input) {
  const buffer = await readFile(join(directory, input.path));
  if (hash(buffer) !== input.sha256) throw new Error(`Reference changed: ${input.path}`);
  const sharp = await loadSharp();
  const oriented = await sharp(buffer).rotate().toBuffer({ resolveWithObject: true });
  const { width, height } = oriented.info;
  if (width >= 128 && height >= 128 && width <= 2048 && height <= 2048) return input;

  // Runware requires both dimensions in [128, 2048]. Preserve the full composition.
  const scale = Math.min(2048 / Math.max(width, height), Math.max(1, 128 / Math.min(width, height)));
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));
  const paddingX = Math.max(0, 128 - targetWidth);
  const paddingY = Math.max(0, 128 - targetHeight);
  const output = await sharp(oriented.data)
    .resize(targetWidth, targetHeight)
    .extend({
      left: Math.floor(paddingX / 2), right: Math.ceil(paddingX / 2),
      top: Math.floor(paddingY / 2), bottom: Math.ceil(paddingY / 2),
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png().toBuffer();
  const stem = basename(input.path, extname(input.path));
  const path = `media/${stem}-api.png`;
  await writeFile(join(directory, path), output);
  return {
    ...input, path, sourcePath: input.path, sourceSha256: input.sha256,
    mimeType: 'image/png', sha256: hash(output), bytes: output.length,
    width: targetWidth + paddingX, height: targetHeight + paddingY,
    dataUrl: `data:image/png;base64,${output.toString('base64')}`,
  };
}
