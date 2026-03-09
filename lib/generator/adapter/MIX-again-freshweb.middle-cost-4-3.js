import dotenv from 'dotenv';
import fs from 'fs-extra';
import OpenAI from 'openai';
import path from 'node:path';
import { Taktmuster } from 'taktmuster';
import { fileURLToPath } from 'node:url';

import {
  buildFallbackStillPrompt,
  buildFallbackVideoPrompt,
  createSceneGenerator,
  DEFAULT_SCENE_SYSTEM_PROMPT,
  getScenePlanEntry,
  resolveSceneCountFromConfig,
  resolveSceneLengthsInput,
} from './helpers/scene-generator.js';
import { createFrameVisionHelper } from './helpers/frame-vision.js';
import {
  buildVisionAwarePrompt,
  resolveFreshwebVisionPrompt,
  resolveFreshwebVisionProviders,
} from './helpers/freshweb-vision-prompt.js';
import getIamge from '../../helper/getIamge.js';
import promptCreator from '../../prompt-creator.js';

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ANSI = {
  reset: '\x1b[0m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const CHAT_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const WAN22_FIRST_LAST_SPACE = process.env.WAN22_FIRST_LAST_SPACE || 'cakegreen/Wan-2-2-first-last-frame';
const WAN22_SINGLE_SPACE = process.env.WAN22_SINGLE_SPACE || 'Wan-AI/Wan-2.2-5B';
const WAN22_FIRST_LAST_SELF_HOSTED_SPACE = process.env.WAN22_FIRST_LAST_SELF_HOSTED_SPACE || 'eggman-poff/wan-flf2v';
const WAN22_SINGLE_SELF_HOSTED_SPACE = process.env.WAN22_SINGLE_SELF_HOSTED_SPACE || 'eggman-poff/wan-s';
const FAL_KEY = process.env.FAL_KEY || process.env.FAL_API_KEY || process.env.FAL_AI_API_KEY || '';
const RUNWARE_KEY = process.env.RUNWARE_API_KEY || process.env.RUNWARE_KEY || '';
const WAN22_FIRST_LAST_FALLBACK_SPACES = (process.env.WAN22_FIRST_LAST_FALLBACK_SPACES || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const WAN22_SINGLE_FALLBACK_SPACES = (process.env.WAN22_SINGLE_FALLBACK_SPACES || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const MIRELO_MODEL_VERSION = process.env.MIRELO_MODEL_VERSION || 'latest';
const DEFAULT_FAL_SINGLE_FALLBACKS = FAL_KEY
  ? [
      { type: 'falImageToVideo', model: 'fal-ai/wan/v2.2-5b/image-to-video' },
      { type: 'falImageToVideo', model: 'fal-ai/wan/turbo/image-to-video' },
    ]
  : [];
const DEFAULT_FAL_FIRST_LAST_FALLBACKS = FAL_KEY
  ? [
      { type: 'falFirstLast', model: 'fal-ai/wan-flf2v' },
    ]
  : [];
const DEFAULT_RUNWARE_SINGLE_FALLBACKS = RUNWARE_KEY
  ? [
      { type: 'runwareImageToVideo', model: process.env.RUNWARE_SINGLE_MODEL || 'alibaba:wan@2.6-flash' },
    ]
  : [];
const DEFAULT_RUNWARE_FIRST_LAST_FALLBACKS = RUNWARE_KEY
  ? [
      { type: 'runwareFirstLast', model: process.env.RUNWARE_FIRST_LAST_MODEL || 'alibaba:wan@2.6-flash' },
    ]
  : [];

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
const SCENE_LENGTHS_ENV = (
  process.env.FRESHWEB_MIDDLE_SCENE_LENGTHS
  || process.env.FRESHWEB_TEST_SCENE_LENGTHS
  || ''
)
  .split(',')
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isFinite(value) && value > 0);

const DEFAULT_SCENE_COUNT = Number(process.env.FRESHWEB_MIDDLE_4_3_SCENE_COUNT)
  || Number(process.env.FRESHWEB_MIDDLE_SCENE_COUNT)
  || Number(process.env.FRESHWEB_TEST_SCENE_COUNT)
  || 5;
const USE_TAKTMUSTER_LENGTHS = parseBoolean(
  process.env.FRESHWEB_MIDDLE_USE_TAKTMUSTER_LENGTHS ?? process.env.FRESHWEB_TEST_USE_TAKTMUSTER_LENGTHS,
  SCENE_LENGTHS_ENV.length === 0
);
const TAKTMUSTER_TAKT = Number(process.env.FRESHWEB_MIDDLE_TAKTMUSTER_TAKT || process.env.FRESHWEB_TEST_TAKTMUSTER_TAKT) || 4;
const TAKTMUSTER_TYPE = process.env.FRESHWEB_MIDDLE_TAKTMUSTER_TYPE || process.env.FRESHWEB_TEST_TAKTMUSTER_TYPE || 'balanced';

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

const words = [['horror', 'de']];
const scriptName = './adapter/shorty-book/index.js';
const openingPromptSource = process.env.FRESHWEB_MIDDLE_OPENING_PROMPT
  || process.env.FRESHWEB_TEST_OPENING_PROMPT
  || 'freshweb webcam shot, candid documentary still, natural light, clear subject focus';
const useSingleImageFirstClip = parseBoolean(process.env.FRESHWEB_MIDDLE_FIRST_CLIP_SINGLE_IMAGE, true);
const useSingleImageLaterClips = parseBoolean(process.env.FRESHWEB_MIDDLE_LATER_CLIPS_SINGLE_IMAGE, false);
const useDynamicSingleImageLaterClips = parseBoolean(
  process.env.FRESHWEB_MIDDLE_DYNAMIC_SINGLE_IMAGE_LATER_CLIPS ?? process.env.FRESHWEB_TEST_DYNAMIC_SINGLE_IMAGE_LATER_CLIPS,
  true
);
const SCENE_PLAN_CONTROLS_VIDEO_MODE = parseBoolean(
  process.env.FRESHWEB_MIDDLE_SCENE_PLAN_CONTROLS_VIDEO_MODE ?? process.env.FRESHWEB_TEST_SCENE_PLAN_CONTROLS_VIDEO_MODE,
  false
);
const USE_SELF_HOSTED_FIRST_LAST = parseBoolean(
  process.env.FRESHWEB_MIDDLE_SELF_HOSTED_FIRST_LAST ?? process.env.FRESHWEB_TEST_SELF_HOSTED_FIRST_LAST,
  true
);
const USE_SELF_HOSTED_SINGLE = parseBoolean(
  process.env.FRESHWEB_MIDDLE_SELF_HOSTED_SINGLE ?? process.env.FRESHWEB_TEST_SELF_HOSTED_SINGLE,
  true
);
const VISION_ENABLED = parseBoolean(process.env.FRESHWEB_MIDDLE_USE_VISION ?? process.env.FRESHWEB_TEST_USE_VISION, true);
const VISION_PROMPT = resolveFreshwebVisionPrompt(
  process.env.FRESHWEB_MIDDLE_VISION_PROMPT,
  process.env.FRESHWEB_TEST_VISION_PROMPT
);
const VISION_PROVIDERS = resolveFreshwebVisionProviders(
  process.env.FRESHWEB_MIDDLE_VISION_PROVIDERS,
  process.env.FRESHWEB_TEST_VISION_PROVIDERS
);
const SCENE_VISUAL_DIRECTION = process.env.FRESHWEB_MIDDLE_SCENE_VISUAL_DIRECTION
  || process.env.FRESHWEB_TEST_SCENE_VISUAL_DIRECTION
  || 'documentary, realistic, visually distinct scenes, coherent camera-led progression, better image quality';
const CONFIG_MODE = process.env.FRESHWEB_MIDDLE_MODE || 'camera';
const STATIC_TEST_MODE = parseBoolean(process.env.FRESHWEB_MIDDLE_STATIC_TEST, false);
const STATIC_TEST_SOURCE_CUES = (
  process.env.FRESHWEB_MIDDLE_STATIC_SOURCE_CUES
  || 'urban documentary opening|street detail close-up|human interaction at a market|quiet reflective ending'
)
  .split('|')
  .map((value) => value.trim())
  .filter(Boolean);
const promptSystems = {
  scenePlan: process.env.FRESHWEB_MIDDLE_SCENE_PLAN_SYSTEM_PROMPT
    || process.env.FRESHWEB_TEST_SCENE_PLAN_SYSTEM_PROMPT
    || DEFAULT_SCENE_SYSTEM_PROMPT,
};
const CAMERA_IMAGE_PATH = process.env.FRESHWEB_MIDDLE_CAMERA_IMAGE_PATH
  || process.env.FRESHWEB_MIDDLE_OPENING_IMAGE_PATH
  || '';
const CAMERA_FALLBACK_IMAGE_PATH = process.env.FRESHWEB_MIDDLE_CAMERA_FALLBACK_IMAGE_PATH
  || path.resolve(__dirname, '../test.datas/timba-lake.png');
const CAMERA_OUTPUT_DIR = process.env.FRESHWEB_MIDDLE_CAMERA_OUTPUT_DIR
  || path.resolve(__dirname, '../../../tests/GENERATIONS/camera-shot');

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

const resolveStaticSourceCues = (sceneCount) => {
  const cues = STATIC_TEST_SOURCE_CUES.length > 0
    ? STATIC_TEST_SOURCE_CUES
    : ['documentary opening', 'detail shot', 'human scene', 'reflective ending'];
  return Array.from({ length: sceneCount }, (_, index) => cues[index % cues.length]);
};

const imageModelData = {
  fluxVariant: process.env.FRESHWEB_MIDDLE_FLUX_VARIANT || 'schnell',
  width: Number(process.env.FRESHWEB_MIDDLE_4_3_IMAGE_WIDTH) || Number(process.env.FRESHWEB_MIDDLE_IMAGE_WIDTH) || 256,
  height: Number(process.env.FRESHWEB_MIDDLE_4_3_IMAGE_HEIGHT) || Number(process.env.FRESHWEB_MIDDLE_IMAGE_HEIGHT) || 192,
  num_inference_steps: Number(process.env.FRESHWEB_MIDDLE_IMAGE_STEPS) || 8,
  guidance_scale: Number(process.env.FRESHWEB_MIDDLE_IMAGE_GUIDANCE) || 2.5,
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
  logPrefix: 'freshweb-middle-cost',
  onResult: async ({ imagePath, outputText, result }) => {
    const marker = `${path.sep}parts${path.sep}`;
    const markerIndex = imagePath.indexOf(marker);
    if (markerIndex < 0) {
      return;
    }
    const runRoot = imagePath.slice(0, markerIndex);
    const visionDir = path.join(runRoot, 'parts', 'vision-store');
    await fs.ensureDir(visionDir);
    const targetPath = path.join(
      visionDir,
      `${path.basename(imagePath).replace(path.extname(imagePath), '')}.vision.json`
    );
    await fs.writeJson(targetPath, {
      imagePath,
      outputText,
      provider: result?.provider || '',
      model: result?.model || '',
      prompt: VISION_PROMPT,
      timestamp: new Date().toISOString(),
    }, { spaces: 2 });
  },
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
        useSingleImage: false,
      });
    },
  },
  model: {
    audioOnly: true,
    steps: Number(process.env.FRESHWEB_MIDDLE_VIDEO_STEPS) || 6,
    duration_seconds: currentSceneDuration,
    seed: VIDEO_SEED,
    randomize_seed: false,
    space: WAN22_FIRST_LAST_SPACE,
    selfHostedHugginfaceModel: USE_SELF_HOSTED_FIRST_LAST,
    selfHostedHugginfaceSpace: WAN22_FIRST_LAST_SELF_HOSTED_SPACE,
    aspect_ratio: process.env.FRESHWEB_MIDDLE_4_3_ASPECT_RATIO || '4:3',
    fallbacks: [
      ...WAN22_FIRST_LAST_FALLBACK_SPACES.map((space) => ({ type: 'wanFirstLast', space })),
      ...DEFAULT_RUNWARE_FIRST_LAST_FALLBACKS,
      ...DEFAULT_FAL_FIRST_LAST_FALLBACKS,
    ],
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
          useSingleImage: true,
        });
      }
      return buildVisionAwarePrompt({
        basePrompt: buildFallbackVideoPrompt(
          scenePlanEntry,
          startFramePrompt || 'Continue the current frame with subtle motion.'
        ),
        startVision,
        useSingleImage: true,
      });
    },
  },
  model: {
    audioOnly: true,
    steps: Number(process.env.FRESHWEB_MIDDLE_VIDEO_STEPS) || 6,
    duration_seconds: currentSingleImageDuration,
    height: Number(process.env.FRESHWEB_MIDDLE_4_3_VIDEO_HEIGHT) || Number(process.env.FRESHWEB_MIDDLE_VIDEO_HEIGHT) || 384,
    width: Number(process.env.FRESHWEB_MIDDLE_4_3_VIDEO_WIDTH) || Number(process.env.FRESHWEB_MIDDLE_VIDEO_WIDTH) || 512,
    sampling_steps: Number(process.env.FRESHWEB_MIDDLE_VIDEO_SAMPLING_STEPS) || 18,
    guide_scale: Number(process.env.FRESHWEB_MIDDLE_VIDEO_GUIDE_SCALE) || 4,
    shift: Number(process.env.FRESHWEB_MIDDLE_VIDEO_SHIFT) || 5,
    seed: VIDEO_SEED,
    randomize_seed: false,
    space: WAN22_SINGLE_SPACE,
    selfHostedHugginfaceModel: USE_SELF_HOSTED_SINGLE,
    selfHostedHugginfaceSpace: WAN22_SINGLE_SELF_HOSTED_SPACE,
    aspect_ratio: process.env.FRESHWEB_MIDDLE_4_3_ASPECT_RATIO || '4:3',
    fallbacks: [
      ...WAN22_SINGLE_FALLBACK_SPACES.map((space) => ({ type: 'wanSingleImage', space })),
      ...DEFAULT_RUNWARE_SINGLE_FALLBACKS,
      ...DEFAULT_FAL_SINGLE_FALLBACKS,
    ],
  },
  useImagePrompt: false,
};

