import dotenv from 'dotenv';
import OpenAI from 'openai';
import path from 'node:path';
import { Taktmuster } from 'taktmuster';
import { fileURLToPath } from 'node:url';

import {
  resolveSceneCountFromConfig,
  resolveSceneLengthsInput,
} from '../helpers/scene-generator.js';
import { summarizeVisionStoryContext } from '../helpers/frame-vision.js';
import {
  applyWebcamScenePlanVideoModeDefaults,
  createWebcamFrameVision,
  createWebcamFirstLastPrompt,
  createWebcamImagePromptHandler,
  createWebcamSceneGenerator,
  createWebcamSingleImagePrompt,
  createWebcamVisionStoreHandler,
  captureWebcamImage,
  describeWebcamCameraScenePlanIssues,
  resolveWebcamScenePlanSystemPrompt,
  resolveWebcamVisionSettings,
  saveWebcamScenePlanArtifact,
  sanitizeWebcamCameraScenePlan,
} from './webcam-defaults.js';
import { resolveOpenAiModel } from '../helpers/vision-model.js';
import promptCreator from '../../../prompt-creator.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const parseBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};

const parsePositiveNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const parseFiniteNumber = (value, fallback) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const pickEnvValue = (...names) => {
  for (const name of names) {
    const value = process.env[name];
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }
  return '';
};

const parseOptionalPositiveNumber = (value) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const parsePositiveNumberList = (value) => String(value || '')
  .split(',')
  .map((entry) => Number(entry.trim()))
  .filter((entry) => Number.isFinite(entry) && entry > 0);

const parsePipeList = (value, fallback = []) => {
  const items = String(value || '')
    .split('|')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return items.length > 0 ? items : fallback;
};

