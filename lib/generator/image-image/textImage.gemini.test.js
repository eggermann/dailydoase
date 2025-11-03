import 'dotenv/config';
import { jest } from '@jest/globals';
import fs from 'fs-extra';

import { PostToImageImage_TextImage } from './textImage.js';

jest.setTimeout(180_000);

let genaiAvailable = true;
try {
  await import('@google/genai');
} catch {
  genaiAvailable = false;
}

const hasKey = !!(process.env.GOOGLE_API_KEY || process.env.GOOGLE_API_KEY_BEARER);
const runGemini = genaiAvailable && hasKey;

(runGemini ? test : test.skip)(
  'generates image via Gemini with optional inline reference',
  async () => {
    const api = await new PostToImageImage_TextImage({
      folderName: './test-generations-gemini',
      openaiSize: '1024x1024',
      provider: 'gemini',
    }).init();

    const prompt = 'Create a simple abstract pattern with a soft color palette.';

    // Optionally include a local reference image if present
    const ref = 'lib/generator/test.datas/timba-lake.png';
    const images = (await fs.pathExists(ref)) ? [{ path: ref }] : [];

    const res = await api.prompt(prompt, { provider: 'gemini', images });

    expect(typeof res).toBe('object');
    expect(res.image).toBeDefined();
    expect(res.image.path).toBeTruthy();

    const exists = await fs.pathExists(res.image.path);
    expect(exists).toBe(true);

    expect(res.json).toBeDefined();
    expect(res.json.prompt).toBe(prompt);
    if (images.length) {
      expect(Array.isArray(res.json.referenceImages)).toBe(true);
    }

    const ext = res.image.path.split('.').pop().toLowerCase();
    expect(['png','jpg','jpeg','webp']).toContain(ext);
  }
);

// npm test -- lib/generator/image-image/textImage.gemini.test.js

