import dotenv from 'dotenv';
import OpenAI from 'openai';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'fs-extra';

import { makePromptCreator } from '../helpers/openai-chat.js';
import store from '../../../store.cjs';

dotenv.config();
if (!process.env.DISABLE_FILE_WATCH) {
  process.env.DISABLE_FILE_WATCH = '1';
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
process.env.GENERATIONS_PATH = path.resolve(__dirname, 'GENERATIONS');
store.initCache(process.env.GENERATIONS_PATH);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const CHAT_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const WAN22_FIRST_LAST_SPACE = process.env.WAN22_FIRST_LAST_SPACE || 'cakegreen/Wan-2-2-first-last-frame';
const WAN22_SINGLE_SPACE = process.env.WAN22_SINGLE_SPACE || 'Wan-AI/Wan2.2-5B-I2V';
const MIRELO_MODEL_VERSION = process.env.MIRELO_MODEL_VERSION || 'latest';

const parseOptionalSeed = (value) => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const seed = Number(value);
  return Number.isFinite(seed) ? seed : undefined;
};

const IMAGE_SEED = parseOptionalSeed(process.env.IMG_SEED) ?? 0;
const VIDEO_SEED = parseOptionalSeed(process.env.VID_SEED) ?? 0;
const TEST_SCENE_SECONDS = Number(process.env.TEST_SCENE_SECONDS) || 1;
const TEST_SCENE_COUNT = 4;
const TOTAL_SCENE_LABEL = `${TEST_SCENE_COUNT}-scene sequence`;

const currentSceneDuration = () => TEST_SCENE_SECONDS;

const buildPrompt = ({ system, buildUser }) => makePromptCreator({
  openai,
  model: CHAT_MODEL,
  system,
  buildUser,
  temperature: 0.2,
  top_p: 0.8,
});

const words = [['freshweb', 'en'], ['camera', 'en']];
const scriptName = './adapter/shorty-book/index.js';
const WEBCAM_START_IMAGE_PATH = process.env.WEBCAM_START_IMAGE_PATH || '';
const WEBCAM_END_IMAGE_PATH = process.env.WEBCAM_END_IMAGE_PATH || '';
const WEBCAM_END_CAPTURE_CMD = process.env.WEBCAM_END_CAPTURE_CMD || '';
const WEBCAM_END_CAPTURE_EXT = process.env.WEBCAM_END_CAPTURE_EXT || 'jpg';
const MAX_WEBCAM_AGE_MS = Number(process.env.MAX_WEBCAM_AGE_MS) || 2 * 60 * 1000;

const assertFreshFile = async (filePath, label) => {
  const p = path.resolve(String(filePath));
  const st = await fs.stat(p);
  if (!st.isFile()) throw new Error(`${label} is not a file: ${p}`);
  const ageMs = Date.now() - st.mtimeMs;
  if (ageMs > MAX_WEBCAM_AGE_MS) {
    throw new Error(
      `${label} must be a fresh shot (mtime age ${Math.round(ageMs / 1000)}s > ${Math.round(MAX_WEBCAM_AGE_MS / 1000)}s): ${p}`
    );
  }
  return p;
};

if (WEBCAM_START_IMAGE_PATH) {
  // Captured immediately before running this test.
  await assertFreshFile(WEBCAM_START_IMAGE_PATH, 'WEBCAM_START_IMAGE_PATH');
}
if (WEBCAM_END_IMAGE_PATH) {
  // Captured immediately before running this test.
  await assertFreshFile(WEBCAM_END_IMAGE_PATH, 'WEBCAM_END_IMAGE_PATH');
}
if (!WEBCAM_END_IMAGE_PATH && WEBCAM_END_CAPTURE_CMD) {
  // Capture happens inside generator.js at the exact moment the final clip is created.
  // Nothing to validate here yet.
}

