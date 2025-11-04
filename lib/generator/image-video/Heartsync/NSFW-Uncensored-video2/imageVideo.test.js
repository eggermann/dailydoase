import 'dotenv/config';
import { jest } from '@jest/globals';
import os from 'os';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

import { PostToHeartsync_NsfwUncensoredVideo2_ImageVideo } from './imageVideo.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Allow extra time for real API
jest.setTimeout(180_000);

test('returns a created video file path (real API)', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'heartsync-nsfw-video2-imagevideo-test-'));
  const api = await new PostToHeartsync_NsfwUncensoredVideo2_ImageVideo({
    folderName: path.basename(tmpDir),
    height: 1024 - (10 * 32),
    width: 576 - (8 * 32),
    duration_seconds: 5.1,
    sampling_steps: 2,
    guide_scale: 1.0,
    shift: 1.0,
    seed: 0,
  }).init();

  const imgPath = path.join(__dirname, '..', '..', 'test.datas', '1755295723001-flux.jpeg');
  const imgBuffer = await fs.readFile(imgPath);

  const res = await api.prompt(imgBuffer, { prompt: 'test prompt' });
  console.log('Result video path:', res);
  expect(typeof res).toBe('object');
});
