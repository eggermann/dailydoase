import { expect, test } from '@jest/globals';

import {
  buildRunwareImageTask,
  buildRunwareVideoTask,
  resolveRunwareImageDimensions,
} from './common.js';
import { resolveRunwareWanAudioSetting } from './imageVideo.js';

test('resolveRunwareWanAudioSetting keeps native WAN sound off unless explicitly enabled', () => {
  expect(resolveRunwareWanAudioSetting(undefined)).toBe(false);
  expect(resolveRunwareWanAudioSetting('0')).toBe(false);
  expect(resolveRunwareWanAudioSetting('1')).toBe(true);
  expect(resolveRunwareWanAudioSetting(true)).toBe(true);
});

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

test('buildRunwareImageTask omits fixed inference controls for FLUX Kontext Pro', () => {
  const task = buildRunwareImageTask({
    taskUUID: 'flux-kontext-pro-task',
    model: 'bfl:3@1',
    prompt: 'keep the Kaufhaus geometry',
    negativePrompt: 'collage, readable text',
    width: 448,
    height: 336,
    steps: 18,
    guidanceScale: 2.5,
    referenceImages: ['data:image/jpeg;base64,abc'],
  });

  expect(task.CFGScale).toBeUndefined();
  expect(task.steps).toBeUndefined();
  expect(task.negativePrompt).toBeUndefined();
  expect(task.width).toBe(1184);
  expect(task.height).toBe(880);
});

test('resolveRunwareImageDimensions keeps an exact supported portrait size', () => {
  expect(resolveRunwareImageDimensions({
    model: 'bfl:3@1',
    width: 880,
    height: 1184,
  })).toEqual({ width: 880, height: 1184 });
});

test('buildRunwareImageTask keeps CFGScale for models that support it', () => {
  const task = buildRunwareImageTask({
    taskUUID: 'supported-cfg-task',
    model: 'runware:106@1',
    prompt: 'repair scene drift',
    negativePrompt: 'broken geometry',
    steps: 20,
    guidanceScale: 2.5,
  });

  expect(task.CFGScale).toBe(2.5);
  expect(task.steps).toBe(20);
  expect(task.negativePrompt).toBe('broken geometry');
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