const parseWordPairs = (value, fallback = [['horror', 'de']]) => {
  const raw = String(value || '').trim();
  if (!raw) {
    return fallback;
  }

  const pairs = raw
    .split('|')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [word, lang] = entry.split(',').map((part) => part.trim());
      if (!word) {
        return null;
      }
      return [word, lang || 'en'];
    })
    .filter(Boolean);

  return pairs.length > 0 ? pairs : fallback;
};

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const CHAT_MODEL = pickEnvValue('OPENAI_MODEL', 'FRESHWEB_CHAT_MODEL') || 'gpt-4o-mini';
const WAN22_FIRST_LAST_SPACE = process.env.WAN22_FIRST_LAST_SPACE || 'cakegreen/Wan-2-2-first-last-frame';
const WAN22_SINGLE_SPACE = process.env.WAN22_SINGLE_SPACE || 'Wan-AI/Wan-2.2-5B';
const WAN22_FIRST_LAST_SELF_HOSTED_SPACE = process.env.WAN22_FIRST_LAST_SELF_HOSTED_SPACE || 'eggman-poff/wan-flf2v';
const WAN22_SINGLE_SELF_HOSTED_SPACE = process.env.WAN22_SINGLE_SELF_HOSTED_SPACE || 'eggman-poff/wan-s';
const USE_SELF_HOSTED_FIRST_LAST = parseBoolean(
  pickEnvValue('FRESHWEB_SELF_HOSTED_FIRST_LAST'),
  true
);
const USE_SELF_HOSTED_SINGLE = parseBoolean(
  pickEnvValue('FRESHWEB_SELF_HOSTED_SINGLE'),
  true
);
const EXPLICIT_SCENE_LENGTHS = parsePositiveNumberList(
  pickEnvValue('FRESHWEB_SCENE_LENGTHS')
);
const EXPLICIT_SCENE_COUNT = parsePositiveNumber(
  pickEnvValue('FRESHWEB_SCENE_COUNT'),
  6
);
const USE_TAKTMUSTER_LENGTHS = parseBoolean(
  pickEnvValue('FRESHWEB_USE_TAKTMUSTER_LENGTHS'),
  EXPLICIT_SCENE_LENGTHS.length === 0
);
const FORCE_IMAGE_TO_VIDEO_ONLY = parseBoolean(
  pickEnvValue(
    'FRESHWEB_IMAGE_TO_VIDEO_ONLY',
    'FRESHWEB_SINGLE_IMAGE_ONLY'
  ),
  false
);
const DEFAULT_SCENE_LENGTH_MULTIPLIER = EXPLICIT_SCENE_LENGTHS.length > 0 ? 1 : 1.6;
const TAKTMUSTER_TAKT = parsePositiveNumber(
  pickEnvValue('FRESHWEB_TAKT'),
  4
);
const TAKTMUSTER_TYPE = String(
  pickEnvValue('FRESHWEB_TAKT_TYPE')
  ?? 'balanced'
).trim() || 'balanced';
const SCENE_LENGTH_BIAS = parseFiniteNumber(
  pickEnvValue('FRESHWEB_SCENE_LENGTH_BIAS'),
  0
);
const IMAGE_SEED = parseFiniteNumber(pickEnvValue('IMG_SEED', 'FRESHWEB_IMG_SEED'), 0);
const VIDEO_SEED = parseFiniteNumber(pickEnvValue('VID_SEED', 'FRESHWEB_VID_SEED'), 0);
const STORY_MODE = pickEnvValue('FRESHWEB_MODE') || 'camera';
const STORY_WORDS = parseWordPairs(
  pickEnvValue('FRESHWEB_WORDS'),
  [['horror', 'de']]
);
const OPENING_PROMPT_SOURCE = pickEnvValue(
  'FRESHWEB_OPENING_PROMPT'
) || 'freshweb webcam shot, candid documentary still, natural light, clear subject focus';
const STORY_VISUAL_DIRECTION = pickEnvValue(
  'FRESHWEB_SCENE_VISUAL_DIRECTION',
  'FRESHWEB_VISUAL_DIRECTION'
) || 'documentary, realistic, visually distinct scenes, coherent camera-led progression, better image quality, visible body motion, clear gesture changes, expressive face movement, readable camera movement';
const STATIC_TEST_MODE = parseBoolean(
  pickEnvValue('FRESHWEB_STATIC_TEST'),
  false
);
const STATIC_TEST_SOURCE_CUES = parsePipeList(
  pickEnvValue('FRESHWEB_STATIC_SOURCE_CUES'),
  [
    'urban documentary opening',
    'street detail close-up',
    'human interaction at a market',
    'quiet reflective ending',
  ]
);
const SCENE_LENGTH_MULTIPLIER = parsePositiveNumber(
  pickEnvValue('FRESHWEB_SCENE_LENGTH_MULTIPLIER'),
  DEFAULT_SCENE_LENGTH_MULTIPLIER
);
const MIN_SCENE_DURATION_SECONDS = parsePositiveNumber(
  pickEnvValue('FRESHWEB_MIN_SCENE_DURATION_SECONDS'),
  1
);
const SINGLE_IMAGE_MAX_DURATION = parseOptionalPositiveNumber(
  pickEnvValue('FRESHWEB_SINGLE_VIDEO_MAX_DURATION')
);
const SCENE_PLAN_CONTROLS_VIDEO_MODE = parseBoolean(
  pickEnvValue('FRESHWEB_SCENE_PLAN_CONTROLS_VIDEO_MODE'),
  !FORCE_IMAGE_TO_VIDEO_ONLY
);
const FIRST_CLIP_VIDEO_MODE = pickEnvValue(
  'FRESHWEB_FIRST_CLIP_VIDEO_MODE'
) || 'singleImage';
const LATER_SINGLE_IMAGE_DEFAULT = parseBoolean(
  pickEnvValue('FRESHWEB_LATER_CLIPS_SINGLE_IMAGE'),
  FORCE_IMAGE_TO_VIDEO_ONLY
);
const DYNAMIC_LATER_SINGLE_IMAGE = parseBoolean(
  pickEnvValue(
    'FRESHWEB_DYNAMIC_SINGLE_IMAGE_LATER_CLIPS'
  ),
  !FORCE_IMAGE_TO_VIDEO_ONLY
);
const LOCK_PROMPT_CONTINUITY_TO_OPENING_FRAME = parseBoolean(
  pickEnvValue(
    'FRESHWEB_LOCK_PROMPT_CONTINUITY_TO_OPENING_FRAME'
  ),
  true
);
const RESTART_FROM_PREVIOUS_MOVIE_LAST_FRAME = parseBoolean(
  pickEnvValue(
    'FRESHWEB_RESTART_FROM_PREVIOUS_MOVIE_LAST_FRAME'
  ),
  false
);
const SCENE_PLAN_SYSTEM_PROMPT_OVERRIDE = pickEnvValue(
  'FRESHWEB_SCENE_PLAN_SYSTEM_PROMPT'
);
const CAMERA_SCENE_PLAN_SYSTEM_PROMPT_OVERRIDE = pickEnvValue(
  'FRESHWEB_CAMERA_SCENE_PLAN_SYSTEM_PROMPT'
);
const VISION_PROMPT_OVERRIDE = pickEnvValue(
  'FRESHWEB_VISION_PROMPT'
);
const VISION_PROVIDERS_OVERRIDE = pickEnvValue(
  'FRESHWEB_VISION_PROVIDERS'
);
const VISION_ENABLED = parseBoolean(
  pickEnvValue('FRESHWEB_USE_VISION'),
  true
);
const FOLDER_NAME = pickEnvValue('FRESHWEB_FOLDER')
  || 'freshweb-middle-cost-4-3-test';
const FLUX_VARIANT = pickEnvValue('FRESHWEB_FLUX_VARIANT')
  || 'schnell';
