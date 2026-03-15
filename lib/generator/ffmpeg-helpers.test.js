import fs from 'fs-extra';
import os from 'os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';

import { extractLastFrame, forceVideoEndImage, normalizeVideoOutput, probeVideoStream } from './ffmpeg-helpers.js';

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

describe('forceVideoEndImage', () => {
  test('replaces the clip tail with the provided still image', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ffmpeg-end-image-'));
    const videoPath = path.join(tmpDir, 'input.mp4');
    const endImagePath = path.join(tmpDir, 'end.png');
    const lastFramePath = path.join(tmpDir, 'last.png');

    execFileSync('ffmpeg', [
      '-hide_banner',
      '-loglevel', 'error',
      '-y',
      '-f', 'lavfi',
      '-i', 'color=c=red:s=320x240:r=10',
      '-t', '1.2',
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      videoPath,
    ]);

    execFileSync('ffmpeg', [
      '-hide_banner',
      '-loglevel', 'error',
      '-y',
      '-f', 'lavfi',
      '-i', 'color=c=lime:s=320x240',
      '-frames:v', '1',
      endImagePath,
    ]);

    await forceVideoEndImage(videoPath, endImagePath, {
      targetDurationSeconds: 1.2,
      targetFps: 10,
      targetWidth: 320,
      targetHeight: 240,
      holdDurationSeconds: 0.3,
    });

    await extractLastFrame(videoPath, lastFramePath);

    const stats = await sharp(lastFramePath).stats();
    expect(stats.channels[1].mean).toBeGreaterThan(150);
    expect(stats.channels[1].mean).toBeGreaterThan(stats.channels[0].mean + 80);
    expect(stats.channels[1].mean).toBeGreaterThan(stats.channels[2].mean + 80);
  });
});
