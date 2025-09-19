import fs from 'fs-extra';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

import { concatVideos } from './concat-and-upload.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function hasFfmpeg() {
  try {
    const r = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' });
    return r.status === 0;
  } catch {
    return false;
  }
}

describe('concat-and-upload helpers', () => {
  const tmpDir = path.join(__dirname, 'tmp-concat');

  beforeAll(async () => {
    await fs.ensureDir(tmpDir);
  });

  afterAll(async () => {
    // keep artifacts for manual inspection if needed
    // await fs.remove(tmpDir);
  });

  test('concatVideos concatenates two short clips when ffmpeg is available', async () => {
    if (!hasFfmpeg()) {
      console.warn('Skipping concatVideos test: ffmpeg not available');
      return;
    }

    // Create two 1s color clips with silent audio
    const seg1 = path.join(tmpDir, 'a1.mp4');
    const seg2 = path.join(tmpDir, 'a2.mp4');

    const mk = (color, out) => spawnSync('ffmpeg', [
      '-y',
      '-f', 'lavfi', '-i', `color=c=${color}:s=320x240:d=1`,
      '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
      '-shortest',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k',
      out
    ], { stdio: 'ignore' });

    let r1 = mk('red', seg1);
    let r2 = mk('blue', seg2);
    if (r1.status !== 0 || r2.status !== 0) {
      console.warn('Skipping concatVideos test: could not generate sample videos');
      return;
    }

    const output = path.join(tmpDir, 'joined.mp4');
    const outPath = await concatVideos({ videoDir: tmpDir, pattern: '*.mp4', output });
    expect(outPath).toBe(output);
    const stat = await fs.stat(outPath);
    expect(stat.size).toBeGreaterThan(0);
  }, 60_000);
});