const CAMERA_IMAGE_PATH = pickEnvValue(
  'FRESHWEB_CAMERA_IMAGE_PATH',
  'FRESHWEB_OPENING_IMAGE_PATH'
);
const CAMERA_FALLBACK_IMAGE_PATH = pickEnvValue(
  'FRESHWEB_CAMERA_FALLBACK_IMAGE_PATH'
);
const CAMERA_OUTPUT_DIR = pickEnvValue(
  'FRESHWEB_CAMERA_OUTPUT_DIR'
) || path.resolve(__dirname, '../../../../tests/GENERATIONS/camera-shot');

const CONFIG = {
  story: {
    mode: STORY_MODE,
    words: STORY_WORDS,
    openingPromptSource: OPENING_PROMPT_SOURCE,
    visualDirection: STORY_VISUAL_DIRECTION,
    staticTestMode: STATIC_TEST_MODE,
    staticSourceCues: STATIC_TEST_SOURCE_CUES,
    count: EXPLICIT_SCENE_COUNT,
    lengths: EXPLICIT_SCENE_LENGTHS,
    useTaktmusterLengths: USE_TAKTMUSTER_LENGTHS,
    taktmusterTakt: TAKTMUSTER_TAKT,
    taktmusterType: TAKTMUSTER_TYPE,
    sceneLengthMultiplier: SCENE_LENGTH_MULTIPLIER,
    sceneLengthBias: SCENE_LENGTH_BIAS,
    minSceneDurationSeconds: MIN_SCENE_DURATION_SECONDS,
    singleImageMaxDuration: SINGLE_IMAGE_MAX_DURATION,
    controlsVideoMode: SCENE_PLAN_CONTROLS_VIDEO_MODE,
    forceImageToVideoOnly: FORCE_IMAGE_TO_VIDEO_ONLY,
    firstClipVideoMode: FIRST_CLIP_VIDEO_MODE,
    laterSingleImageDefault: LATER_SINGLE_IMAGE_DEFAULT,
    dynamicLaterSingleImage: DYNAMIC_LATER_SINGLE_IMAGE,
    lockPromptContinuityToOpeningFrame: LOCK_PROMPT_CONTINUITY_TO_OPENING_FRAME,
    restartFromPreviousMovieLastFrame: RESTART_FROM_PREVIOUS_MOVIE_LAST_FRAME,
    scenePlanSystemPrompt: SCENE_PLAN_SYSTEM_PROMPT_OVERRIDE,
    cameraScenePlanSystemPrompt: CAMERA_SCENE_PLAN_SYSTEM_PROMPT_OVERRIDE,
    visionPrompt: VISION_PROMPT_OVERRIDE,
    visionProviders: VISION_PROVIDERS_OVERRIDE ? VISION_PROVIDERS_OVERRIDE.split(',').map((entry) => entry.trim()).filter(Boolean) : [],
  },
  models: {
    chatModel: CHAT_MODEL,
    imageSeed: IMAGE_SEED,
    videoSeed: VIDEO_SEED,
    visionEnabled: VISION_ENABLED,
    useSelfHostedFirstLast: USE_SELF_HOSTED_FIRST_LAST,
    useSelfHostedSingle: USE_SELF_HOSTED_SINGLE,
    wanFirstLastSpace: WAN22_FIRST_LAST_SPACE,
    wanSingleSpace: WAN22_SINGLE_SPACE,
    wanFirstLastSelfHostedSpace: WAN22_FIRST_LAST_SELF_HOSTED_SPACE,
    wanSingleSelfHostedSpace: WAN22_SINGLE_SELF_HOSTED_SPACE,
    mireloModelVersion: 'latest',
    wanFirstLastFallbackSpaces: [],
    wanSingleFallbackSpaces: [],
    runwareFirstLastModel: 'alibaba:wan@2.6-flash',
    runwareSingleModel: 'alibaba:wan@2.6-flash',
    falFirstLastFallbacks: [
      { type: 'falFirstLast', model: 'fal-ai/wan-flf2v' },
    ],
    falSingleFallbacks: [
      { type: 'falImageToVideo', model: 'fal-ai/wan/v2.2-5b/image-to-video' },
      { type: 'falImageToVideo', model: 'fal-ai/wan/turbo/image-to-video' },
    ],
  },
  camera: {
    imagePath: CAMERA_IMAGE_PATH,
    fallbackImagePath: CAMERA_FALLBACK_IMAGE_PATH,
    outputDir: CAMERA_OUTPUT_DIR,
    width: parsePositiveNumber(pickEnvValue('FRESHWEB_CAMERA_WIDTH'), 1024),
    height: parsePositiveNumber(pickEnvValue('FRESHWEB_CAMERA_HEIGHT'), 768),
    quality: parsePositiveNumber(pickEnvValue('FRESHWEB_CAMERA_QUALITY'), 100),
    warmupSeconds: parsePositiveNumber(pickEnvValue('FRESHWEB_CAMERA_WARMUP_SECONDS'), 1),
    device: pickEnvValue('FRESHWEB_CAMERA_DEVICE') || false,
  },
  render: {
    folderName: FOLDER_NAME,
    scriptName: './adapter/shorty-book/index.js',
    pollingTimeMs: parseOptionalPositiveNumber(
      pickEnvValue('POLLING_TIME_MS', 'FRESHWEB_POLLING_TIME_MS')
    ),
    fluxVariant: FLUX_VARIANT,
    image: {
      width: parsePositiveNumber(pickEnvValue('FRESHWEB_IMAGE_WIDTH'), 640),
      height: parsePositiveNumber(pickEnvValue('FRESHWEB_IMAGE_HEIGHT'), 480),
      numInferenceSteps: parsePositiveNumber(pickEnvValue('FRESHWEB_IMAGE_STEPS'), 16),
      guidanceScale: parseFiniteNumber(pickEnvValue('FRESHWEB_IMAGE_GUIDANCE'), 3),
      negativePrompt: pickEnvValue('FRESHWEB_IMAGE_NEGATIVE_PROMPT')
        || 'blurry, low detail, warped anatomy, broken perspective',
    },
    video: {
      aspectRatio: pickEnvValue('FRESHWEB_VIDEO_ASPECT_RATIO') || '4:3',
      first: {
        width: parsePositiveNumber(pickEnvValue('FRESHWEB_VIDEO_WIDTH'), 640),
        height: parsePositiveNumber(pickEnvValue('FRESHWEB_VIDEO_HEIGHT'), 480),
        steps: parsePositiveNumber(pickEnvValue('FRESHWEB_VIDEO_STEPS'), 24),
        guidanceScale: parseFiniteNumber(pickEnvValue('FRESHWEB_VIDEO_GUIDANCE'), 5),
        fps: parsePositiveNumber(pickEnvValue('FRESHWEB_VIDEO_FPS'), 10),
        numFrames: parsePositiveNumber(pickEnvValue('FRESHWEB_VIDEO_NUM_FRAMES'), 41),
        customMaxArea: parsePositiveNumber(
          pickEnvValue('FRESHWEB_VIDEO_CUSTOM_MAX_AREA'),
          640 * 480
        ),
        randomizeSeed: parseBoolean(pickEnvValue('FRESHWEB_VIDEO_RANDOMIZE_SEED'), true),
      },
      single: {
        width: parsePositiveNumber(pickEnvValue('FRESHWEB_SINGLE_VIDEO_WIDTH', 'FRESHWEB_SINGLE_WIDTH'), 640),
        height: parsePositiveNumber(pickEnvValue('FRESHWEB_SINGLE_VIDEO_HEIGHT', 'FRESHWEB_SINGLE_HEIGHT'), 480),
        fps: Number(pickEnvValue('FRESHWEB_SINGLE_FPS')) || (FORCE_IMAGE_TO_VIDEO_ONLY ? 10 : 8),
        samplingSteps: Number(pickEnvValue('FRESHWEB_VIDEO_SAMPLING_STEPS')) || (FORCE_IMAGE_TO_VIDEO_ONLY ? 18 : 24),
        guideScale: Number(pickEnvValue('FRESHWEB_VIDEO_GUIDE_SCALE')) || (FORCE_IMAGE_TO_VIDEO_ONLY ? 4 : 5),
        shift: Number(pickEnvValue('FRESHWEB_VIDEO_SHIFT')) || (FORCE_IMAGE_TO_VIDEO_ONLY ? 5 : 4),
      },
    },
    mirelo: {
      steps: parsePositiveNumber(pickEnvValue('FRESHWEB_MIRELO_STEPS'), 10),
      creativityCoef: parseFiniteNumber(pickEnvValue('FRESHWEB_MIRELO_CREATIVITY'), 2.8),
    },
  },
};

