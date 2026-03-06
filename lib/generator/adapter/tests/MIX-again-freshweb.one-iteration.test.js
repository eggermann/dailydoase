import dotenv from 'dotenv';
import OpenAI from 'openai';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

const IMAGE_SEED = parseOptionalSeed(process.env.IMG_SEED);
const VIDEO_SEED = parseOptionalSeed(process.env.VID_SEED);
const TEST_SCENE_SECONDS = Number(process.env.TEST_SCENE_SECONDS) || 1;
const TEST_SCENE_COUNT = 2;

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
        `${TEST_SCENE_SECONDS} second scene. Start shot: ${startFramePrompt}. End shot: ${endFramePrompt}.`,
    }),
  },
  model: {
    audioOnly: true,
    steps: 1,
    duration_seconds: currentSceneDuration,
    ...(VIDEO_SEED !== undefined && { seed: VIDEO_SEED }),
    randomize_seed: true,
    space: WAN22_FIRST_LAST_SPACE,
  },
  useImagePrompt: false,
};

const video2 = {
  prompts: {
    create: buildPrompt({
      system: '',
      buildUser: (startFramePrompt) =>
        `${TEST_SCENE_SECONDS} second scene from this start shot only: ${startFramePrompt}.`,
    }),
  },
  model: {
    audioOnly: true,
    steps: 1,
    duration_seconds: currentSceneDuration,
    ...(VIDEO_SEED !== undefined && { seed: VIDEO_SEED }),
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
          firstClipUseSingleImage: true,
          subsequentClipsUseSingleImage: false,
          captureLastFrame: true,
          openingImage: {
            promptSource: 'freshweb camera shot, documentary snapshot, natural light, direct framing',
          },
        },
        promptFunktion: async (streams) => {
          console.log('[freshweb-test] IMG_SEED:', IMAGE_SEED ?? 'random', 'VID_SEED:', VIDEO_SEED ?? 'random');
          return streams;
        },
      },
    ])
  )
  .catch((err) => {
    console.error('Error in MIX-again-freshweb.one-iteration.test.js:', err);
    process.exit(1);
  });
