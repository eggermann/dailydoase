import fs from 'fs-extra';
import os from 'os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { normalizeVideoOutput, probeVideoStream } from './ffmpeg-helpers.js';

describe('normalizeVideoOutput', () => {
  test('resizes and retimes a clip onto the requested canvas', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ffmpeg-helpers-'));
    const videoPath = path.join(tmpDir, 'input.mp4');

    execFileSync('ffmpeg', [
      '-hide_banner',
      '-loglevel', 'error',
      '-y',
      '-f', 'lavfi',
      '-i', 'color=c=black:s=1280x720:r=16',
      '-t', '5',
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      videoPath,
    ]);

    await normalizeVideoOutput(videoPath, {
      targetDurationSeconds: 2,
      targetFps: 8,
      targetWidth: 512,
      targetHeight: 384,
    });

    const stream = await probeVideoStream(videoPath);
    expect(stream.width).toBe(512);
    expect(stream.height).toBe(384);
    expect(stream.fps).toBeCloseTo(8, 1);
    expect(stream.duration).toBeCloseTo(2, 1);
  });
});