const FAL_KEY = process.env.FAL_KEY || process.env.FAL_API_KEY || process.env.FAL_AI_API_KEY || '';
const RUNWARE_KEY = process.env.RUNWARE_API_KEY || process.env.RUNWARE_KEY || '';
const FIRST_LAST_RUNWARE_FALLBACKS = RUNWARE_KEY
  ? [{ type: 'runwareFirstLast', model: CONFIG.models.runwareFirstLastModel }]
  : [];
const SINGLE_RUNWARE_FALLBACKS = RUNWARE_KEY
  ? [{ type: 'runwareImageToVideo', model: CONFIG.models.runwareSingleModel }]
  : [];
const FIRST_LAST_FAL_FALLBACKS = FAL_KEY
  ? [{ type: 'falFirstLast', model: 'fal-ai/wan-flf2v' }]
  : [];
const SINGLE_FAL_FALLBACKS = FAL_KEY
  ? [
      { type: 'falImageToVideo', model: 'fal-ai/wan/v2.2-5b/image-to-video' },
      { type: 'falImageToVideo', model: 'fal-ai/wan/turbo/image-to-video' },
    ]
  : [];

const { prompt: VISION_PROMPT, providers: VISION_PROVIDERS } = resolveWebcamVisionSettings({
  middlePrompt: CONFIG.story.visionPrompt,
  testPrompt: '',
  middleProviders: CONFIG.story.visionProviders.join(','),
  testProviders: '',
});

