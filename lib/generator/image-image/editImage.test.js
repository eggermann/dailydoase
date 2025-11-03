import 'dotenv/config';
import { jest } from '@jest/globals';
import path from 'path';
import fs from 'fs-extra';
import { fileURLToPath } from 'url';

import { PostToImageImage_EditImage } from './editImage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Allow time for real OpenAI edits call
jest.setTimeout(180_000);

test('edits image via OpenAI images/edits with prompt (real API)', async () => {
  const api = await new PostToImageImage_EditImage({
    folderName: './test-generations-edits',
    size: '512x512',
  }).init();

  const imgPath = path.join(__dirname, '..', 'test.datas', 'timba-lake.png');
  const imgBuffer = await fs.readFile(imgPath);

  const res = await api.prompt(imgBuffer, { prompt: 'make the scene at golden hour, warm light' });
  expect(typeof res).toBe('object');
  const exists = await fs.pathExists(res.image.path);
  expect(exists).toBe(true);
  const sidecar = res.image.path.replace(/\.[^.]+$/, '.json');
  const sidecarExists = await fs.pathExists(sidecar);
  expect(sidecarExists).toBe(true);
});

// npm test -- lib/generator/image-image/editImage.test.js

