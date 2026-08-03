import { expect, test } from '@jest/globals';

import {
  buildRunwareImageTask,
  buildRunwareVideoTask,
} from './common.js';

test('buildRunwareImageTask nests FLUX Kontext references in inputs', () => {
  const task = buildRunwareImageTask({
    taskUUID: 'image-task',
    model: 'runware:106@1',
    prompt: 'one unified scene',
    width: 1184,
    height: 880,
    referenceImages: ['data:image/jpeg;base64,abc'],
  });

  expect(task).toEqual(expect.objectContaining({
    taskType: 'imageInference',
    taskUUID: 'image-task',
    model: 'runware:106@1',
    width: 1184,
    height: 880,
    inputs: {
      referenceImages: ['data:image/jpeg;base64,abc'],
    },
  }));
  expect(task.referenceImages).toBeUndefined();
});

test('buildRunwareVideoTask uses WAN frame input, 720p, and no incompatible dimensions', () => {
  const task = buildRunwareVideoTask({
    taskUUID: 'video-task',
    model: 'alibaba:wan@2.6-flash',
    prompt: 'the monster wakes',
    durationSeconds: 3,
    width: 448,
    height: 336,
    resolution: '720p',
    frameImages: [{ frame: 'first', image: 'data:image/png;base64,abc' }],
    providerSettings: {
      alibaba: { audio: false, promptExtend: false },
    },
  });

  expect(task).toEqual(expect.objectContaining({
    taskType: 'videoInference',
    taskUUID: 'video-task',
    model: 'alibaba:wan@2.6-flash',
    duration: 3,
    resolution: '720p',
    inputs: {
      frameImages: [{ frame: 'first', image: 'data:image/png;base64,abc' }],
    },
    providerSettings: {
      alibaba: { audio: false, promptExtend: false },
    },
  }));
  expect(task.width).toBeUndefined();
  expect(task.height).toBeUndefined();
  expect(task.frameImages).toBeUndefined();
});

test('buildRunwareVideoTask clamps WAN duration to supported range', () => {
  expect(buildRunwareVideoTask({ durationSeconds: 1 }).duration).toBe(2);
  expect(buildRunwareVideoTask({ durationSeconds: 30 }).duration).toBe(15);
});