const SCENE_PLAN_SYSTEM_PROMPT = resolveWebcamScenePlanSystemPrompt({
  configMode: CONFIG.story.mode,
  scenePlanSystemPrompt: CONFIG.story.scenePlanSystemPrompt,
  cameraScenePlanSystemPrompt: CONFIG.story.cameraScenePlanSystemPrompt,
});
const OPENAI_VISION_MODEL = resolveOpenAiModel();

let resolvedSceneLengths = CONFIG.story.lengths.length > 0 ? [...CONFIG.story.lengths] : [];
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
  const configuredMax = Number(CONFIG.story.singleImageMaxDuration);
  if (Number.isFinite(configuredMax) && configuredMax > 0) {
    return Math.min(currentSceneDuration(), configuredMax);
  }
  return currentSceneDuration();
};

const createTaktmusterRuntime = () => {
  const taktmuster = new Taktmuster();
  taktmuster.setTakt(CONFIG.story.taktmusterTakt);
  taktmuster.setType(CONFIG.story.taktmusterType);
  const nextValue = () => {
    const step = taktmuster.getNext();
    const value = Number(step?.patternValue ?? step);
    return Number.isFinite(value) && value > 0 ? Math.round(value) : 1;
  };

  return {
    nextSceneCount: () => nextValue(),
    nextSceneLength: () => nextValue(),
  };
};

const resolveSceneCount = () => {
  return resolveSceneCountFromConfig({
    sceneLengths: CONFIG.story.useTaktmusterLengths ? [] : sceneLengthSource,
    sceneCount: CONFIG.story.count,
    defaultSceneCount: CONFIG.story.useTaktmusterLengths
      ? createTaktmusterRuntime().nextSceneCount()
      : CONFIG.story.count,
  });
};

const applySceneLengthQualityFloor = (sceneLengths = []) => sceneLengths.map((value) => {
  const minLength = Number(CONFIG.story.minSceneDurationSeconds) || 1;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return minLength;
  }
  return Math.max(minLength, parsed);
});

const applySceneLengthMultiplier = (sceneLengths = []) => {
  const multiplier = Number(CONFIG.story.sceneLengthMultiplier);
  if (!Number.isFinite(multiplier) || multiplier <= 0 || Math.abs(multiplier - 1) < 0.0001) {
    return sceneLengths;
  }

  return sceneLengths.map((value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return value;
    }
    return Number((parsed * multiplier).toFixed(2));
  });
};

const applySceneLengthBias = (sceneLengths = []) => {
  const bias = Number(CONFIG.story.sceneLengthBias);
  if (!Number.isFinite(bias) || Math.abs(bias) < 0.0001) {
    return sceneLengths;
  }

  return sceneLengths.map((value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return value;
    }
    return Number((parsed + bias).toFixed(2));
  });
};

const refreshResolvedSceneLengths = async (sceneCount) => {
  const nextSource = CONFIG.story.useTaktmusterLengths
    ? createTaktmusterRuntime().nextSceneLength
    : CONFIG.story.lengths;

  sceneLengthSource = nextSource;
  resolvedSceneLengths = applySceneLengthQualityFloor(
    applySceneLengthBias(
      applySceneLengthMultiplier(
        await resolveSceneLengthsInput(nextSource, sceneCount, 3)
      )
    )
  );
  sceneLengthIndex = 0;
  activeSceneDuration = resolvedSceneLengths[0] || 3;
  return resolvedSceneLengths;
};

const resolveStaticSourceCues = (sceneCount) => {
  const cues = CONFIG.story.staticSourceCues.length > 0
    ? CONFIG.story.staticSourceCues
    : ['documentary opening', 'detail shot', 'human scene', 'reflective ending'];
  return Array.from({ length: sceneCount }, (_, index) => cues[index % cues.length]);
};

let latestVisionResult = null;
let openingPromptContinuityVision = '';
const storeVisionResult = createWebcamVisionStoreHandler({ prompt: VISION_PROMPT });

const getFrameVision = createWebcamFrameVision({
  enabled: CONFIG.models.visionEnabled,
  prompt: VISION_PROMPT,
  providers: VISION_PROVIDERS,
  logPrefix: 'freshweb-middle-cost',
  onResult: async (payload) => {
    latestVisionResult = {
      imagePath: payload.imagePath,
      outputText: payload.outputText,
      provider: payload.result?.provider || '',
      model: payload.result?.model || '',
    };
    await storeVisionResult(payload);
  },
});

