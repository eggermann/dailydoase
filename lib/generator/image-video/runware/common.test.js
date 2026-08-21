import { describe, expect, jest, test } from '@jest/globals';

import {
  buildRunwareVideoTask,
  normalizeRunwareFrameImages,
  requestRunware,
} from './common.js';

describe('requestRunware', () => {
  test('aborts a stalled request at the supplied timeout', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = jest.fn((url, options = {}) => new Promise((resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(options.signal.reason), { once: true });
    }));

    try {
      await expect(requestRunware({
        apiKey: 'runware-test-key',
        body: [{ taskType: 'imageInference' }],
        timeoutMs: 5,
      })).rejects.toThrow('Runware request timed out after 5ms');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('normalizeRunwareFrameImages', () => {
  test('nests the current Runware image field while accepting the legacy adapter field', () => {
    expect(normalizeRunwareFrameImages([
      { frame: 'first', inputImage: 'data:image/png;base64,abc' },
    ])).toEqual([
      { frame: 'first', image: 'data:image/png;base64,abc' },
    ]);
  });
});

describe('buildRunwareVideoTask', () => {
  test('builds Wan 2.7 first/last interpolation with current image fields', () => {
    const task = buildRunwareVideoTask({
      taskUUID: 'task-1',
      model: 'alibaba:wan@2.7',
      prompt: 'Move between both frames.',
      durationSeconds: 3,
      width: 512,
      height: 384,
      resolution: '720p',
      frameImages: [
        { frame: 'first', inputImage: 'start-image' },
        { frame: 'last', inputImage: 'end-image' },
      ],
    });

    expect(task.inputs.frameImages).toEqual([
      { frame: 'first', image: 'start-image' },
      { frame: 'last', image: 'end-image' },
    ]);
    expect(task.settings).toEqual({ audio: false, promptExtend: false });
    expect(task.providerSettings).toBeUndefined();
    expect(task.resolution).toBe('720p');
    expect(task.width).toBeUndefined();
    expect(task.height).toBeUndefined();
  });

  test('keeps Wan 2.6 provider settings and dimensions for single-frame video', () => {
    const task = buildRunwareVideoTask({
      taskUUID: 'task-2',
      model: 'alibaba:wan@2.6-flash',
      durationSeconds: 3,
      width: 512,
      height: 384,
      frameImages: [{ frame: 'first', image: 'start-image' }],
    });

    expect(task.providerSettings.alibaba.shotType).toBe('single');
    expect(task.settings).toBeUndefined();
    expect(task.width).toBe(512);
    expect(task.height).toBe(384);
  });
});