const mireloAI = {
  duration: async () => currentSceneDuration(),
  num_samples: 1,
  steps: Number(process.env.FRESHWEB_MIDDLE_MIRELO_STEPS) || 8,
  seed: -1,
  creativity_coef: Number(process.env.FRESHWEB_MIDDLE_MIRELO_CREATIVITY) || 2.5,
  model_version: MIRELO_MODEL_VERSION,
  maxRetries5xx: 0,
  retryDelayMs: 250,
  auto_upload_if_local: true,
};

const resolveOpeningCameraShot = async () => {
  if (CAMERA_IMAGE_PATH) {
    return path.resolve(CAMERA_IMAGE_PATH);
  }

  return getIamge({
    outputDir: CAMERA_OUTPUT_DIR,
    width: Number(process.env.FRESHWEB_MIDDLE_CAMERA_WIDTH) || 1280,
    height: Number(process.env.FRESHWEB_MIDDLE_CAMERA_HEIGHT) || 720,
    quality: Number(process.env.FRESHWEB_MIDDLE_CAMERA_QUALITY) || 100,
    warmupSeconds: Number(process.env.FRESHWEB_MIDDLE_CAMERA_WARMUP_SECONDS) || 1,
    output: 'jpeg',
    extension: 'jpg',
    device: process.env.FRESHWEB_MIDDLE_CAMERA_DEVICE || false,
    fallbackImagePath: CAMERA_FALLBACK_IMAGE_PATH,
  });
};

