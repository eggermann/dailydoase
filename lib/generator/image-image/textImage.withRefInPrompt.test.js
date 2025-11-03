import 'dotenv/config';
import { jest } from '@jest/globals';
import fs from 'fs-extra';

import { PostToImageImage_TextImage } from './textImage.js';

jest.setTimeout(180_000);

test('generates image referencing Banana_Girl_BG_bikini.png in prompt (OpenAI generations)', async () => {
  const api = await new PostToImageImage_TextImage({
    folderName: './test-generations-banana-girl',
    openaiSize: '1024x1024',
  }).init();

  const prompt = ` Banana_Girl_BG.png eating a hamburger.`;

  const options = { openaiSize: '1024x1024' };

  const res = await api.prompt(prompt, options);

  // Basic result shape
  expect(typeof res).toBe('object');
  expect(res.image).toBeDefined();
  expect(res.image.path).toBeTruthy();

  // File should exist on disk
  const exists = await fs.pathExists(res.image.path);
  expect(exists).toBe(true);

  // JSON metadata should be present
  expect(res.json).toBeDefined();
  expect(res.json.prompt).toBe(prompt);
  expect(res.json.openaiSize).toBe(options.openaiSize);

  // Optionally check the generated file extension
  const ext = res.image.path.split('.').pop().toLowerCase();
  expect(['png','jpg','jpeg','webp']).toContain(ext);
});

// npm test -- lib/generator/image-image/textImage.withRefInPrompt.test.js