import 'dotenv/config';
import { jest } from '@jest/globals';
import os from 'os';
import path from 'path';

import { PostToAIQTech_NSFWReal_TextImage } from './textImage.js';

// Allow extra time for real API
jest.setTimeout(180_000);

test('returns a created image file path (real API)', async () => {
  // Save in ./ (this folder)
  const api = await new PostToAIQTech_NSFWReal_TextImage({
    folderName: './test-generations',
    // Keep small dims; multiples of 32 enforced inside
    height: 256,
    width: 256,
    guidance_scale: 4,
    num_inference_steps: 8,
    randomize_seed: true,
    seed: 0,
  }).init();

  const res = await api.prompt('helllo world, beautiful detailed portrait of a slutty pic as a swamm');
  console.log('Result image path:', res);
  expect(typeof res).toBe('object');
  // Optional: verify JSON sidecar exists next to the file in this folder
  const jsonPath = res.file.replace(/\.[^.]+$/, '.json');
  expect(jsonPath.startsWith(path.resolve(path.dirname(new URL(import.meta.url).pathname)))).toBe(true);
});

// npm test -- lib/generator/aiqtech-NSFW-Real/textImage.test.js
