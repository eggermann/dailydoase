import dotenv from 'dotenv';
import OpenAI from 'openai';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { makePromptCreator } from './helpers/openai-chat.js';
import {
  createSceneGenerator,
  DEFAULT_SCENE_SYSTEM_PROMPT,
  getScenePlanEntry,
  resolveSceneCountFromConfig,
} from './helpers/scene-generator.js';
import { createVisionHelper } from './helpers/vision-model.js';
import promptCreator from '../../prompt-creator.js';

dotenv.config();
const ANSI = {
  reset: '\x1b[0m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const CHAT_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const WAN22_FIRST_LAST_SPACE = process.env.WAN22_FIRST_LAST_SPACE || 'cakegreen/Wan-2-2-first-last-frame';
const WAN22_SINGLE_SPACE = process.env.WAN22_SINGLE_SPACE || 'Wan-AI/Wan-2.2-5B';
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
const SCENE_LENGTHS = (process.env.FRESHWEB_TEST_SCENE_LENGTHS || '3,3,3,3,3,3')
  .split(',')
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isFinite(value) && value > 0);

let sceneLengthIndex = 0;
let activeSceneDuration = SCENE_LENGTHS[0] || 3;

const nextSceneDuration = () => {
  const nextLength = SCENE_LENGTHS[sceneLengthIndex % SCENE_LENGTHS.length] || activeSceneDuration;
  sceneLengthIndex += 1;
  activeSceneDuration = nextLength;
  return activeSceneDuration;
};

const currentSceneDuration = () => activeSceneDuration;
const currentSingleImageDuration = () => Math.min(
  currentSceneDuration(),
  Number(process.env.FRESHWEB_TEST_SINGLE_VIDEO_MAX_DURATION) || 2
);
const resolveSceneCount = () => resolveSceneCountFromConfig({
  sceneLengths: SCENE_LENGTHS,
  sceneCount: process.env.FRESHWEB_TEST_SCENE_COUNT,
  defaultSceneCount: 6,
});
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
  temperature: 0.3,
  top_p: 0.85,
});

const words = [['bauhaus', 'de'], ['camera', 'en']];
const scriptName = './adapter/shorty-book/index.js';
const openingPromptSource = process.env.FRESHWEB_TEST_OPENING_PROMPT
  || 'freshweb camera shot, simple documentary still, natural light';
const useSingleImageFirstClip = parseBoolean(process.env.FRESHWEB_TEST_FIRST_CLIP_SINGLE_IMAGE, true);
const useSingleImageLaterClips = parseBoolean(process.env.FRESHWEB_TEST_LATER_CLIPS_SINGLE_IMAGE, false);
const useDynamicSingleImageLaterClips = parseBoolean(
  process.env.FRESHWEB_TEST_DYNAMIC_SINGLE_IMAGE_LATER_CLIPS,
  true
);
const VISION_ENABLED = parseBoolean(process.env.FRESHWEB_TEST_USE_VISION, true);
const VISION_PROMPT = process.env.FRESHWEB_TEST_VISION_PROMPT
  || 'Describe only the visible shot: subject, setting, framing, lighting, and what should stay consistent for the next video shot.';
const SCENE_VISUAL_DIRECTION = process.env.FRESHWEB_TEST_SCENE_VISUAL_DIRECTION
  || 'documentary, realistic, visually distinct scenes, concise motion, coherent 3-scene arc';
const CONFIG_MODE = process.env.FRESHWEB_TEST_MODE || 'generated';
const promptSystems = {
  scenePlan: process.env.FRESHWEB_TEST_SCENE_PLAN_SYSTEM_PROMPT
    || DEFAULT_SCENE_SYSTEM_PROMPT,
  stillImage: process.env.FRESHWEB_TEST_STILL_SYSTEM_PROMPT
    || 'Write one short photographic image prompt. Keep only visible subjects, setting, and light. Ignore encyclopedia language, product claims, abstract concepts, and explanatory text. Output only the prompt.',
  firstLastVideo: process.env.FRESHWEB_TEST_VIDEO_SYSTEM_PROMPT
    || 'Write one short image-to-video prompt for a WAN-style first/last-frame shot. Output only the final prompt in 2 to 4 short sentences. Focus on visible action and one camera move. No meta phrasing, no brand language, no feature lists, no scene headings.',
  singleFrameVideo: process.env.FRESHWEB_TEST_VIDEO_SINGLE_SYSTEM_PROMPT
    || 'Write one short image-to-video prompt for a WAN-style single-frame shot. Output only the final prompt in 2 to 4 short sentences. Focus on a small believable action and one restrained camera move. No meta phrasing, no brand language, no feature lists, no scene headings.',
};

