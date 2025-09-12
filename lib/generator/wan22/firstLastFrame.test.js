// npm test -- lib/generator/wan22/firstLastFrame.test.js

import 'dotenv/config';
import { jest } from '@jest/globals';
import os from 'os';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

import { PostToWan22_FirstLastFrame } from './firstLastFrame.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Allow extra time for real API
jest.setTimeout(180_000);

test('returns a created first-last video file path (real API)', async () => {
  const tmpDir = await fs.mkdtemp(path.join(__dirname, 'wan22-firstlast-test-'));
  const api = await new PostToWan22_FirstLastFrame({
    folderName: path.basename(tmpDir),
    steps: 2,
    duration_seconds: 1.0,
    guidance_scale: 1.0,
    guidance_scale_2: 1.0,
    seed: 0,
    randomize_seed: false,
  }).init();

  // Use 576x1024 JPEGs: keep existing as start; use requested file as end image
  const startPath = path.join(__dirname, '..', 'test.datas', '1755295723001-flux.jpeg');
  const endPath = path.join(__dirname, '..', 'test.datas', '1755295656386-flux.jpeg');
  const startBuffer = await fs.readFile(startPath);
  const endBuffer = await fs.readFile(endPath);

  try {
    const resultPath = await api.prompt(startBuffer, { prompt: 'test prompt', endImageStream: endBuffer });

    console.log('Result video path:', resultPath);
    expect(typeof resultPath).toBe('string');
    expect(await fs.pathExists(resultPath)).toBe(true);
  } catch (err) {
    const msg = String(err && err.message || err);
    if (/exceeded your GPU quota/i.test(msg)) {
      console.warn('Skipping due to HF GPU quota:', msg);
      expect(true).toBe(true);
      return;
    }
    throw err;
  }
});
