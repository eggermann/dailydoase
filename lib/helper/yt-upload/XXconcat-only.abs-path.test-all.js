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
  const paths = [
    "/Users/eggermann/Projekte/dailydoase/tests/tests/GENERATIONS/v_2-968-ginigenVeo3-free",
    "/Users/eggermann/Projekte/dailydoase/tests/tests/GENERATIONS/v_2-966-ginigenVeo3-free",
    "/Users/eggermann/Projekte/dailydoase/tests/tests/GENERATIONS/v_2-959-ginigenVeo3-free",
    "/Users/eggermann/Projekte/dailydoase/tests/tests/GENERATIONS/v_2-958-ginigenVeo3-free",
    "/Users/eggermann/Projekte/dailydoase/tests/tests/GENERATIONS/v_2-957-ginigenVeo3-free",
    "/Users/eggermann/Projekte/dailydoase/tests/tests/GENERATIONS/v_2-956-ginigenVeo3-free",
    "/Users/eggermann/Projekte/dailydoase/tests/tests/GENERATIONS/v_2-955-ginigenVeo3-free",
    "/Users/eggermann/Projekte/dailydoase/tests/tests/GENERATIONS/v_2-954-ginigenVeo3-free",
    "/Users/eggermann/Projekte/dailydoase/tests/tests/GENERATIONS/v_2-952-ginigenVeo3-free",
    "/Users/eggermann/Projekte/dailydoase/tests/tests/GENERATIONS/v_2-951-ginigenVeo3-free Kopie",
    "/Users/eggermann/Projekte/dailydoase/tests/tests/GENERATIONS/v_2-946-ginigenVeo3-free",
    "/Users/eggermann/Projekte/dailydoase/tests/tests/GENERATIONS/v_2-858-ltxVideos-test",
    "/Users/eggermann/Projekte/dailydoase/tests/tests/GENERATIONS/v_2-852-ltxVideos-test",
    "/Users/eggermann/Projekte/dailydoase/tests/tests/GENERATIONS/v_2-1060-kangaroo,Love,Code",
    "/Users/eggermann/Projekte/dailydoase/tests/tests/GENERATIONS/v_2-1056-GodSportAcid",
    "/Users/eggermann/Projekte/dailydoase/tests/tests/GENERATIONS/v_2-1055-GodSportAcid",
    "/Users/eggermann/Projekte/dailydoase/tests/tests/GENERATIONS/v_2-1043-GodSportAcid",
    "/Users/eggermann/Projekte/dailydoase/tests/tests/GENERATIONS/v_2-1022-ginigenVeo3-free",
    "/Users/eggermann/Projekte/dailydoase/tests/tests/GENERATIONS/v_2-1021-ginigenVeo3-free",
    "/Users/eggermann/Projekte/dailydoase/tests/GENERATIONS/v_2-959-ginigenVeo3-free",
    "/Users/eggermann/Projekte/dailydoase/tests/GENERATIONS/v_2-947-ginigenVeo3-free",
    "/Users/eggermann/Projekte/dailydoase/tests/GENERATIONS/v_2-858-ltxVideos-test",
    "/Users/eggermann/Projekte/dailydoase/tests/GENERATIONS/v_2-655-ltxVideos-test"
  ];

  for (const videoDir of paths) {
    test(`concatenates clips in ${videoDir}`, async () => {
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
  }
});
//npm test -- lib/helper/yt-upload/concat-only.abs-path.test.js