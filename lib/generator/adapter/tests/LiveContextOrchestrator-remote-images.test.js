import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';

import { resolveLocalImageEntries } from '../shorty-book/LiveContextOrchestrator-remote-images.js';

describe('resolveLocalImageEntries', () => {
  let tempDir;

  afterEach(async () => {
    if (tempDir) await fs.remove(tempDir);
  });

  test('resolves existing absolute and relative paths and skips missing files', async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dailydoase-location-images-'));
    const firstImage = path.join(tempDir, 'first.jpeg');
    const secondImage = path.join(tempDir, 'second.jpeg');
    await fs.writeFile(firstImage, 'first');
    await fs.writeFile(secondImage, 'second');

    await expect(resolveLocalImageEntries({
      imagePaths: [firstImage, 'missing.jpeg', 'second.jpeg'],
      baseDir: tempDir,
    })).resolves.toEqual([
      {
        path: firstImage,
        url: '',
        source: 'scene-context-local-1',
      },
      {
        path: secondImage,
        url: '',
        source: 'scene-context-local-2',
      },
    ]);
  });
});
