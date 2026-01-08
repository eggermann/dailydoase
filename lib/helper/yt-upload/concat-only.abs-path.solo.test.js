import fs from 'fs-extra';
import path from 'path';
import { spawnSync } from 'child_process';
import fg from 'fast-glob';
import { concatVideos } from './concat-and-upload.js';

function hasFfmpeg() {
  try {
    const r = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' });
    return r.status === 0;
  } catch {
    return false;
  }
}
//294-start-end-frame-mirelo/merged
describe('concatVideos (absolute path)', () => {
  //const videoDir = '/Users/eggermann/Projekte/dailydoase/lib/generator/test.datas/179-start-end-frame-video';
const videoDir  ='/Users/eggermann/Projekte/dailydoase/lib/generator/adapter/tests/GENERATIONS/367-start-end-frame-mirelo/merged';//='/Users/eggermann/Projekte/dailydoase/lib/generator/adapter/tests/GENERATIONS/294-start-end-frame-mirelo/merged';//'/Users/eggermann/Projekte/dailydoase/lib/generator/adapter/tests/GENERATIONS/293-start-end-frame-mirelo/merged'/Users/eggermann/Projekte/dailydoase/lib/generator/adapter/tests/GENERATIONS/287-start-end-frame-mirelo/merged';// '/Users/eggermann/Projekte/dailydoase/tests/GENERATIONS/251-start-end-frame-mirelo/merged';//'/Users/eggermann/Projekte/dailydoase/lib/generator/adapter/tests/GENERATIONS/232-start-end-frame-mirelo/merged';///Users/eggermann/Projekte/dailydoase/lib/generator/adapter/tests/GENERATIONS/224-start-end-frame-mirelo/merged';///Users/eggermann/Projekte/dailydoase/lib/generator/adapter/tests/GENERATIONS/191-start-end-frame-mirelo/merged';///Users/eggermann/Projekte/dailydoase/lib/generator/adapter/tests/GENERATIONS/193-start-end-frame-mirelo/merged';//'/Users/eggermann/Projekte/dailydoase/lib/generator/adapter/tests/GENERATIONS/199-start-end-frame-mirelo/merged';//'/Users/eggermann/Projekte/dailydoase/lib/generator/adapter/tests/GENERATIONS/201-start-end-frame-mirelo/merged';///Users/eggermann/Projekte/dailydoase/lib/generator/adapter/tests/GENERATIONS/185-start-end-frame-mirelo/merged';///Users/eggermann/Projekte/dailydoase/lib/generator/adapter/tests/GENERATIONS/157-start-end-frame-video/parts';
  test('concatenates clips from provided directory', async () => {
    if (!hasFfmpeg()) {
      console.warn('Skipping: ffmpeg not available');
      return;
    }
    if (!await fs.pathExists(videoDir)) {
      console.warn('Skipping: directory not found →', videoDir);
      return;
    }
    const found = await fg(['*.{mp4,mkv,mov}'], { cwd: videoDir, dot: false });
    if (!found || found.length === 0) {
      console.warn('Skipping: no video files found in', videoDir);
      return;
    }

    const output = path.join(videoDir, `joined-test-${Date.now()}.mp4`);
    const outPath = await concatVideos({ videoDir, pattern: '*.{mp4,mkv,mov}', output });
    expect(outPath).toBe(output);
    expect(await fs.pathExists(outPath)).toBe(true);
    const stat = await fs.stat(outPath);
    expect(stat.size).toBeGreaterThan(0);
  }, 120_000);
});
//npm test -- lib/helper/yt-upload/concat-only.abs-path.solo.test.js