import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'fs-extra';

import store from '../../../store.cjs';
import { PostToWan22_5B_ImageVideo } from '../../image-video/wan22/imageVideo.js';
import { saveJSON } from '../../save-utils.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

process.env.GENERATIONS_PATH = path.resolve(__dirname, 'GENERATIONS');
store.initCache(process.env.GENERATIONS_PATH);
const OUTPUT_DIR = path.resolve(__dirname, 'GENERATIONS', 'freshweb-step2-from-snapshot-test');
const GENERATOR_OUTPUT_SUBDIR = 'adapter/tests/GENERATIONS/freshweb-step2-from-snapshot-test';

const SNAPSHOT_IMAGE_PATH = process.env.SNAPSHOT_IMAGE_PATH
  || '/Users/eggermann/Projekte/dailydoase/lib/generator/adapter/tests/GENERATIONS/camera-snapshot/1772808930515-camera.jpg';

const STEP2_PROMPT = process.env.STEP2_PROMPT
  || 'next scene from this camera snapshot, subtle subject motion, natural handheld movement, candid documentary realism';

const run = async () => {
  await fs.ensureDir(OUTPUT_DIR);

  if (!(await fs.pathExists(SNAPSHOT_IMAGE_PATH))) {
    throw new Error(`Snapshot image not found: ${SNAPSHOT_IMAGE_PATH}`);
  }

  const api = await new PostToWan22_5B_ImageVideo({
    folderName: GENERATOR_OUTPUT_SUBDIR,
    duration_seconds: Number(process.env.TEST_SCENE_SECONDS) || 1,
    sampling_steps: Number(process.env.TEST_VIDEO_STEPS) || 1,
    guide_scale: Number(process.env.TEST_GUIDE_SCALE) || 1,
    shift: Number(process.env.TEST_SHIFT) || 1,
    height: Number(process.env.TEST_VIDEO_HEIGHT) || 256,
    width: Number(process.env.TEST_VIDEO_WIDTH) || 256,
    seed: Number(process.env.VID_SEED) || 424242,
  }).init();

  const result = await api.prompt(SNAPSHOT_IMAGE_PATH, {
    prompt: STEP2_PROMPT,
  });

  console.log('[step2-from-snapshot] input:', SNAPSHOT_IMAGE_PATH);
  console.log('[step2-from-snapshot] video:', result?.file);
  console.log('[step2-from-snapshot] json:', result?.json?.path);
  process.exit(0);
};

run().catch((err) => {
  (async () => {
    const errorText = String(err?.message || err);
    const errorPath = path.join(OUTPUT_DIR, `${Date.now()}-step2-error.json`);

    await saveJSON(errorPath, {
      snapshotImagePath: SNAPSHOT_IMAGE_PATH,
      prompt: STEP2_PROMPT,
      error: errorText,
      rawError: err,
    });

    console.error('Error in MIX-again-freshweb.step2-from-snapshot.test.js:', err);
    console.error('Saved error sidecar:', errorPath);
    process.exit(1);
  })().catch((saveErr) => {
    console.error('Error in MIX-again-freshweb.step2-from-snapshot.test.js:', err);
    console.error('Failed to save error sidecar:', saveErr);
    process.exit(1);
  });
});
