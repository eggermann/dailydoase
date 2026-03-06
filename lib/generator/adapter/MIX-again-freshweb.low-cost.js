import dotenv from 'dotenv';
import OpenAI from 'openai';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { makePromptCreator } from './helpers/openai-chat.js';
import { createVisionHelper } from './helpers/vision-model.js';

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

const parseBoolean = (value, fallback) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};

const IMAGE_SEED = parseOptionalSeed(process.env.IMG_SEED) ?? 0;
const VIDEO_SEED = parseOptionalSeed(process.env.VID_SEED) ?? 0;
const SCENE_LENGTHS = (process.env.FRESHWEB_TEST_SCENE_LENGTHS || '1,1')
  .split(',')
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isFinite(value) && value > 0);

let sceneLengthIndex = 0;
let activeSceneDuration = SCENE_LENGTHS[0] || 1;

const nextSceneDuration = () => {
  const nextLength = SCENE_LENGTHS[sceneLengthIndex % SCENE_LENGTHS.length] || activeSceneDuration;
  sceneLengthIndex += 1;
  activeSceneDuration = nextLength;
  return activeSceneDuration;
};

const currentSceneDuration = () => activeSceneDuration;
const resolveSceneCount = () => Math.max(2, Number(process.env.FRESHWEB_TEST_SCENE_COUNT) || SCENE_LENGTHS.length || 2);
const describeScene = (sceneContext = {}) => {
  const sceneNumber = Number(sceneContext.index) || 1;
  const totalScenes = Math.max(2, Number(sceneContext.total) || resolveSceneCount());
  return {
    sceneLabel: `scene ${sceneNumber} of ${totalScenes}`,
    sequenceLabel: `${totalScenes}-scene test`,
  };
};

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
const openingPromptSource = process.env.FRESHWEB_TEST_OPENING_PROMPT
  || 'freshweb camera shot, simple documentary still, natural light';
const useSingleImageFirstClip = parseBoolean(process.env.FRESHWEB_TEST_FIRST_CLIP_SINGLE_IMAGE, false);
const useSingleImageLaterClips = parseBoolean(process.env.FRESHWEB_TEST_LATER_CLIPS_SINGLE_IMAGE, false);
const VISION_ENABLED = parseBoolean(process.env.FRESHWEB_TEST_USE_VISION, true);
const VISION_PROMPT = process.env.FRESHWEB_TEST_VISION_PROMPT
  || 'Describe only the visible shot: subject, setting, framing, lighting, and what should stay consistent for the next video shot.';

const imageModelData = {
  fluxVariant: process.env.FRESHWEB_TEST_FLUX_VARIANT || 'schnell',
  width: Number(process.env.FRESHWEB_TEST_IMAGE_WIDTH) || 256,
  height: Number(process.env.FRESHWEB_TEST_IMAGE_HEIGHT) || 256,
  num_inference_steps: Number(process.env.FRESHWEB_TEST_IMAGE_STEPS) || 4,
  guidance_scale: Number(process.env.FRESHWEB_TEST_IMAGE_GUIDANCE) || 1.5,
  negative_prompt: 'blurry, low detail, warped anatomy, broken perspective',
  seed: IMAGE_SEED,
};

const visionHelper = createVisionHelper({
  prompt: VISION_PROMPT,
});
const visionCache = new Map();

const getFrameVision = async (frame) => {
  const imagePath = frame?.image?.path;
  if (!VISION_ENABLED || typeof imagePath !== 'string' || imagePath.trim().length === 0) {
    return '';
  }

  const resolvedPath = path.resolve(imagePath);
  if (visionCache.has(resolvedPath)) {
    return visionCache.get(resolvedPath);
  }

  try {
    const result = await visionHelper({
      imagePath: resolvedPath,
    });
    const outputText = String(result?.outputText || '').trim();
    visionCache.set(resolvedPath, outputText);
    return outputText;
  } catch (error) {
    const message = String(error?.message || error);
    console.warn('[freshweb-low-cost] vision skipped for', resolvedPath, message);
    visionCache.set(resolvedPath, '');
    return '';
  }
};

const buildVisionContext = ({ startVision, endVision }) => {
  const parts = [];
  if (startVision) {
    parts.push(`Visible start frame: ${startVision}`);
  }
  if (endVision) {
    parts.push(`Visible end frame: ${endVision}`);
  }
  return parts.join('\n');
};

const EMPTY_SYSTEM_PROMPT = '';

