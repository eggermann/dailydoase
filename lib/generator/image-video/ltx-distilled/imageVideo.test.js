import 'dotenv/config';
import { jest } from '@jest/globals';
import os from 'os';
import fs from 'fs-extra';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

import LtxImageVideo from './imageVideo.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

jest.setTimeout(180_000); // allow real Space latency

// Helper to create a tiny temp image (if test asset missing)
async function ensureTestImage() {
  const assetPath = path.join(process.cwd(), 'tests', 'assets', 'remote_test_image.png');
  if (await fs.pathExists(assetPath)) return assetPath;
  const tmpImg = path.join(os.tmpdir(), 'ltx-distilled-test-img.png');
  const buf = await sharp({
    create: {
      width: 256,
      height: 256,
      channels: 3,
      background: { r: 30, g: 80, b: 180 }
    }
  }).png().toBuffer();
  await fs.writeFile(tmpImg, buf);
  return tmpImg;
}

/**
 * Basic text-to-video invocation.
 */
test('LTX distilled text-to-video returns object with file + json', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ltx-distilled-text-'));
  const api = await LtxImageVideo.init({
    folderName: path.basename(tmpDir),
    duration_ui: 2,
    height_ui: 512,
    width_ui: 704,
    randomize_seed: true
  });

  const res = await api.prompt(null, { prompt: 'A tranquil mountain lake at sunrise, soft mist' });
  expect(typeof res).toBe('object');
  expect(res.file).toMatch(/\.mp4$/);
  expect(await fs.pathExists(res.file)).toBe(true);
});

/**
 * Image-to-video invocation.
 */
test('LTX distilled image-to-video returns object with file + json', async () => {
  const imgPath = await ensureTestImage();
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ltx-distilled-img-'));
  const api = await LtxImageVideo.init({
    folderName: path.basename(tmpDir),
    duration_ui: 2,
    ui_frames_to_use: 9,
    randomize_seed: true
  });

  const imgBuffer = await fs.readFile(imgPath);
  const res = await api.prompt(imgBuffer, { prompt: 'Slow cinematic pan over lake with morning fog' });
  expect(typeof res).toBe('object');
  expect(res.file).toMatch(/\.mp4$/);
});

/**
 * Loop mode (will recurse; heuristic stop after internal condition).
 * Uses deterministic seed to force increment behavior.
 */
test('LTX distilled loop mode completes', async () => {
  const imgPath = await ensureTestImage();
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ltx-distilled-loop-'));
  const api = await LtxImageVideo.init({
    folderName: path.basename(tmpDir),
    randomize_seed: false,
    seed_ui: 40
  });

  const imgBuffer = await fs.readFile(imgPath);
  const res = await api.prompt(imgBuffer, {
    prompt: 'Base scene lake',
    loop: { prompts: ['Variation morning light', 'Variation golden hour'] },
    randomize_seed: false,
    seed_ui: 40
  });
  // Loop returns true when termination heuristic triggers OR final object
  expect(res === true || (typeof res === 'object' && res.file)).toBeTruthy();
});

// Run single test:
// npm test -- lib/generator/image-video/ltx-distilled/imageVideo.test.js