const resolveLiveCameraShot = async () => getIamge({
  outputDir: CAMERA_OUTPUT_DIR,
  width: Number(process.env.FRESHWEB_MIDDLE_CAMERA_WIDTH) || 1280,
  height: Number(process.env.FRESHWEB_MIDDLE_CAMERA_HEIGHT) || 720,
  quality: Number(process.env.FRESHWEB_MIDDLE_CAMERA_QUALITY) || 100,
  warmupSeconds: Number(process.env.FRESHWEB_MIDDLE_CAMERA_WARMUP_SECONDS) || 1,
  output: 'jpeg',
  extension: 'jpg',
  device: process.env.FRESHWEB_MIDDLE_CAMERA_DEVICE || false,
  fallbackImagePath: CAMERA_FALLBACK_IMAGE_PATH,
});




import('../../../semantic-stream.js')
  .then((module) =>
    module.default([
      {
        refresh: true,
        folderName: process.env.FRESHWEB_MIDDLE_4_3_FOLDER || process.env.FRESHWEB_MIDDLE_FOLDER || 'freshweb-middle-cost-4-3-test',
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
          ...(CONFIG_MODE === 'camera'
            ? {
                liveEndImage: {
                  captureFn: resolveLiveCameraShot,
                  promptSource: '',
                },
              }
            : {}),
          openingImage: {
            promptSource: CAMERA_IMAGE_PATH
              ? ''
              : openingPromptSource,
            sourceType: 'cameraShot',
            ...(CAMERA_IMAGE_PATH
              ? { imagePath: CAMERA_IMAGE_PATH }
              : {}),
          },
        },
        promptFunktion: async (streams, config) => {
          const openingCameraShot = await resolveOpeningCameraShot();
          const sceneCount = resolveSceneCount();
          const activeSceneLengths = await refreshResolvedSceneLengths(sceneCount);
          const sourceCues = [];
          if (STATIC_TEST_MODE) {
            sourceCues.push(...resolveStaticSourceCues(sceneCount));
          } else {
            for (let index = 0; index < sceneCount; index += 1) {
              sourceCues.push(await promptCreator.default(streams, {
                streamMixType: 'random',
              }));
            }
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
          config.sceneLoop.openingImage = {
            ...(config.sceneLoop.openingImage || {}),
            imagePath: openingCameraShot,
            promptSource: '',
            sourceType: 'cameraShot',
          };
          console.log('[freshweb-middle-cost-4-3] openingCameraShot:', openingCameraShot);
          if (STATIC_TEST_MODE) {
            console.log('[freshweb-middle-cost-4-3] staticTestMode: enabled');
            console.log('[freshweb-middle-cost-4-3] sourceCues:', sourceCues.join(' | '));
          }
          console.log('[freshweb-middle-cost-4-3] scenePlan:', normalizedScenePlan.map((scene) => scene.title).join(' | '));
          console.log(
            '[freshweb-middle-cost-4-3] sceneModes:',
            normalizedScenePlan.map((scene) => scene.videoMode).join(' | ')
          );
          console.log('[freshweb-middle-cost-4-3] IMG_SEED:', IMAGE_SEED, 'VID_SEED:', VIDEO_SEED);
          console.log('[freshweb-middle-cost-4-3] sceneLengths:', activeSceneLengths.join(','));
          return streams;
        },

      },
    ])
  )
  .catch((err) => {
    console.error('Error in MIX-again-freshweb.middle-cost-4-3.js:', err);
    process.exit(1);
  });
