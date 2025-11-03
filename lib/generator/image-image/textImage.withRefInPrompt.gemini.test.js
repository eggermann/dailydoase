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
  'generates image via Gemini referencing Banana_Girl_BG_bikini.png in prompt',
  async () => {
    const api = await new PostToImageImage_TextImage({
      folderName: './test-generations-banana-girl-gemini',
      provider: 'gemini',
    }).init();

    const prompt = 'Create a vibrant composition based on Banana_Girl_BG_bikini.png colors.';

    const res = await api.prompt(prompt, { provider: 'gemini' });

    // Basic result shape
    expect(typeof res).toBe('object');
    expect(res.image).toBeDefined();
    expect(res.image.path).toBeTruthy();

    const exists = await fs.pathExists(res.image.path);
    expect(exists).toBe(true);

    // JSON metadata
    expect(res.json).toBeDefined();
    expect(res.json.prompt).toBe(prompt);

    // Should have auto-resolved reference image from the prompt
    if (Array.isArray(res.json.referenceImages)) {
      const hasRef = res.json.referenceImages.some((p) => String(p).includes('Banana_Girl_BG_bikini.png'));
      expect(hasRef).toBe(true);
    }

    const ext = res.image.path.split('.').pop().toLowerCase();
    expect(['png', 'jpg', 'jpeg', 'webp']).toContain(ext);
  }
);

// npm test -- lib/generator/image-image/textImage.withRefInPrompt.gemini.test.js