const imageModelData = {
  fluxVariant: process.env.FRESHWEB_TEST_FLUX_VARIANT || 'schnell',
  width: 256,
  height: 256,
  num_inference_steps: 4,
  guidance_scale: 1.5,
  negative_prompt:
    'blurry, low detail, warped anatomy, duplicate people, broken hands, bad perspective',
  ...(IMAGE_SEED !== undefined && { seed: IMAGE_SEED }),
};

const imagePrompts = {
  create: buildPrompt({
    system: 'Write one short camera-ready image prompt.',
    buildUser: (prompt) => `freshweb camera shot, candid editorial still: ${prompt}`,
  }),
};

const video = {
  prompts: {
    create: buildPrompt({
      system: '',
      buildUser: (startFramePrompt, endFramePrompt) =>
        `${TEST_SCENE_SECONDS} second scene from a ${TOTAL_SCENE_LABEL}. Start shot: ${startFramePrompt}. End shot: ${endFramePrompt}. Keep this clip feeling like one beat inside the full ${TOTAL_SCENE_LABEL}.`,
    }),
  },
  model: {
    audioOnly: true,
    steps: 1,
    duration_seconds: currentSceneDuration,
    seed: VIDEO_SEED,
    randomize_seed: false,
    space: WAN22_FIRST_LAST_SPACE,
  },
  useImagePrompt: false,
};

const video2 = {
  prompts: {
    create: buildPrompt({
      system: '',
      buildUser: (startFramePrompt) =>
        `${TEST_SCENE_SECONDS} second scene from a ${TOTAL_SCENE_LABEL}, using this start shot only: ${startFramePrompt}. Keep this clip feeling like one beat inside the full ${TOTAL_SCENE_LABEL}.`,
    }),
  },
  model: {
    audioOnly: true,
    steps: 1,
    duration_seconds: currentSceneDuration,
    seed: VIDEO_SEED,
    space: WAN22_SINGLE_SPACE,
  },
  useImagePrompt: false,
};

const mireloAI = {
  duration: () => TEST_SCENE_SECONDS,
  num_samples: 1,
  steps: 1,
  seed: -1,
  creativity_coef: 1,
  model_version: MIRELO_MODEL_VERSION,
  maxRetries5xx: 0,
  retryDelayMs: 250,
  auto_upload_if_local: true,
};

import('../../../../semantic-stream.js')
  .then((module) =>
    module.default([
      {
        refresh: true,
        folderName: 'freshweb-one-iteration-test',
        streamMixType: 'random',
        model: {
          scriptName,
          pollingTime: null,
        },
        words,
        video,
        video2,
        mireloAI,
        image: {
          model: imageModelData,
          prompts: imagePrompts,
          staticPrompt: {},
        },
        sceneLoop: {
          enabled: true,
          sceneCount: async () => TEST_SCENE_COUNT,
          firstClipUseSingleImage: false,
          subsequentClipsUseSingleImage: false,
          captureLastFrame: true,
          openingImage: {
            promptSource: 'freshweb camera shot, documentary snapshot, natural light, direct framing',
            ...(WEBCAM_START_IMAGE_PATH ? { imagePath: WEBCAM_START_IMAGE_PATH } : {}),
          },
          finalEndImage: {
            promptSource: 'new webcam shot, clean direct framing, natural light, documentary realism, distinct closing still',
            ...(WEBCAM_END_IMAGE_PATH ? { imagePath: WEBCAM_END_IMAGE_PATH } : {}),
            ...(WEBCAM_END_CAPTURE_CMD ? { captureCmd: WEBCAM_END_CAPTURE_CMD, ext: WEBCAM_END_CAPTURE_EXT } : {}),
          },
        },
        promptFunktion: async (streams) => {
          console.log('[freshweb-test] IMG_SEED:', IMAGE_SEED, 'VID_SEED:', VIDEO_SEED);
          return streams;
        },
      },
    ])
  )
  .catch((err) => {
    console.error('Error in MIX-again-freshweb.one-iteration.test.js:', err);
    process.exit(1);
  });
