import { describe, expect, test } from '@jest/globals';

import { buildRunwareImageInferenceTask } from './common.js';

describe('Runware image inference', () => {
  test('sends at most ten real reference images in priority order', () => {
    const references = Array.from({ length: 12 }, (_, index) => `data:image/png;base64,reference-${index}`);
    const task = buildRunwareImageInferenceTask({
      taskUUID: 'test-task',
      model: 'bfl:6@1',
      prompt: 'Keep the real room stable.',
      width: 1184,
      height: 880,
      referenceImages: [references[0], references[0], ...references.slice(1)],
    });

    expect(task).toMatchObject({
      taskType: 'imageInference',
      taskUUID: 'test-task',
      model: 'bfl:6@1',
      inputs: { referenceImages: references.slice(0, 10) },
    });
  });
});
