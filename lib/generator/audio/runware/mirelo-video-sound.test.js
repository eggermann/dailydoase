import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';

import { expect, jest, test, beforeEach } from '@jest/globals';

const requestRunware = jest.fn();
const resolveRunwareKey = jest.fn();

await jest.unstable_mockModule('../../image-video/runware/common.js', () => ({
  requestRunware,
  resolveRunwareKey,
}));

const {
  buildRunwareMireloTask,
  resolveRunwareMireloVideoInput,
} = await import('./mirelo-video-sound.js');

beforeEach(() => {
  requestRunware.mockReset();
});

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
    seed: 7,
    steps: 28,
    settings: { startOffset: 0 },
    inputs: { video: 'data:video/mp4;base64,abc' },
    positivePrompt: 'industrial Kaufhaus ambience',
    numberResults: 1,
    outputType: 'URL',
    deliveryMethod: 'sync',
    includeCost: true,
  });
});

test('resolveRunwareMireloVideoInput uploads a local file through Runware media storage', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mirelo-video-test-'));
  const tmpPath = path.join(tmpDir, 'input.mp4');
  await fs.writeFile(tmpPath, Buffer.from('fake-video'));

  requestRunware.mockResolvedValue({
    data: [
      {
        taskUUID: 'media-upload-task',
        mediaURL: 'https://runware.example/media/input.mp4',
      },
    ],
  });

  await expect(resolveRunwareMireloVideoInput(tmpPath, { runwareKey: 'rk_test' }))
    .resolves.toBe('https://runware.example/media/input.mp4');

  expect(requestRunware).toHaveBeenCalledWith(expect.objectContaining({
    apiKey: 'rk_test',
    body: [
      expect.objectContaining({
        taskType: 'mediaStorage',
        operation: 'upload',
        media: expect.stringMatching(/^data:video\/mp4;base64,/),
      }),
    ],
  }));
});
