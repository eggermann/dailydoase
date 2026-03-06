import dotenv from 'dotenv';
import OpenAI from 'openai';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'fs-extra';

import { makePromptCreator } from '../helpers/openai-chat.js';
import store from '../../../store.cjs';
import { saveJSON } from '../../save-utils.js';

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

const TEST_SCENE_SECONDS = Number(process.env.TEST_SCENE_SECONDS) || 1;
const IMAGE_SEED = Number.isFinite(Number(process.env.IMG_SEED)) ? Number(process.env.IMG_SEED) : 0;
const VIDEO_SEED = Number.isFinite(Number(process.env.VID_SEED)) ? Number(process.env.VID_SEED) : 0;

const OUTPUT_DIR = path.resolve(__dirname, 'GENERATIONS', 'freshweb-mixed-modes-test');

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
  seed: IMAGE_SEED,
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
    seed: VIDEO_SEED,
    randomize_seed: false,
    space: WAN22_FIRST_LAST_SPACE,
    // Keep retries short for test runs
    maxRetriesOnAbort: 1,
    retryDelayMs: 2000,
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

const run = async () => {
  await fs.ensureDir(OUTPUT_DIR);

  await import('../../../../semantic-stream.js')
    .then((module) =>
      module.default([
        {
          refresh: true,
          folderName: 'freshweb-mixed-modes-test',
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
            sceneCount: async () => 2,
            // scene 1: first/last (generates real end frame)
            firstClipUseSingleImage: false,
            // scene 2: single-image from extracted last-frame snapshot
            subsequentClipsUseSingleImage: true,
            captureLastFrame: true,
            openingImage: {
              promptSource: 'freshweb camera shot, documentary snapshot, natural light, direct framing',
            },
          },
          promptFunktion: async (streams) => {
            console.log('[freshweb-mixed-modes] IMG_SEED:', IMAGE_SEED, 'VID_SEED:', VIDEO_SEED);
            return streams;
          },
        },
      ])
    );
};

run().catch((err) => {
  (async () => {
    const errorText = String(err?.message || err);
    const errorPath = path.join(OUTPUT_DIR, `${Date.now()}-mixed-modes-error.json`);
    await saveJSON(errorPath, { error: errorText, rawError: err });
    console.error('Error in MIX-again-freshweb.mixed-modes.test.js:', err);
    console.error('Saved error sidecar:', errorPath);
    process.exit(1);
  })().catch((saveErr) => {
    console.error('Error in MIX-again-freshweb.mixed-modes.test.js:', err);
    console.error('Failed to save error sidecar:', saveErr);
    process.exit(1);
  });
});
