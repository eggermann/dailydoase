import dotenv from 'dotenv';
import OpenAI from 'openai';
import path from 'node:path';
import { Taktmuster } from 'taktmuster';
import { fileURLToPath } from 'node:url';

import {
  resolveSceneCountFromConfig,
  resolveSceneLengthsInput,
} from './helpers/scene-generator.js';
import { summarizeVisionStoryContext } from './helpers/frame-vision.js';
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
} from './shorty-book/webcam-defaults.js';
import { resolveOpenAiModel } from './helpers/vision-model.js';
import promptCreator from '../../prompt-creator.js';

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

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const CHAT_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const WAN22_FIRST_LAST_SPACE = process.env.WAN22_FIRST_LAST_SPACE || 'cakegreen/Wan-2-2-first-last-frame';
const WAN22_SINGLE_SPACE = process.env.WAN22_SINGLE_SPACE || 'Wan-AI/Wan-2.2-5B';
const WAN22_FIRST_LAST_SELF_HOSTED_SPACE = process.env.WAN22_FIRST_LAST_SELF_HOSTED_SPACE || 'eggman-poff/wan-flf2v';
const WAN22_SINGLE_SELF_HOSTED_SPACE = process.env.WAN22_SINGLE_SELF_HOSTED_SPACE || 'eggman-poff/wan-s';
const USE_SELF_HOSTED_FIRST_LAST = parseBoolean(
  process.env.FRESHWEB_MIDDLE_SELF_HOSTED_FIRST_LAST ?? process.env.FRESHWEB_TEST_SELF_HOSTED_FIRST_LAST,
  true
);
const USE_SELF_HOSTED_SINGLE = parseBoolean(
  process.env.FRESHWEB_MIDDLE_SELF_HOSTED_SINGLE ?? process.env.FRESHWEB_TEST_SELF_HOSTED_SINGLE,
  true
);
const EXPLICIT_SCENE_LENGTHS = parsePositiveNumberList(
  process.env.FRESHWEB_MIDDLE_SCENE_LENGTHS ?? process.env.FRESHWEB_TEST_SCENE_LENGTHS
);
const EXPLICIT_SCENE_COUNT = parsePositiveNumber(
  process.env.FRESHWEB_MIDDLE_SCENE_COUNT ?? process.env.FRESHWEB_TEST_SCENE_COUNT,
  6
);
const USE_TAKTMUSTER_LENGTHS = parseBoolean(
  process.env.FRESHWEB_MIDDLE_USE_TAKTMUSTER_LENGTHS ?? process.env.FRESHWEB_TEST_USE_TAKTMUSTER_LENGTHS,
  EXPLICIT_SCENE_LENGTHS.length === 0
);
const FORCE_IMAGE_TO_VIDEO_ONLY = parseBoolean(
  process.env.FRESHWEB_MIDDLE_IMAGE_TO_VIDEO_ONLY ?? process.env.FRESHWEB_MIDDLE_SINGLE_IMAGE_ONLY,
  false
);
const DEFAULT_SCENE_LENGTH_MULTIPLIER = EXPLICIT_SCENE_LENGTHS.length > 0 ? 1 : 1.6;
const TAKTMUSTER_TAKT = parsePositiveNumber(
  process.env.FRESHWEB_MIDDLE_TAKTMUSTER_TAKT ?? process.env.FRESHWEB_TEST_TAKTMUSTER_TAKT,
  4
);
const TAKTMUSTER_TYPE = String(
  process.env.FRESHWEB_MIDDLE_TAKTMUSTER_TYPE
  ?? process.env.FRESHWEB_TEST_TAKTMUSTER_TYPE
  ?? 'balanced'
).trim() || 'balanced';
const SCENE_LENGTH_BIAS = parseFiniteNumber(
  process.env.FRESHWEB_MIDDLE_SCENE_LENGTH_BIAS ?? process.env.FRESHWEB_TEST_SCENE_LENGTH_BIAS,
  0
);

