import { describe, expect, test } from '@jest/globals';
import fs from 'fs-extra';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import getIamge from '../../../helper/getIamge.js';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const hasEnabledFlag = () => {
  const value = String(process.env.CAMERA_SNAPSHOT_TEST || '').toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(value);
};

const hasImageSnap = async () => {
  try {
    await execFileAsync('imagesnap', ['-h']);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return false;
    }
    return true;
  }
};

const hasFfmpeg = async () => {
  try {
    await execFileAsync('ffmpeg', ['-version']);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return false;
    }
    return true;
  }
};

const canCaptureWebcam = async () => {
  if (!hasEnabledFlag()) {
    return false;
  }
  return (await hasFfmpeg()) || (await hasImageSnap());
};

describe('freshweb camera snapshot helper', () => {
  test('captures a webcam snapshot to disk', async () => {
    if (!(await canCaptureWebcam())) {
      console.warn(
        'Skipping webcam snapshot test. Set CAMERA_SNAPSHOT_TEST=1 and make ffmpeg or imagesnap available to enable it.'
      );
      return;
    }

    const outputDir = path.resolve(__dirname, 'GENERATIONS', 'camera-snapshot');
    const imagePath = await getIamge({
      outputDir,
      width: Number(process.env.CAMERA_WIDTH) || 1280,
      height: Number(process.env.CAMERA_HEIGHT) || 720,
      quality: Number(process.env.CAMERA_QUALITY) || 100,
      warmupSeconds: Number(process.env.CAMERA_WARMUP_SECONDS) || 1,
      output: 'jpeg',
      extension: 'jpg',
      device: process.env.CAMERA_DEVICE || false,
    });

    expect(typeof imagePath).toBe('string');
    expect(path.isAbsolute(imagePath)).toBe(true);

    const exists = await fs.pathExists(imagePath);
    expect(exists).toBe(true);

    const stats = await fs.stat(imagePath);
    expect(stats.size).toBeGreaterThan(0);

    console.log('\x1b[32m%s\x1b[0m', `[camera-snapshot] saved jpeg: ${imagePath}`);
  }, 30_000);
});
