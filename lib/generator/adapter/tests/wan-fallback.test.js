/**
 * Live fal.ai WAN fallback smoke test.
 *
 * Run from repo root:
 * node lib/generator/adapter/tests/wan-fallback.test.js
 *
 * Optional:
 * FAL_AI_API_KEY=... node lib/generator/adapter/tests/wan-fallback.test.js
 * WAN_FALLBACK_TEST_SINGLE=0 node lib/generator/adapter/tests/wan-fallback.test.js
 * WAN_FALLBACK_TEST_FIRST_LAST=0 node lib/generator/adapter/tests/wan-fallback.test.js
 */

import dotenv from 'dotenv';
import fs from 'fs-extra';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import store from '../../../store.cjs';
import { saveJSON } from '../../save-utils.js';
import { PostToFal_ImageVideo } from '../../image-video/fal/imageVideo.js';
import { PostToFal_FirstLastFrame } from '../../image-video/fal/firstLastFrame.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

process.env.GENERATIONS_PATH = path.resolve(__dirname, 'GENERATIONS');
store.initCache(process.env.GENERATIONS_PATH);

const OUTPUT_DIR = path.resolve(__dirname, 'GENERATIONS', 'wan-fallback-test');
const START_IMAGE_PATH = process.env.WAN_FALLBACK_START_IMAGE
  || path.resolve(__dirname, 'GENERATIONS/camera-snapshot/1772808930515-camera.jpg');
const END_IMAGE_PATH = process.env.WAN_FALLBACK_END_IMAGE
  || path.resolve(__dirname, '../../test.datas/timba-lake.png');
const RUN_SINGLE = !['0', 'false', 'no', 'off'].includes(String(process.env.WAN_FALLBACK_TEST_SINGLE || '1').toLowerCase());
const RUN_FIRST_LAST = !['0', 'false', 'no', 'off'].includes(String(process.env.WAN_FALLBACK_TEST_FIRST_LAST || '1').toLowerCase());
const FAL_KEY = process.env.FAL_KEY || process.env.FAL_API_KEY || process.env.FAL_AI_API_KEY || '';

const SINGLE_PROMPT = process.env.WAN_FALLBACK_SINGLE_PROMPT
  || 'Subtle natural motion from this webcam frame, documentary realism, stable identity, no distortion.';
const FIRST_LAST_PROMPT = process.env.WAN_FALLBACK_FIRST_LAST_PROMPT
  || 'Move naturally from the first frame to the second frame, preserving subject identity and realistic motion.';

const ensureInput = async (inputPath, label) => {
  const resolved = path.resolve(String(inputPath));
  if (!(await fs.pathExists(resolved))) {
    throw new Error(`${label} not found: ${resolved}`);
  }
  return resolved;
};

const run = async () => {
  if (!FAL_KEY) {
    throw new Error('Missing fal.ai key. Set FAL_KEY, FAL_API_KEY, or FAL_AI_API_KEY.');
  }

  await fs.ensureDir(OUTPUT_DIR);
  const startImage = await ensureInput(START_IMAGE_PATH, 'WAN_FALLBACK_START_IMAGE');
  const endImage = await ensureInput(END_IMAGE_PATH, 'WAN_FALLBACK_END_IMAGE');
  const summary = {
    startImage,
    endImage,
    single: null,
    firstLast: null,
  };

  if (RUN_SINGLE) {
    const single = await new PostToFal_ImageVideo({
      folderName: 'wan-fallback-test-single',
      falKey: FAL_KEY,
      duration_seconds: Number(process.env.WAN_FALLBACK_SINGLE_DURATION) || 2,
      resolution: process.env.WAN_FALLBACK_SINGLE_RESOLUTION || '720p',
      aspect_ratio: process.env.WAN_FALLBACK_SINGLE_ASPECT_RATIO || '9:16',
      model: process.env.WAN_FALLBACK_SINGLE_MODEL || 'fal-ai/wan/v2.2-5b/image-to-video',
    }).init();

    const result = await single.prompt(startImage, { prompt: SINGLE_PROMPT });
    summary.single = {
      file: result?.file || '',
      json: result?.json?.path || result?.json || '',
      model: single.config.model,
    };
    console.log('[wan-fallback] single-image video:', summary.single.file);
  }

  if (RUN_FIRST_LAST) {
    const firstLast = await new PostToFal_FirstLastFrame({
      folderName: 'wan-fallback-test-first-last',
      falKey: FAL_KEY,
      resolution: process.env.WAN_FALLBACK_FIRST_LAST_RESOLUTION || '720p',
      aspect_ratio: process.env.WAN_FALLBACK_FIRST_LAST_ASPECT_RATIO || 'auto',
      model: process.env.WAN_FALLBACK_FIRST_LAST_MODEL || 'fal-ai/wan-flf2v',
    }).init();

    const result = await firstLast.prompt(startImage, {
      endImageStream: endImage,
      prompt: FIRST_LAST_PROMPT,
    });
    summary.firstLast = {
      file: result?.file || '',
      json: result?.json?.path || result?.json || '',
      model: firstLast.config.model,
    };
    console.log('[wan-fallback] first-last video:', summary.firstLast.file);
  }

  const summaryPath = path.join(OUTPUT_DIR, `${Date.now()}-wan-fallback-summary.json`);
  await saveJSON(summaryPath, summary);
  console.log('[wan-fallback] summary:', summaryPath);
};

run().catch((err) => {
  (async () => {
    await fs.ensureDir(OUTPUT_DIR);
    const errorPath = path.join(OUTPUT_DIR, `${Date.now()}-wan-fallback-error.json`);
    await saveJSON(errorPath, {
      error: String(err?.message || err),
      rawError: err,
      startImagePath: START_IMAGE_PATH,
      endImagePath: END_IMAGE_PATH,
    });
    console.error('Error in wan-fallback.test.js:', err);
    console.error('Saved error sidecar:', errorPath);
    process.exit(1);
  })().catch((saveErr) => {
    console.error('Error in wan-fallback.test.js:', err);
    console.error('Failed to save error sidecar:', saveErr);
    process.exit(1);
  });
});
