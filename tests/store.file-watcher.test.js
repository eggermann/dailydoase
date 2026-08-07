import { afterEach, describe, expect, test } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';

import cacheManager from '../lib/store/cacheManager.cjs';
import fileWatcher from '../lib/store/fileWatcher.cjs';

const waitFor = async (predicate, timeoutMs = 3000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Timed out waiting for filesystem cache refresh');
};

let generationRoot;

afterEach(() => {
  fileWatcher.clearWatchers();
  if (generationRoot) {
    fs.rmSync(generationRoot, { recursive: true, force: true });
    generationRoot = undefined;
  }
});

describe('generation filesystem watcher', () => {
  test('discovers a newly published folder without polling', async () => {
    generationRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dailydoase-generations-'));
    cacheManager.initialize(generationRoot);

    const trailerFolder = path.join(generationRoot, 'CANK-TRAILER');
    fs.mkdirSync(trailerFolder);
    fs.writeFileSync(path.join(trailerFolder, '1-trailer.mp4'), 'video');

    await waitFor(() => cacheManager.getFolder('CANK-TRAILER').length === 1);

    expect(cacheManager.getFolder('CANK-TRAILER')[0].file).toBe('1-trailer.mp4');
  });

  test('removes a deleted folder from cache', async () => {
    generationRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dailydoase-generations-'));
    const trailerFolder = path.join(generationRoot, 'CANK-TRAILER');
    fs.mkdirSync(trailerFolder);
    fs.writeFileSync(path.join(trailerFolder, '1-trailer.mp4'), 'video');
    cacheManager.initialize(generationRoot);

    fs.rmSync(trailerFolder, { recursive: true, force: true });

    await waitFor(() => cacheManager.getFolder('CANK-TRAILER').length === 0);

    expect(cacheManager.getCache()).not.toHaveProperty('CANK-TRAILER');
  });

  test('updates a new file inside an already watched folder', async () => {
    generationRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dailydoase-generations-'));
    const trailerFolder = path.join(generationRoot, 'CANK-TRAILER');
    fs.mkdirSync(trailerFolder);
    fs.writeFileSync(path.join(trailerFolder, '1-trailer.mp4'), 'video');
    cacheManager.initialize(generationRoot);

    fs.writeFileSync(path.join(trailerFolder, '2-trailer.mp4'), 'video');

    await waitFor(() => cacheManager.getFolder('CANK-TRAILER').length === 2);

    expect(cacheManager.getFolder('CANK-TRAILER').map((file) => file.file)).toEqual([
      '1-trailer.mp4',
      '2-trailer.mp4',
    ]);
  });
});
