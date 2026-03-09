import dotenv from 'dotenv';
import OpenAI from 'openai';
import { Taktmuster } from 'taktmuster';

import {
  buildFallbackStillPrompt,
  buildFallbackVideoPrompt,
  createSceneGenerator,
  DEFAULT_SCENE_SYSTEM_PROMPT,
  getScenePlanEntry,
  resolveSceneCountFromConfig,
  resolveSceneLengthsInput,
} from './helpers/scene-generator.js';
import { createFrameVisionHelper, normalizeVisionText } from './helpers/frame-vision.js';
import {
  buildVisionAwarePrompt,
  resolveFreshwebVisionPrompt,
  resolveFreshwebVisionProviders,
} from './helpers/freshweb-vision-prompt.js';
import promptCreator from '../../prompt-creator.js';

dotenv.config();
const ANSI = {
  reset: '\x1b[0m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

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
const SCENE_LENGTHS_ENV = (process.env.FRESHWEB_TEST_SCENE_LENGTHS || '')
  .split(',')
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isFinite(value) && value > 0);

const DEFAULT_SCENE_COUNT = Number(process.env.FRESHWEB_TEST_SCENE_COUNT)
  || 4;
const USE_TAKTMUSTER_LENGTHS = parseBoolean(
  process.env.FRESHWEB_TEST_USE_TAKTMUSTER_LENGTHS,
  SCENE_LENGTHS_ENV.length === 0
);
const TAKTMUSTER_TAKT = Number(process.env.FRESHWEB_TEST_TAKTMUSTER_TAKT) || 4;
const TAKTMUSTER_TYPE = process.env.FRESHWEB_TEST_TAKTMUSTER_TYPE || 'balanced';

let resolvedSceneLengths = SCENE_LENGTHS_ENV.length > 0
  ? [...SCENE_LENGTHS_ENV] : [];
let sceneLengthSource = resolvedSceneLengths;




let sceneLengthIndex = 0;
let activeSceneDuration = resolvedSceneLengths[0] || 3;

const nextSceneDuration = () => {
  const nextLength = resolvedSceneLengths[sceneLengthIndex % resolvedSceneLengths.length] || activeSceneDuration;
  sceneLengthIndex += 1;
  activeSceneDuration = nextLength;
  return activeSceneDuration;
};

const setActiveSceneDuration = (value) => {
  activeSceneDuration = Number.isFinite(Number(value)) && Number(value) > 0
    ? Number(value)
    : activeSceneDuration;
  return activeSceneDuration;
};

const currentSceneDuration = () => activeSceneDuration;
const currentSingleImageDuration = () => {
  const configuredMax = Number(process.env.FRESHWEB_TEST_SINGLE_VIDEO_MAX_DURATION);
  if (Number.isFinite(configuredMax) && configuredMax > 0) {
    return Math.min(currentSceneDuration(), configuredMax);
  }
  return currentSceneDuration();
};
const resolveSceneCount = () => resolveSceneCountFromConfig({
  sceneLengths: sceneLengthSource,
  sceneCount: process.env.FRESHWEB_TEST_SCENE_COUNT,
  defaultSceneCount: DEFAULT_SCENE_COUNT,
});
const describeScene = (sceneContext = {}) => {
  const sceneNumber = Number(sceneContext.index) || 1;
  const totalScenes = Math.max(2, Number(sceneContext.total) || resolveSceneCount());
  return {
    sceneLabel: `scene ${sceneNumber} of ${totalScenes}`,
    sequenceLabel: `${totalScenes}-scene test`,
  };
};

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
const SCENE_PLAN_CONTROLS_VIDEO_MODE = parseBoolean(
  process.env.FRESHWEB_TEST_SCENE_PLAN_CONTROLS_VIDEO_MODE,
  false
);
const VISION_ENABLED = parseBoolean(process.env.FRESHWEB_TEST_USE_VISION, false);
const VISION_PROMPT = resolveFreshwebVisionPrompt(process.env.FRESHWEB_TEST_VISION_PROMPT);
const VISION_PROVIDERS = resolveFreshwebVisionProviders(process.env.FRESHWEB_TEST_VISION_PROVIDERS);
const SCENE_VISUAL_DIRECTION = process.env.FRESHWEB_TEST_SCENE_VISUAL_DIRECTION
  || 'documentary, realistic, visually distinct scenes, concise motion, coherent 3-scene arc';
const CONFIG_MODE = process.env.FRESHWEB_TEST_MODE || 'generated';
const promptSystems = {
  scenePlan: process.env.FRESHWEB_TEST_SCENE_PLAN_SYSTEM_PROMPT
    || DEFAULT_SCENE_SYSTEM_PROMPT,
};

const createTmLengthSource = ({ takt = TAKTMUSTER_TAKT, type = TAKTMUSTER_TYPE } = {}) => {
  const tm = new Taktmuster();
  tm.setTakt(takt);
  tm.setType(type);
  return () => tm.getNext();
};

