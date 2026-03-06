import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'fs-extra';

import store from '../../../store.cjs';
import { saveJSON } from '../../save-utils.js';
import { PostToWan22_FirstLastFrame } from '../../image-video/wan22/firstLastFrame.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

process.env.GENERATIONS_PATH = path.resolve(__dirname, 'GENERATIONS');
store.initCache(process.env.GENERATIONS_PATH);

const OUTPUT_DIR = path.resolve(__dirname, 'GENERATIONS', 'wan-firstlast-min-video-test');

const SNAPSHOT_IMAGE_PATH = process.env.SNAPSHOT_IMAGE_PATH
  || '/Users/eggermann/Projekte/dailydoase/lib/generator/adapter/tests/GENERATIONS/camera-snapshot/1772808930515-camera.jpg';

const PROMPT = process.env.MIN_VIDEO_PROMPT
  || 'minimal 1s camera motion from this still, subtle handheld drift, documentary realism';

const run = async () => {
  await fs.ensureDir(OUTPUT_DIR);
  if (!(await fs.pathExists(SNAPSHOT_IMAGE_PATH))) {
    throw new Error(`Snapshot image not found: ${SNAPSHOT_IMAGE_PATH}`);
  }

  const api = await new PostToWan22_FirstLastFrame({
    folderName: 'adapter/tests/GENERATIONS/wan-firstlast-min-video-test',
    duration_seconds: Number(process.env.TEST_SCENE_SECONDS) || 1,
    steps: Number(process.env.TEST_VIDEO_STEPS) || 2,
    guidance_scale: Number(process.env.TEST_GUIDE_SCALE) || 1,
    guidance_scale_2: Number(process.env.TEST_GUIDE_SCALE_2) || 1,
    seed: Number.isFinite(Number(process.env.VID_SEED)) ? Number(process.env.VID_SEED) : 0,
    randomize_seed: false,
    space: process.env.WAN22_FIRST_LAST_SPACE || 'cakegreen/Wan-2-2-first-last-frame',
  }).init();

  const res = await api.prompt(SNAPSHOT_IMAGE_PATH, {
    endImageStream: SNAPSHOT_IMAGE_PATH,
    prompt: PROMPT,
    duration_seconds: Number(process.env.TEST_SCENE_SECONDS) || 1,
    steps: Number(process.env.TEST_VIDEO_STEPS) || 2,
    seed: Number.isFinite(Number(process.env.VID_SEED)) ? Number(process.env.VID_SEED) : 0,
    randomize_seed: false,
  });

  console.log('[wan-firstlast-min-video] input:', SNAPSHOT_IMAGE_PATH);
  console.log('[wan-firstlast-min-video] video:', res?.file);
  console.log('[wan-firstlast-min-video] json:', res?.json?.path);
  process.exit(0);
};

run().catch((err) => {
  (async () => {
    const errorText = String(err?.message || err);
    const errorPath = path.join(OUTPUT_DIR, `${Date.now()}-min-video-error.json`);
    await saveJSON(errorPath, {
      snapshotImagePath: SNAPSHOT_IMAGE_PATH,
      prompt: PROMPT,
      error: errorText,
      rawError: err,
    });
    console.error('Error in wan-firstlast.min-video.test.js:', err);
    console.error('Saved error sidecar:', errorPath);
    process.exit(1);
  })().catch((saveErr) => {
    console.error('Error in wan-firstlast.min-video.test.js:', err);
    console.error('Failed to save error sidecar:', saveErr);
    process.exit(1);
  });
});
