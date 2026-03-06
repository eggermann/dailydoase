import dotenv from 'dotenv';
import OpenAI from 'openai';

import { makePromptCreator } from './helpers/openai-chat.js';

dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const CHAT_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const WAN22_FIRST_LAST_SPACE = process.env.WAN22_FIRST_LAST_SPACE || 'cakegreen/Wan-2-2-first-last-frame';
const WAN22_SINGLE_SPACE = process.env.WAN22_SINGLE_SPACE || 'Wan-AI/Wan2.2-5B-I2V';
const MIRELO_MODEL_VERSION = process.env.MIRELO_MODEL_VERSION || 'latest';

const FIXED_IMG_SEED = Number(process.env.IMG_SEED) || 424242;
const FIXED_VID_SEED = Number(process.env.VID_SEED) || FIXED_IMG_SEED;

const SCENE_LENGTHS = (process.env.FRESHWEB_SCENE_LENGTHS || '4,3')
  .split(',')
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isFinite(value) && value > 0);

let sceneLengthIndex = 0;
let activeSceneDuration = SCENE_LENGTHS[0] || 4;

const nextSceneDuration = () => {
  const length = SCENE_LENGTHS[sceneLengthIndex % SCENE_LENGTHS.length] || activeSceneDuration;
  sceneLengthIndex += 1;
  activeSceneDuration = length;
  return activeSceneDuration;
};

const currentSceneDuration = () => activeSceneDuration;
const resolveSceneCount = () => Math.max(2, SCENE_LENGTHS.length);

const buildPrompt = ({ system, buildUser }) => makePromptCreator({
  openai,
  model: CHAT_MODEL,
  system,
  buildUser,
  temperature: 0.4,
  top_p: 0.95,
});

const words = [['freshweb', 'en'], ['camera', 'en'], ['scene', 'en']];
const scriptName = './adapter/shorty-book/index.js';
const openingPromptSource = process.env.FRESHWEB_OPENING_PROMPT
  || 'freshweb camera shot, candid documentary still, handheld editorial framing, natural light, clear subject focus';

const imageModelData = {
  model: 'black-forest-labs/FLUX.1-Kontext-dev',
  imagePath: process.env.FRESHWEB_CAMERA_IMAGE || '../test.datas/timba-lake.png',
  width: Number(process.env.FRESHWEB_IMAGE_WIDTH) || 512,
  height: Number(process.env.FRESHWEB_IMAGE_HEIGHT) || 512,
  num_inference_steps: Number(process.env.FRESHWEB_IMAGE_STEPS) || 28,
  guidance_scale: Number(process.env.FRESHWEB_IMAGE_GUIDANCE) || 2.5,
  negative_prompt:
    'blurry, oversharpened, JPEG artefacts, low detail, duplicate people, warped anatomy, deformed hands, broken perspective',
  seed: FIXED_IMG_SEED,
};

const EMPTY_SYSTEM_PROMPT = '';

const video = {
  prompts: {
    create: buildPrompt({
      system: EMPTY_SYSTEM_PROMPT,
      buildUser: (startFramePrompt, endFramePrompt) => {
        const sceneLength = nextSceneDuration();
        return `${sceneLength} second camera scene. Start shot: ${startFramePrompt}. End shot: ${endFramePrompt}. Keep it direct, visual, and ready for video generation.`;
      },
    }),
  },
  model: {
    audioOnly: true,
    steps: Number(process.env.FRESHWEB_VIDEO_STEPS) || 6,
    duration_seconds: currentSceneDuration,
    seed: FIXED_VID_SEED,
    space: WAN22_FIRST_LAST_SPACE,
  },
  useImagePrompt: false,
};

const video2 = {
  prompts: {
    create: buildPrompt({
      system: EMPTY_SYSTEM_PROMPT,
      buildUser: (startFramePrompt) => {
        const sceneLength = nextSceneDuration();
        return `${sceneLength} second camera scene using this start image only. Start shot: ${startFramePrompt}. Keep the motion grounded, concise, and camera-led.`;
      },
    }),
  },
  model: {
    audioOnly: true,
    steps: Number(process.env.FRESHWEB_VIDEO_STEPS) || 6,
    duration_seconds: currentSceneDuration,
    seed: FIXED_VID_SEED,
    space: WAN22_SINGLE_SPACE,
  },
  useImagePrompt: false,
};

const imagePrompts = {
  create: buildPrompt({
    system:
      'Write one tight camera-ready image prompt. Keep it photographic, natural, and specific about framing, light, and lens feel.',
    buildUser: (prompt) =>
      `Convert this into a freshweb camera shot image prompt: ${prompt}. Preserve the candid editorial feel and keep it suitable for an opening still frame.`,
  }),
};

const mireloAI = {
  duration: async () => currentSceneDuration(),
  num_samples: 1,
  steps: 25,
  seed: -1,
  creativity_coef: 4.5,
  model_version: MIRELO_MODEL_VERSION,
  maxRetries5xx: 0,
  retryDelayMs: 250,
  auto_upload_if_local: true,
};

import('../../../semantic-stream.js')
  .then((module) =>
    module.default([
      {
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
          type: 'imageActorInScene',
          model: imageModelData,
          prompts: imagePrompts,
          staticPrompt: {},
        },
        sceneLoop: {
          enabled: true,
          sceneCount: async () => Number(process.env.FRESHWEB_SCENE_COUNT) || resolveSceneCount(),
          firstClipUseSingleImage: true,
          subsequentClipsUseSingleImage: false,
          captureLastFrame: true,
          openingImage: {
            promptSource: openingPromptSource,
          },
        },
        promptFunktion: async (streams) => {
          console.log('[consistency] IMG_SEED:', FIXED_IMG_SEED, 'VID_SEED:', FIXED_VID_SEED);
          return streams;
        },
      },
    ])
  )
  .catch((err) => {
    console.error('Error in MIX-again-freshweb.js:', err);
    process.exit(1);
  });
