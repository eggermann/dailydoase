import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';

import server from '../lib/server/index.cjs';
import fileWatcher from '../lib/store/fileWatcher.cjs';
import store from '../lib/store.cjs';

let httpServer;

beforeAll(() => {
  process.env.DISABLE_FILE_WATCH = '1';
  store.initCache('./tests/GENERATIONS');
  httpServer = server.init();
});

afterAll(async () => {
  await new Promise((resolve) => httpServer.close(resolve));
  fileWatcher.clearWatchers();
});

describe('folder image url helpers', () => {
  test('parses folder urls with hash fragments and image tails', () => {
    expect(server.__test.parseFolderFromAnyUrl(
      'https://dailydoase.de/v/252-FLUX#/1760984060622.jpeg'
    )).toBe('252-FLUX');
  });

  test('serves folder images by url through the api endpoint', async () => {
    const folder = '252-FLUX';
    const expectedCount = store.getFolder(folder).length;

    const response = await fetch(
      'http://127.0.0.1:4000/api/folder-images?url=https%3A%2F%2Fdailydoase.de%2Fv%2F252-FLUX%23%2F1760984060622.jpeg'
    );

    expect(response.status).toBe(200);

    const payload = await response.json();

    expect(payload.model).toBe('v');
    expect(payload.folder).toBe(folder);
    expect(payload.count).toBe(expectedCount);
    expect(payload.items[0]).toEqual(expect.objectContaining({
      index: 1,
      folderName: folder,
    }));
    expect(payload.items[0].absoluteUrl).toMatch(/^http:\/\/127\.0\.0\.1:4000\/v\/252-FLUX\//);
  });
});