const imageModelData = {
  fluxVariant: process.env.FRESHWEB_TEST_FLUX_VARIANT || 'schnell',
  width: Number(process.env.FRESHWEB_TEST_IMAGE_WIDTH) || 256,
  height: Number(process.env.FRESHWEB_TEST_IMAGE_HEIGHT) || 256,
  num_inference_steps: Number(process.env.FRESHWEB_TEST_IMAGE_STEPS) || 2,
  guidance_scale: Number(process.env.FRESHWEB_TEST_IMAGE_GUIDANCE) || 1.2,
  negative_prompt: 'blurry, low detail, warped anatomy, broken perspective',
  seed: IMAGE_SEED,
};

const visionHelper = createVisionHelper({
  prompt: VISION_PROMPT,
});
const sceneGenerator = createSceneGenerator({
  openai,
  model: CHAT_MODEL,
  systemPrompt: promptSystems.scenePlan,
  temperature: 0.45,
  top_p: 0.9,
});
const visionCache = new Map();
let visionFailed = false;
let visionFailureLogged = false;

const getFrameVision = async (frame) => {
  const imagePath = frame?.image?.path;
  if (!VISION_ENABLED || visionFailed || typeof imagePath !== 'string' || imagePath.trim().length === 0) {
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
    visionFailed = true;
    if (!visionFailureLogged) {
      console.warn('');
      console.warn(`${ANSI.yellow}[freshweb-low-cost] vision disabled${ANSI.reset}`);
      console.warn(`${ANSI.cyan}  reason:${ANSI.reset} ${message}`);
      console.warn('');
      visionFailureLogged = true;
    }
    visionCache.set(resolvedPath, '');
    return '';
  }
};

const normalizeText = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

const truncateWords = (value, maxWords = 18) => {
  const wordsList = normalizeText(value).split(' ').filter(Boolean);
  return wordsList.slice(0, maxWords).join(' ');
};

const compactVideoPrompt = (value, maxSentences = 3, maxWords = 55) => {
  const normalized = normalizeText(value).replace(/\s*[\r\n]+\s*/g, ' ').trim();
  if (!normalized) {
    return normalized;
  }

  const sentenceParts = normalized
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, maxSentences);

  const compact = sentenceParts.join(' ');
  const truncated = truncateWords(compact, maxWords).trim();
  if (!truncated) {
    return truncated;
  }
  if (/[.!?]$/.test(truncated)) {
    return truncated;
  }
  const lastSentenceStart = Math.max(
    truncated.lastIndexOf('. '),
    truncated.lastIndexOf('! '),
    truncated.lastIndexOf('? ')
  );
  if (lastSentenceStart > 0) {
    return `${truncated.slice(0, lastSentenceStart + 1).trim()}`;
  }
  return `${truncated}.`;
};