const getPromptContinuityVision = async () => (
  CONFIG.story.lockPromptContinuityToOpeningFrame
    ? openingPromptContinuityVision
    : ''
);

const sceneGenerator = createWebcamSceneGenerator({
  openai,
  model: CONFIG.models.chatModel,
  systemPrompt: SCENE_PLAN_SYSTEM_PROMPT,
  temperature: 0.45,
  top_p: 0.9,
});

const resolveLaterClipSingleImageMode = ({ isLast } = {}) => {
  if (CONFIG.story.forceImageToVideoOnly) {
    return true;
  }
  if (!CONFIG.story.dynamicLaterSingleImage) {
    return CONFIG.story.laterSingleImageDefault;
  }
  return !Boolean(isLast);
};

const resolveConfiguredVideoMode = ({ index, total, isFirst, isLast }) => {
  if (CONFIG.story.forceImageToVideoOnly) {
    return 'singleImage';
  }
  const useSingleImage = isFirst
    ? CONFIG.story.firstClipVideoMode === 'singleImage'
    : resolveLaterClipSingleImageMode({ index, total, isFirst, isLast });
  return useSingleImage ? 'singleImage' : 'firstLast';
};

const applySceneLoopDefaultsToPlan = (scenePlan = []) => applyWebcamScenePlanVideoModeDefaults(scenePlan, {
  resolveConfiguredVideoMode,
  scenePlanControlsVideoMode: CONFIG.story.controlsVideoMode,
  firstClipVideoMode: CONFIG.story.firstClipVideoMode,
});

const image = {
  fluxVariant: CONFIG.render.fluxVariant,
  width: CONFIG.render.image.width,
  height: CONFIG.render.image.height,
  num_inference_steps: CONFIG.render.image.numInferenceSteps,
  guidance_scale: CONFIG.render.image.guidanceScale,
  negative_prompt: CONFIG.render.image.negativePrompt,
  seed: CONFIG.models.imageSeed,
  prompts: {
    create: createWebcamImagePromptHandler,
  },
  staticPrompt: {},
};

const video = {
  prompts: {
    create: createWebcamFirstLastPrompt({
      configMode: CONFIG.story.mode,
      getFrameVision,
      getContinuityFrameVision: getPromptContinuityVision,
      setActiveSceneDuration,
      nextSceneDuration,
    }),
  },
  model: {
    audioOnly: true,
    steps: CONFIG.render.video.first.steps,
    duration_seconds: currentSceneDuration,
    width: CONFIG.render.video.first.width,
    height: CONFIG.render.video.first.height,
    guidance_scale: CONFIG.render.video.first.guidanceScale,
    fps: CONFIG.render.video.first.fps,
    seed: CONFIG.models.videoSeed,
    randomize_seed: CONFIG.render.video.first.randomizeSeed,
    custom_max_area: CONFIG.render.video.first.customMaxArea,
    space: CONFIG.models.wanFirstLastSpace,
    selfHostedHugginfaceModel: CONFIG.models.useSelfHostedFirstLast,
    selfHostedHugginfaceSpace: CONFIG.models.wanFirstLastSelfHostedSpace,
    aspect_ratio: CONFIG.render.video.aspectRatio,
    fallbacks: [
      ...CONFIG.models.wanFirstLastFallbackSpaces.map((space) => ({ type: 'wanFirstLast', space })),
      ...FIRST_LAST_RUNWARE_FALLBACKS,
      ...FIRST_LAST_FAL_FALLBACKS,
    ],
  },
  useImagePrompt: false,
};

const video2 = {
  prompts: {
    create: createWebcamSingleImagePrompt({
      configMode: CONFIG.story.mode,
      getFrameVision,
      getContinuityFrameVision: getPromptContinuityVision,
      setActiveSceneDuration,
      nextSceneDuration,
    }),
  },
  model: {
    audioOnly: true,
    steps: CONFIG.render.video.first.steps,
    duration_seconds: currentSingleImageDuration,
    height: CONFIG.render.video.single.height,
    width: CONFIG.render.video.single.width,
    fps: CONFIG.render.video.single.fps,
    sampling_steps: CONFIG.render.video.single.samplingSteps,
    guide_scale: CONFIG.render.video.single.guideScale,
    shift: CONFIG.render.video.single.shift,
    seed: CONFIG.models.videoSeed,
    randomize_seed: false,
    space: CONFIG.models.wanSingleSpace,
    selfHostedHugginfaceModel: CONFIG.models.useSelfHostedSingle,
    selfHostedHugginfaceSpace: CONFIG.models.wanSingleSelfHostedSpace,
    aspect_ratio: CONFIG.render.video.aspectRatio,
    fallbacks: [
      ...CONFIG.models.wanSingleFallbackSpaces.map((space) => ({ type: 'wanSingleImage', space })),
      ...SINGLE_RUNWARE_FALLBACKS,
      ...SINGLE_FAL_FALLBACKS,
    ],
  },
  useImagePrompt: false,
};