const video = {
  prompts: {
    create: buildPrompt({
      system: 'Write one concise image-to-video prompt. Use the frame descriptions as visual anchors and spend most of the prompt on motion, transition, and camera behavior.',
      buildUser: async (startFramePrompt, endFramePrompt, sceneContext, frameContext = {}) => {
        const sceneLength = nextSceneDuration();
        const { sceneLabel, sequenceLabel } = describeScene(sceneContext);
        const startVision = await getFrameVision(frameContext.startFrame);
        const endVision = await getFrameVision(frameContext.endFrame);
        const visionContext = buildVisionContext({ startVision, endVision });
        return [
          `${sceneLength} second ${sceneLabel} in a ${sequenceLabel}.`,
          visionContext,
          `Story beat from semantic stream: start shot idea "${startFramePrompt}". End shot idea "${endFramePrompt}".`,
          'Write the motion from the start frame toward the end frame. Describe subject action, environment motion, and one clear camera move.',
          'Keep identity, outfit, framing logic, lighting, and setting consistent with the frames. Avoid adding new characters, scene drift, distortions, or unnecessary object changes.',
          'Return only the final video prompt.',
        ].filter(Boolean).join('\n');
      },
    }),
  },
  model: {
    audioOnly: true,
    steps: Number(process.env.FRESHWEB_TEST_VIDEO_STEPS) || 1,
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
      system: 'Write one concise image-to-video prompt for a single input frame. Use the frame description as the anchor and focus on believable motion.',
      buildUser: async (startFramePrompt, sceneContext, frameContext = {}) => {
        const sceneLength = nextSceneDuration();
        const { sceneLabel, sequenceLabel } = describeScene(sceneContext);
        const startVision = await getFrameVision(frameContext.startFrame);
        const visionContext = buildVisionContext({ startVision });
        return [
          `${sceneLength} second ${sceneLabel} in a ${sequenceLabel}, using one start frame only.`,
          visionContext,
          `Story beat from semantic stream: "${startFramePrompt}".`,
          'Describe a small believable action and one restrained camera move.',
          'Preserve subject identity, clothing, lighting, framing, and location from the frame. No new people, no face changes, no surreal motion, no scene drift.',
          'Return only the final video prompt.',
        ].filter(Boolean).join('\n');
      },
    }),
  },
  model: {
    audioOnly: true,
    steps: Number(process.env.FRESHWEB_TEST_VIDEO_STEPS) || 1,
    duration_seconds: currentSceneDuration,
    seed: VIDEO_SEED,
    randomize_seed: false,
    space: WAN22_SINGLE_SPACE,
  },
  useImagePrompt: false,
};

const mireloAI = {
  duration: async () => currentSceneDuration(),
  num_samples: 1,
  steps: Number(process.env.FRESHWEB_TEST_MIRELO_STEPS) || 1,
  seed: -1,
  creativity_coef: Number(process.env.FRESHWEB_TEST_MIRELO_CREATIVITY) || 1,
  model_version: MIRELO_MODEL_VERSION,
  maxRetries5xx: 0,
  retryDelayMs: 250,
  auto_upload_if_local: true,
};

import('../../../semantic-stream.js')
  .then((module) =>
    module.default([
      {
        refresh: true,
        folderName: process.env.FRESHWEB_TEST_FOLDER || 'freshweb-low-cost-test',
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
          staticPrompt: {},
        },
        sceneLoop: {
          enabled: true,
          sceneCount: async () => resolveSceneCount(),
          firstClipUseSingleImage: useSingleImageFirstClip,
          subsequentClipsUseSingleImage: useSingleImageLaterClips,
          captureLastFrame: true,
          openingImage: {
            promptSource: process.env.FRESHWEB_TEST_OPENING_IMAGE_PATH
              ? ''
              : openingPromptSource,
            ...(process.env.FRESHWEB_TEST_OPENING_IMAGE_PATH
              ? { imagePath: process.env.FRESHWEB_TEST_OPENING_IMAGE_PATH }
              : {}),
          },
        },
        promptFunktion: async (streams) => {
          console.log('[freshweb-low-cost] IMG_SEED:', IMAGE_SEED, 'VID_SEED:', VIDEO_SEED);
          console.log('[freshweb-low-cost] sceneLengths:', SCENE_LENGTHS.join(','));
          return streams;
        },
      },
    ])
  )
  .catch((err) => {
    console.error('Error in MIX-again-freshweb.low-cost.js:', err);
    process.exit(1);
  });