const sanitizeSemanticCue = (value) => {
  let text = normalizeText(value)
    .replace(/["'`]/g, '')
    .replace(/\b(as a pivotal technology.*)$/i, '')
    .replace(/\b(showcasing|highlighting) [^.]*features[^.]*$/i, '')
    .replace(/\bprovide[s]? real-time[^.]*$/i, '')
    .replace(/\bexact imaging[^.]*$/i, '')
    .replace(/\bfields of photography[^.]*$/i, '')
    .replace(/\bphotographic film\b/gi, '')
    .replace(/\bsingle-lens reflex camera\b/gi, '')
    .replace(/\s+,/g, ',')
    .trim();

  return text ? truncateWords(text, 16) : '';
};

const getScenePhase = (sceneContext = {}) => {
  if (sceneContext?.isFirst) return 'opening';
  if (sceneContext?.isLast) return 'payoff';
  return 'development';
};

const buildFrameAnchor = ({ visionText, promptText, fallbackText }) => {
  const visualText = truncateWords(visionText, 22);
  if (visualText) {
    return visualText;
  }

  const promptCue = sanitizeSemanticCue(promptText);
  if (promptCue) {
    return promptCue;
  }

  return fallbackText;
};

const buildStillPromptFallback = (sourcePrompt) => {
  const cue = sanitizeSemanticCue(sourcePrompt) || 'a simple real-world subject';
  return `freshweb documentary still of ${cue}, natural light, candid framing, realistic detail`;
};

const stillPromptCreator = buildPrompt({
  system: promptSystems.stillImage,
  buildUser: (prompt) => {
    const cue = sanitizeSemanticCue(prompt) || 'a simple real-world subject';
    return [
      `Source cue: ${cue}`,
      'Write one freshweb documentary still prompt in 8 to 18 words.',
      'Keep it concrete, visual, candid, and realistic.',
    ].join('\n');
  },
});

const imagePrompts = {
  create: async (prompt, sceneContext, scenePlanEntry) => {
    if (scenePlanEntry?.stillPrompt) {
      return scenePlanEntry.stillPrompt;
    }
    try {
      return await stillPromptCreator(prompt);
    } catch (error) {
      console.warn('[freshweb-low-cost] still prompt fallback:', String(error?.message || error));
      return buildStillPromptFallback(prompt);
    }
  },
};

const resolveLaterClipSingleImageMode = ({ isLast } = {}) => {
  if (!useDynamicSingleImageLaterClips) {
    return useSingleImageLaterClips;
  }
  return !Boolean(isLast);
};

const video = {
  prompts: {
    create: async (startFramePrompt, endFramePrompt, sceneContext, frameContext = {}) => {
      const sceneLength = nextSceneDuration();
      const scenePlanEntry = getScenePlanEntry(frameContext.scenePlan, sceneContext);
      const plannedPrompt = scenePlanEntry?.videoPrompt;
      if (plannedPrompt) {
        return compactVideoPrompt(plannedPrompt);
      }
      const fallbackCue = sanitizeSemanticCue(
        scenePlanEntry?.storyBeat || scenePlanEntry?.beat || `${startFramePrompt} ${endFramePrompt}`
      );
      return compactVideoPrompt(
        `${fallbackCue || 'Continue into the next destination scene.'} ${scenePlanEntry?.motionCue || ''} ${scenePlanEntry?.cameraCue || ''}`
      );
    },
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
    create: async (startFramePrompt, sceneContext, frameContext = {}) => {
      const sceneLength = nextSceneDuration();
      const scenePlanEntry = getScenePlanEntry(frameContext.scenePlan, sceneContext);
      const plannedPrompt = scenePlanEntry?.singleImagePrompt || scenePlanEntry?.videoPrompt;
      if (plannedPrompt) {
        return compactVideoPrompt(plannedPrompt);
      }
      const fallbackCue = sanitizeSemanticCue(
        scenePlanEntry?.storyBeat || scenePlanEntry?.beat || startFramePrompt
      );
      return compactVideoPrompt(
        `${fallbackCue || 'Continue the current frame with subtle motion.'} ${scenePlanEntry?.motionCue || ''} ${scenePlanEntry?.cameraCue || ''}`
      );
    },
  },
  model: {
    audioOnly: true,
    steps: Number(process.env.FRESHWEB_TEST_VIDEO_STEPS) || 1,
    duration_seconds: currentSingleImageDuration,
    height: Number(process.env.FRESHWEB_TEST_VIDEO_HEIGHT) || 512,
    width: Number(process.env.FRESHWEB_TEST_VIDEO_WIDTH) || 512,
    sampling_steps: Number(process.env.FRESHWEB_TEST_VIDEO_SAMPLING_STEPS) || 10,
    guide_scale: Number(process.env.FRESHWEB_TEST_VIDEO_GUIDE_SCALE) || 3,
    shift: Number(process.env.FRESHWEB_TEST_VIDEO_SHIFT) || 3,
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
          prompts: imagePrompts,
          staticPrompt: {},
        },
        sceneLoop: {
          enabled: true,
          sceneCount: async () => resolveSceneCount(),
          independentSceneStarts: false,
          firstClipUseSingleImage: useSingleImageFirstClip,
          subsequentClipsUseSingleImage: resolveLaterClipSingleImageMode,
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
        promptFunktion: async (streams, config) => {
          const sceneCount = resolveSceneCount();
          const sourceCues = [];
          for (let index = 0; index < sceneCount; index += 1) {
            sourceCues.push(await promptCreator.default(streams, {
              streamMixType: 'random',
            }));
          }
          const scenePlan = await sceneGenerator({
            sceneCount,
            sceneLengths: SCENE_LENGTHS.slice(0, sceneCount),
            sourceCues,
            visualDirection: SCENE_VISUAL_DIRECTION,
            configMode: CONFIG_MODE,
          });
          config.sceneLoop = config.sceneLoop || {};
          config.sceneLoop.scenePlan = scenePlan;
          console.log('[freshweb-low-cost] scenePlan:', scenePlan.map((scene) => scene.title).join(' | '));
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
