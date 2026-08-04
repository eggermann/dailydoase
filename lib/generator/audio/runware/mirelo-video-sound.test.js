import { expect, test } from '@jest/globals';

import { buildRunwareMireloTask } from './mirelo-video-sound.js';

test('buildRunwareMireloTask sends the failed trailer to Mirelo through Runware', () => {
  const task = buildRunwareMireloTask({
    taskUUID: 'runware-mirelo-task',
    model: 'mirelo:1@1',
    prompt: 'industrial Kaufhaus ambience',
    video: 'data:video/mp4;base64,abc',
    seed: 7,
    steps: 28,
  });

  expect(task).toEqual({
    taskType: 'audioInference',
    taskUUID: 'runware-mirelo-task',
    model: 'mirelo:1@1',
    positivePrompt: 'industrial Kaufhaus ambience',
    seed: 7,
    steps: 28,
    settings: { startOffset: 0 },
    inputs: { video: 'data:video/mp4;base64,abc' },
    numberResults: 1,
    outputType: 'URL',
    deliveryMethod: 'sync',
    includeCost: true,
  });
});