const refreshResolvedSceneLengths = async (sceneCount) => {
  const nextSource = USE_TAKTMUSTER_LENGTHS
    ? createTmLengthSource()
    : SCENE_LENGTHS_ENV;

  sceneLengthSource = nextSource;
  resolvedSceneLengths = await resolveSceneLengthsInput(nextSource, sceneCount, 3);
  sceneLengthIndex = 0;
  activeSceneDuration = resolvedSceneLengths[0] || 3;
  return resolvedSceneLengths;
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

const sceneGenerator = createSceneGenerator({
  openai,
  model: CHAT_MODEL,
  systemPrompt: promptSystems.scenePlan,
  temperature: 0.45,
  top_p: 0.9,
});

const getFrameVision = createFrameVisionHelper({
  enabled: VISION_ENABLED,
  prompt: VISION_PROMPT,
  providers: VISION_PROVIDERS,
  logPrefix: 'freshweb-low-cost',
});


const imagePrompts = {
  create: async (prompt, sceneContext, scenePlanEntry) => {
    if (scenePlanEntry?.stillPrompt) {
      return scenePlanEntry.stillPrompt;
    }
    if (scenePlanEntry?.imageDescription) {
      return scenePlanEntry.imageDescription;
    }
    return buildFallbackStillPrompt(prompt);
  },
};

const resolveLaterClipSingleImageMode = ({ isLast } = {}) => {
  if (!useDynamicSingleImageLaterClips) {
    return useSingleImageLaterClips;
  }
  return !Boolean(isLast);
};

const resolveConfiguredVideoMode = ({ index, total, isFirst, isLast }) => {
  const useSingleImage = isFirst
    ? useSingleImageFirstClip
    : resolveLaterClipSingleImageMode({ index, total, isFirst, isLast });
  return useSingleImage ? 'singleImage' : 'firstLast';
};

const applySceneLoopDefaultsToPlan = (scenePlan = []) => scenePlan.map((scene, index) => {
  const sceneIndex = index + 1;
  const total = scenePlan.length;
  const isFirst = sceneIndex === 1;
  const isLast = sceneIndex === total;
  const configuredVideoMode = resolveConfiguredVideoMode({
    index: sceneIndex,
    total,
    isFirst,
    isLast,
  });

  return {
    ...scene,
    videoMode: SCENE_PLAN_CONTROLS_VIDEO_MODE
      ? scene.videoMode
      : configuredVideoMode,
  };
});

const video = {
  prompts: {
    create: async (startFramePrompt, endFramePrompt, sceneContext, frameContext = {}) => {
      const scenePlanEntry = getScenePlanEntry(frameContext.scenePlan, sceneContext);
      setActiveSceneDuration(scenePlanEntry?.durationSeconds ?? nextSceneDuration());
      const plannedPrompt = scenePlanEntry?.videoPrompt;
      const startVision = await getFrameVision(frameContext.startFrame);
      const endVision = await getFrameVision(frameContext.endFrame);
      if (plannedPrompt) {
        return buildVisionAwarePrompt({
          basePrompt: plannedPrompt,
          startVision,
          endVision,
          anchorBuilder: normalizeVisionText,
          useSingleImage: false,
        });
      }
      return buildVisionAwarePrompt({
        basePrompt: buildFallbackVideoPrompt(
          scenePlanEntry,
          `${startFramePrompt} ${endFramePrompt}` || 'Continue into the next destination scene.'
        ),
        startVision,
        endVision,
        anchorBuilder: normalizeVisionText,
        useSingleImage: false,
      });
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
      const scenePlanEntry = getScenePlanEntry(frameContext.scenePlan, sceneContext);
      setActiveSceneDuration(scenePlanEntry?.durationSeconds ?? nextSceneDuration());
      const plannedPrompt = scenePlanEntry?.singleImagePrompt || scenePlanEntry?.videoPrompt;
      const startVision = await getFrameVision(frameContext.startFrame);
      if (plannedPrompt) {
        return buildVisionAwarePrompt({
          basePrompt: plannedPrompt,
          startVision,
          anchorBuilder: normalizeVisionText,
          useSingleImage: true,
        });
      }
      return buildVisionAwarePrompt({
        basePrompt: buildFallbackVideoPrompt(
          scenePlanEntry,
          startFramePrompt || 'Continue the current frame with subtle motion.'
        ),
        startVision,
        anchorBuilder: normalizeVisionText,
        useSingleImage: true,
      });
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
          const activeSceneLengths = await refreshResolvedSceneLengths(sceneCount);
          const sourceCues = [];
          for (let index = 0; index < sceneCount; index += 1) {
            sourceCues.push(await promptCreator.default(streams, {
              streamMixType: 'random',
            }));
          }
          const scenePlan = await sceneGenerator({
            sceneCount,
            sceneLengths: activeSceneLengths,
            sourceCues,
            visualDirection: SCENE_VISUAL_DIRECTION,
            configMode: CONFIG_MODE,
          });
          const normalizedScenePlan = applySceneLoopDefaultsToPlan(scenePlan);
          config.sceneLoop = config.sceneLoop || {};
          config.sceneLoop.scenePlan = normalizedScenePlan;
          console.log('[freshweb-low-cost] scenePlan:', normalizedScenePlan.map((scene) => scene.title).join(' | '));
          console.log(
            '[freshweb-low-cost] sceneModes:',
            normalizedScenePlan.map((scene) => scene.videoMode).join(' | ')
          );
          console.log('[freshweb-low-cost] IMG_SEED:', IMAGE_SEED, 'VID_SEED:', VIDEO_SEED);
          console.log('[freshweb-low-cost] sceneLengths:', activeSceneLengths.join(','));
          return streams;
        },

      },
    ])
  )
  .catch((err) => {
    console.error('Error in MIX-again-freshweb.low-cost.js:', err);
    process.exit(1);
  });