const mireloAI = {
  duration: async () => currentSceneDuration(),
  num_samples: 1,
  steps: CONFIG.render.mirelo.steps,
  seed: -1,
  creativity_coef: CONFIG.render.mirelo.creativityCoef,
  model_version: CONFIG.models.mireloModelVersion,
  maxRetries5xx: 0,
  retryDelayMs: 250,
  auto_upload_if_local: true,
};

const captureCameraShot = () => captureWebcamImage({
  cameraOutputDir: CONFIG.camera.outputDir,
  cameraFallbackImagePath: CONFIG.camera.fallbackImagePath,
  captureOptions: {
    width: CONFIG.camera.width,
    height: CONFIG.camera.height,
    quality: CONFIG.camera.quality,
    warmupSeconds: CONFIG.camera.warmupSeconds,
    output: 'jpeg',
    extension: 'jpg',
    device: CONFIG.camera.device,
  },
});

const resolveOpeningCameraShot = async () => (
  CONFIG.camera.imagePath
    ? {
        imagePath: path.resolve(CONFIG.camera.imagePath),
        imageSource: 'configured',
      }
    : {
        imagePath: await captureCameraShot(),
        imageSource: 'captured',
      }
);

const buildOpeningVisionPayload = (openingCameraShot, openingVisionText) => {
  if (!openingVisionText) {
    return {
      imagePath: openingCameraShot,
      outputText: '',
      provider: '',
      model: '',
    };
  }

  if (latestVisionResult?.imagePath === openingCameraShot) {
    return { ...latestVisionResult };
  }

  return {
    imagePath: openingCameraShot,
    outputText: openingVisionText,
    provider: '',
    model: '',
  };
};

const saveCameraSnapshotArtifact = async ({
  outputDir,
  openingCameraShot,
  imageSource,
  sourceCues,
  sceneCount,
  sceneLengths,
  visionStoryContext,
  rawScenePlan,
  runtimeScenePlan,
  scenePlan,
  openingVision,
} = {}) => saveWebcamScenePlanArtifact({
  outputDir,
  payload: {
    openAiVisionModel: openingVision?.provider === 'openai'
      ? (openingVision.model || OPENAI_VISION_MODEL)
      : (VISION_PROVIDERS.includes('openai') ? OPENAI_VISION_MODEL : ''),
    openAiSceneModel: CONFIG.models.chatModel,
    configMode: CONFIG.story.mode,
    visionPrompt: VISION_PROMPT,
    visionProviders: VISION_PROVIDERS,
    scenePlanSystemPrompt: SCENE_PLAN_SYSTEM_PROMPT,
    requestedSceneCount: sceneCount,
    effectiveSceneCount: scenePlan.length,
    imagePath: openingCameraShot,
    imageSource,
    sourceCues,
    visionStoryContext,
    sceneLengths: sceneLengths.slice(0, scenePlan.length),
    vision: openingVision,
    rawScenePlan,
    runtimeScenePlan,
    appliedScenePlan: scenePlan,
  },
});

const buildSceneLoopConfig = () => ({
  enabled: true,
  sceneCount: async () => resolveSceneCount(),
  chainFromPreviousLoopLastFrame: true,
  restartFromPreviousMovieLastFrame: CONFIG.story.restartFromPreviousMovieLastFrame,
  independentSceneStarts: false,
  firstClipUseSingleImage: CONFIG.story.firstClipVideoMode === 'singleImage',
  subsequentClipsUseSingleImage: resolveLaterClipSingleImageMode,
  captureLastFrame: true,
  ...(CONFIG.story.mode === 'camera'
    ? {
        liveEndImage: {
          captureFn: async () => captureCameraShot(),
          promptSource: '',
        },
      }
    : {}),
  openingImage: {
    promptSource: CONFIG.camera.imagePath ? '' : CONFIG.story.openingPromptSource,
    sourceType: 'cameraShot',
    ...(CONFIG.camera.imagePath ? { imagePath: CONFIG.camera.imagePath } : {}),
  },
});

const buildSourceCues = async (streams, sceneCount) => {
  if (CONFIG.story.staticTestMode) {
    return resolveStaticSourceCues(sceneCount);
  }

  const sourceCues = [];
  for (let index = 0; index < sceneCount; index += 1) {
    sourceCues.push(await promptCreator.default(streams, { streamMixType: 'random' }));
  }
  return sourceCues;
};

