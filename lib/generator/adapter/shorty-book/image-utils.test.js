import { expect, test } from '@jest/globals';

import { buildImagePrompt } from './image-utils.js';

test('buildImagePrompt resolves the current scene prompt from the scene loop', async () => {
  const prompt = await buildImagePrompt([], {
    sceneLoop: {
      scenePlan: [
        { stillPrompt: 'scene one destination' },
        { singleImagePrompt: 'scene two destination' },
      ],
    },
    sceneContext: { index: 2 },
  });

  expect(prompt).toBe('scene two destination');
});

