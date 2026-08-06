import os from 'os';
import fs from 'fs-extra';
import path from 'path';
import { expect, jest, test } from '@jest/globals';

import { PostToMirelo_VideoSound } from './video-sound.js';

describe('PostToMirelo_VideoSound._ensureVideoUrl', () => {
  test('throws when local upload fails and no demo fallback is configured', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mirelo-url-test-'));
    const localPath = path.join(tmpDir, 'input.mp4');
    await fs.writeFile(localPath, 'demo');

    const client = new PostToMirelo_VideoSound({
      folderName: path.basename(tmpDir),
      uploadFn: async () => {
        throw new Error('upload boom');
      },
      fallback_demo_url: '',
    });

    await expect(client._ensureVideoUrl(localPath)).rejects.toThrow('upload boom');
  });

  test('uses the explicit demo fallback when local upload fails', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mirelo-url-test-'));
    const localPath = path.join(tmpDir, 'input.mp4');
    await fs.writeFile(localPath, 'demo');

    const client = new PostToMirelo_VideoSound({
      folderName: path.basename(tmpDir),
      uploadFn: async () => {
        throw new Error('upload boom');
      },
      fallback_demo_url: 'https://example.com/demo.mp4',
    });

    await expect(client._ensureVideoUrl(localPath)).resolves.toBe('https://example.com/demo.mp4');
  });
});

test('prompt routes audioOnly requests to SFX generation', async () => {
  const client = new PostToMirelo_VideoSound({ folderName: 'mirelo-url-test-routing' });
  const sfx = jest.spyOn(client, 'runVideoToSfx').mockResolvedValue('/tmp/sfx.wav');
  const v2v = jest.spyOn(client, 'runVideoToVideo').mockResolvedValue('/tmp/video.mp4');

  await expect(client.prompt('https://example.com/input.mp4', { audioOnly: true })).resolves.toBe('/tmp/sfx.wav');
  expect(sfx).toHaveBeenCalledTimes(1);
  expect(v2v).not.toHaveBeenCalled();

  sfx.mockRestore();
  v2v.mockRestore();
});

test('prompt routes non-audioOnly requests to video-to-video generation', async () => {
  const client = new PostToMirelo_VideoSound({ folderName: 'mirelo-url-test-routing-v2v' });
  const sfx = jest.spyOn(client, 'runVideoToSfx').mockResolvedValue('/tmp/sfx.wav');
  const v2v = jest.spyOn(client, 'runVideoToVideo').mockResolvedValue('/tmp/video.mp4');

  await expect(client.prompt('https://example.com/input.mp4', { audioOnly: false })).resolves.toBe('/tmp/video.mp4');
  expect(v2v).toHaveBeenCalledTimes(1);
  expect(sfx).not.toHaveBeenCalled();

  sfx.mockRestore();
  v2v.mockRestore();
});
