import 'dotenv/config';
import { jest } from '@jest/globals';
import path from 'path';
import fs from 'fs-extra';

import { PostToImageImage_TextImage } from './textImage.js';

// Allow time for real OpenAI API call
jest.setTimeout(180_000);

test('returns a created image file path via OpenAI (real API)', async () => {
  const api = await new PostToImageImage_TextImage({
    folderName: './test-generations',
    openaiSize: '512x512',
  }).init();

  const res = await api.prompt('A scenic coastal lighthouse at dusk, cinematic lighting');
  expect(typeof res).toBe('object');
  expect(res?.image?.path).toBeTruthy();
  const exists = await fs.pathExists(res.image.path);
  expect(exists).toBe(true);

  const sidecar = res.image.path.replace(/\.[^.]+$/, '.json');
  const sidecarExists = await fs.pathExists(sidecar);
  expect(sidecarExists).toBe(true);
});

// npm test -- lib/generator/image-image/textImage.test.js

