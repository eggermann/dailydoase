import fs from 'fs-extra';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { gateConcatAndUpload } from './gate-and-upload.js';

function hasFfmpeg() {
  try {
    const r = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' });
    const r2 = spawnSync('ffprobe', ['-version'], { encoding: 'utf8' });
    return r.status === 0 && r2.status === 0;
  } catch {
    return false;
  }
}

describe('gateConcatAndUpload (existing dataset)', () => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  // Use provided dataset folder for testing
  
  const folder = path.resolve(path.join(__dirname, '../../generator/test.datas/179-start-end-frame-video'));

  test('concatenates when dataset total duration exceeds threshold', async () => {
    if (!hasFfmpeg()) {
      console.warn('Skipping: ffmpeg/ffprobe not available');
      return;
    }
    if (!await fs.pathExists(folder)) {
      console.warn('Skipping: dataset folder not found →', folder);
      return;
    }
    const res = await gateConcatAndUpload({ imageDir: folder, options: { maxDuration } });
    expect(res.exceeded).toBe(true);
    expect(res.concatenated).toBe(true);
    expect(await fs.pathExists(res.outPath)).toBe(true);
    const stat = await fs.stat(res.outPath);
    expect(stat.size).toBeGreaterThan(0);
  }, 120_000);
  const maxDuration =20;// 60 * 3; // large threshold to avoid triggering concatenation
  test('does nothing when large threshold is used', async () => {
    if (!hasFfmpeg()) {
      console.warn('Skipping: ffmpeg/ffprobe not available');
      return;
    }
    if (!await fs.pathExists(folder)) {
      console.warn('Skipping: dataset folder not found →', folder);
      return;
    }
    const res = await gateConcatAndUpload({ imageDir: folder, options: { maxDuration } });
    expect(res.exceeded).toBe(false);
    expect(res.concatenated).toBe(false);
  }, 60_000);
});
//npm test -- lib/helper/yt-upload/gate-and-upload.test.js