const CONFIG = {
  story: {
    mode: 'camera',
    words: [['horror', 'de']],
    openingPromptSource: 'freshweb webcam shot, candid documentary still, natural light, clear subject focus',
    visualDirection: 'documentary, realistic, visually distinct scenes, coherent camera-led progression, better image quality, visible body motion, clear gesture changes, expressive face movement, readable camera movement',
    staticTestMode: false,
    staticSourceCues: [
      'urban documentary opening',
      'street detail close-up',
      'human interaction at a market',
      'quiet reflective ending',
    ],
    count: EXPLICIT_SCENE_COUNT,
    lengths: EXPLICIT_SCENE_LENGTHS,
    useTaktmusterLengths: USE_TAKTMUSTER_LENGTHS,
    taktmusterTakt: TAKTMUSTER_TAKT,
    taktmusterType: TAKTMUSTER_TYPE,
    sceneLengthMultiplier: parsePositiveNumber(process.env.FRESHWEB_MIDDLE_SCENE_LENGTH_MULTIPLIER, DEFAULT_SCENE_LENGTH_MULTIPLIER),
    sceneLengthBias: SCENE_LENGTH_BIAS,
    minSceneDurationSeconds: 1,
    singleImageMaxDuration: null,
    controlsVideoMode: !FORCE_IMAGE_TO_VIDEO_ONLY,
    forceImageToVideoOnly: FORCE_IMAGE_TO_VIDEO_ONLY,
    firstClipVideoMode: 'singleImage',
    laterSingleImageDefault: FORCE_IMAGE_TO_VIDEO_ONLY,
    dynamicLaterSingleImage: !FORCE_IMAGE_TO_VIDEO_ONLY,
    lockPromptContinuityToOpeningFrame: true,
    scenePlanSystemPrompt: '',
    cameraScenePlanSystemPrompt: '',
    visionPrompt: '',
    visionProviders: [],
  },
  models: {
    chatModel: CHAT_MODEL,
    imageSeed: 0,
    videoSeed: 0,
    visionEnabled: true,
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
    imagePath: '',
    fallbackImagePath: '',
    outputDir: path.resolve(__dirname, '../../../tests/GENERATIONS/camera-shot'),
    width: 1024,
    height: 768,
    quality: 100,
    warmupSeconds: 1,
    device: false,
  },
  render: {
    folderName: 'freshweb-middle-cost-4-3-test',
    scriptName: './adapter/shorty-book/index.js',
    pollingTimeMs: parseOptionalPositiveNumber(
      process.env.POLLING_TIME_MS
      ?? process.env.FRESHWEB_MIDDLE_POLLING_TIME_MS
    ),
    fluxVariant: 'schnell',
    image: {
      width: 640,
      height: 480,
      numInferenceSteps: 16,
      guidanceScale: 3,
      negativePrompt: 'blurry, low detail, warped anatomy, broken perspective',
    },
    video: {
      aspectRatio: '4:3',
      first: {
        width: 640,
        height: 480,
        steps: 24,
        guidanceScale: 5,
        fps: 10,
        numFrames: 41,
        customMaxArea: 640 * 480,
        randomizeSeed: true,
      },
      single: {
        width: 640,
        height: 480,
        fps: Number(process.env.FRESHWEB_MIDDLE_SINGLE_FPS) || (FORCE_IMAGE_TO_VIDEO_ONLY ? 10 : 8),
        samplingSteps: Number(process.env.FRESHWEB_MIDDLE_VIDEO_SAMPLING_STEPS) || (FORCE_IMAGE_TO_VIDEO_ONLY ? 18 : 24),
        guideScale: Number(process.env.FRESHWEB_MIDDLE_VIDEO_GUIDE_SCALE) || (FORCE_IMAGE_TO_VIDEO_ONLY ? 4 : 5),
        shift: Number(process.env.FRESHWEB_MIDDLE_VIDEO_SHIFT) || (FORCE_IMAGE_TO_VIDEO_ONLY ? 5 : 4),
      },
    },
    mirelo: {
      steps: 10,
      creativityCoef: 2.8,
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

import('../../../semantic-stream.js')
  .then((module) => module.default([adapterConfig]))
  .catch((err) => {
    console.error('Error in MIX-again-freshweb.middle-cost-4-3.js:', err);
    process.exit(1);
  });
