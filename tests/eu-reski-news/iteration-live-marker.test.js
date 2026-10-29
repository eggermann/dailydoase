import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from '@jest/globals';
import {
  clearIterationLiveMarker,
  iterationLiveMarkerName,
  writeIterationLiveMarker,
} from '../../eu-reski-news/news-scene/iteration-live-marker.mjs';

let directory;

afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
  directory = null;
});

describe('iteration live marker', () => {
  test('writes active marker in iteration folder and removes it on completion', async () => {
    directory = await mkdtemp(join(tmpdir(), 'eu-reski-live-marker-'));
    await writeIterationLiveMarker(directory, {
      status: 'running', processId: 321, iteration: 2, directory: 'iteration-002', resumed: false,
    });

    expect(JSON.parse(await readFile(join(directory, iterationLiveMarkerName), 'utf8')))
      .toMatchObject({ status: 'running', processId: 321, iteration: 2, directory: 'iteration-002' });

    await clearIterationLiveMarker(directory);
    await expect(readFile(join(directory, iterationLiveMarkerName))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(clearIterationLiveMarker(directory)).resolves.toBeUndefined();
  });
});
