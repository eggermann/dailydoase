import 'dotenv/config';
import { jest } from '@jest/globals';
import os from 'os';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

import { PostToWan22_5B_ImageVideo } from './imageVideo.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Allow extra time for real API
jest.setTimeout(180_000);

test('returns a created video file path (real API)', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wan22-imagevideo-test-'));
  const api = await new PostToWan22_5B_ImageVideo({
    folderName: path.basename(tmpDir),
    // Keep tiny values; Space may upscale via inferDims
    height: 128,
    width: 128,
    duration_seconds: 1.0,
    sampling_steps: 2,
    guide_scale: 1.0,
    shift: 1.0,
    seed: 0,
  }).init();

  const imgPath = path.join(__dirname, '..', 'test.datas', '1755295723001-flux.jpeg');
  const imgBuffer = await fs.readFile(imgPath);

  const resultPath = await api.prompt(imgBuffer, { prompt: 'test prompt' });
  console.log('Result video path:', resultPath);
  expect(typeof resultPath).toBe('string');
  expect(await fs.pathExists(resultPath)).toBe(true);
});

//npm test -- lib/generator/wan22/imageVideo.test.js