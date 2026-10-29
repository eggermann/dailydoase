import { describe, expect, test } from '@jest/globals';

import {
  buildRunwareImageInferenceTask,
  buildRunwareVideoInferenceTask,
} from './common.js';

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

describe('Runware video inference', () => {
  test('sends H3 frame images with resolution instead of incompatible width and height', () => {
    const task = buildRunwareVideoInferenceTask({
      taskUUID: 'h3-test-task',
      model: 'minimax:h3@max-turbo',
      prompt: 'A visitor turns toward the camera. Sound: quiet room tone.',
      durationSeconds: 5,
      width: 640,
      height: 480,
      resolution: '480p',
      frameImages: [
        { frame: 'first', image: 'data:image/png;base64,first' },
        { frame: 'last', image: 'data:image/png;base64,last' },
      ],
    });

    expect(task).toMatchObject({
      taskType: 'videoInference',
      taskUUID: 'h3-test-task',
      model: 'minimax:h3@max-turbo',
      duration: 5,
      resolution: '480p',
      inputs: {
        frameImages: [
          { frame: 'first', image: 'data:image/png;base64,first' },
          { frame: 'last', image: 'data:image/png;base64,last' },
        ],
      },
    });
    expect(task).not.toHaveProperty('frameImages');
    expect(task).not.toHaveProperty('width');
    expect(task).not.toHaveProperty('height');
  });
});
