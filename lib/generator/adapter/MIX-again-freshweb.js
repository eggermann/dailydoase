import dotenv from 'dotenv';
import OpenAI from 'openai';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { makePromptCreator } from './helpers/openai-chat.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
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
const describeScene = (sceneContext = {}) => {
  const sceneNumber = Number(sceneContext.index) || 1;
  const totalScenes = Math.max(2, Number(sceneContext.total) || resolveSceneCount());
  return {
    sceneNumber,
    totalScenes,
    sceneLabel: `scene ${sceneNumber} of ${totalScenes}`,
    sequenceLabel: `${totalScenes}-scene sequence`,
  };
};

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
const defaultCameraImage = path.resolve(__dirname, '../test.datas/timba-lake.png');
const configuredCameraImage = process.env.FRESHWEB_CAMERA_IMAGE || '';

const imageModelData = {
  fluxVariant: process.env.FRESHWEB_FLUX_VARIANT || 'dev',
  width: Number(process.env.FRESHWEB_IMAGE_WIDTH) || 512,
  height: Number(process.env.FRESHWEB_IMAGE_HEIGHT) || 512,
  num_inference_steps: Number(process.env.FRESHWEB_IMAGE_STEPS) || 28,
  guidance_scale: Number(process.env.FRESHWEB_IMAGE_GUIDANCE) || 2.5,
  negative_prompt:
    'blurry, oversharpened, JPEG artefacts, low detail, duplicate people, warped anatomy, deformed hands, broken perspective',
  ...(IMAGE_SEED !== undefined && { seed: IMAGE_SEED }),
};

const EMPTY_SYSTEM_PROMPT = '';

const video = {
  prompts: {
    create: buildPrompt({
      system: EMPTY_SYSTEM_PROMPT,
      buildUser: (startFramePrompt, endFramePrompt, sceneContext) => {
        const sceneLength = nextSceneDuration();
        const { sceneLabel, sequenceLabel } = describeScene(sceneContext);
        return `${sceneLength} second ${sceneLabel} from a ${sequenceLabel}. Start shot: ${startFramePrompt}. End shot: ${endFramePrompt}. Keep it direct, visual, and camera-led so this clip reads as one beat inside the full ${sequenceLabel}.`;
      },
    }),
  },
  model: {
    audioOnly: true,
    steps: Number(process.env.FRESHWEB_VIDEO_STEPS) || 6,
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
      system: EMPTY_SYSTEM_PROMPT,
      buildUser: (startFramePrompt, sceneContext) => {
        const sceneLength = nextSceneDuration();
        const { sceneLabel, sequenceLabel } = describeScene(sceneContext);
        return `${sceneLength} second ${sceneLabel} from a ${sequenceLabel}, using this start image only. Start shot: ${startFramePrompt}. Keep the motion grounded, concise, and camera-led so it feels like one beat inside the full ${sequenceLabel}.`;
      },
    }),
  },
  model: {
    audioOnly: true,
    steps: Number(process.env.FRESHWEB_VIDEO_STEPS) || 6,
    duration_seconds: currentSceneDuration,
    ...(VIDEO_SEED !== undefined && { seed: VIDEO_SEED }),
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
          ...imageModelData,
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
            promptSource: configuredCameraImage ? '' : openingPromptSource,
            ...(configuredCameraImage
              ? { imagePath: configuredCameraImage }
              : { imagePath: defaultCameraImage }),
          },
        },
        promptFunktion: async (streams) => {
          console.log('[consistency] IMG_SEED:', IMAGE_SEED ?? 'random', 'VID_SEED:', VIDEO_SEED ?? 'random');
          return streams;
        },
      },
    ])
  )
  .catch((err) => {
    console.error('Error in MIX-again-freshweb.js:', err);
    process.exit(1);
  });