const logSceneLoopSummary = ({
  openingCameraShot,
  sourceCues,
  scenePlan,
  sceneLengths,
} = {}) => {
  console.log('[freshweb-middle-cost-4-3] openingCameraShot:', openingCameraShot);
  if (CONFIG.story.staticTestMode) {
    console.log('[freshweb-middle-cost-4-3] staticTestMode: enabled');
    console.log('[freshweb-middle-cost-4-3] sourceCues:', sourceCues.join(' | '));
  }
  console.log('[freshweb-middle-cost-4-3] scenePlan:', scenePlan.map((scene) => scene.title).join(' | '));
  console.log('[freshweb-middle-cost-4-3] sceneModes:', scenePlan.map((scene) => scene.videoMode).join(' | '));
  console.log('[freshweb-middle-cost-4-3] IMG_SEED:', CONFIG.models.imageSeed, 'VID_SEED:', CONFIG.models.videoSeed);
  console.log('[freshweb-middle-cost-4-3] taktmuster:', `${CONFIG.story.taktmusterType} | takt ${CONFIG.story.taktmusterTakt}`);
  console.log('[freshweb-middle-cost-4-3] sceneLengthMultiplier:', CONFIG.story.sceneLengthMultiplier);
  console.log('[freshweb-middle-cost-4-3] sceneLengthBias:', CONFIG.story.sceneLengthBias);
  console.log('[freshweb-middle-cost-4-3] imageToVideoOnly:', CONFIG.story.forceImageToVideoOnly);
  console.log('[freshweb-middle-cost-4-3] sceneLengths:', sceneLengths.join(','));
  console.log('[freshweb-middle-cost-4-3] scenes:');
  for (const scene of scenePlan) {
    console.log(
      `  ${scene.index}. ${scene.title} | ${scene.videoMode} | ${scene.frameSource} | ${scene.durationSeconds}s`
    );
  }
};

const promptFunktion = async (streams, config) => {
  openingPromptContinuityVision = '';
  const {
    imagePath: openingCameraShot,
    imageSource,
  } = await resolveOpeningCameraShot();
  const sceneCount = resolveSceneCount();
  const activeSceneLengths = await refreshResolvedSceneLengths(sceneCount);
  const sourceCues = await buildSourceCues(streams, sceneCount);
  const openingVisionText = await getFrameVision(
    { image: { path: openingCameraShot } },
    { prompt: VISION_PROMPT }
  );
  openingPromptContinuityVision = openingVisionText || '';
  const visionStoryContext = summarizeVisionStoryContext(openingVisionText);
  const openingVision = buildOpeningVisionPayload(openingCameraShot, openingVisionText);

  const rawScenePlan = await sceneGenerator({
    sceneCount,
    sceneLengths: activeSceneLengths,
    sourceCues,
    visualDirection: CONFIG.story.visualDirection,
    visionStoryContext,
    configMode: CONFIG.story.mode,
  });

  if (CONFIG.story.mode === 'camera') {
    const rawCameraPlanIssues = describeWebcamCameraScenePlanIssues(rawScenePlan);
    if (rawCameraPlanIssues.length > 0) {
      console.warn(
        `[freshweb-middle-cost-4-3] raw camera scene-plan issues${CONFIG.story.forceImageToVideoOnly ? ' (before image-to-video-only override)' : ''}:`,
        rawCameraPlanIssues
      );
    }
  }

  const runtimeScenePlan = applySceneLoopDefaultsToPlan(rawScenePlan);
  const scenePlan = CONFIG.story.mode === 'camera'
    ? sanitizeWebcamCameraScenePlan(runtimeScenePlan)
    : runtimeScenePlan;

  config.sceneLoop = config.sceneLoop || {};
  config.sceneLoop.scenePlan = scenePlan;
  config.sceneLoop.openingImage = {
    ...(config.sceneLoop.openingImage || {}),
    imagePath: openingCameraShot,
    promptSource: '',
    sourceType: 'cameraShot',
  };

  await saveCameraSnapshotArtifact({
    outputDir: config.outputDir,
    openingCameraShot,
    imageSource,
    sourceCues,
    sceneCount,
    sceneLengths: activeSceneLengths,
    visionStoryContext,
    rawScenePlan,
    runtimeScenePlan,
    scenePlan,
    openingVision,
  });

  logSceneLoopSummary({
    openingCameraShot,
    sourceCues,
    scenePlan,
    sceneLengths: activeSceneLengths,
  });

  return streams;
};

const adapterConfig = {
  refresh: true,
  folderName: CONFIG.render.folderName,
  streamMixType: 'random',
  model: {
    scriptName: CONFIG.render.scriptName,
    pollingTime: CONFIG.render.pollingTimeMs,
    forceImageToVideoOnly: CONFIG.story.forceImageToVideoOnly,
  },
  words: CONFIG.story.words,
  video,
  video2,
  mireloAI,
  image,
  sceneLoop: buildSceneLoopConfig(),
  promptFunktion,
};

import('../../../../semantic-stream.js')
  .then((module) => module.default([adapterConfig]))
  .catch((err) => {
    console.error('Error in shorty-book/freshweb.js:', err);
    process.exit(1);
  });
