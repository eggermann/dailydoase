import dotenv from 'dotenv';
import OpenAI from 'openai';
import path from 'node:path';
import { Taktmuster } from 'taktmuster';
import { fileURLToPath } from 'node:url';

import {
  resolveSceneCountFromConfig,
  resolveSceneLengthsInput,
} from './helpers/scene-generator.js';
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
  sanitizeWebcamCameraScenePlan,
} from './shorty-book/webcam-defaults.js';
import promptCreator from '../../prompt-creator.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
    count: 6,
    lengths: [3, 3, 3, 3, 3, 3],
    useTaktmusterLengths: false,
    taktmusterTakt: 4,
    taktmusterType: 'balanced',
    singleImageMaxDuration: 4,
    controlsVideoMode: false,
    firstClipVideoMode: 'singleImage',
    laterSingleImageDefault: true,
    dynamicLaterSingleImage: true,
    scenePlanSystemPrompt: '',
    cameraScenePlanSystemPrompt: '',
    visionPrompt: '',
    visionProviders: [],
  },
  models: {
    chatModel: 'gpt-4o-mini',
    imageSeed: 0,
    videoSeed: 0,
    visionEnabled: true,
    useSelfHostedFirstLast: true,
    useSelfHostedSingle: true,
    wanFirstLastSpace: 'cakegreen/Wan-2-2-first-last-frame',
    wanSingleSpace: 'Wan-AI/Wan-2.2-5B',
    wanFirstLastSelfHostedSpace: 'eggman-poff/wan-flf2v',
    wanSingleSelfHostedSpace: 'eggman-poff/wan-s',
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
    width: 1280,
    height: 960,
    quality: 100,
    warmupSeconds: 1,
    device: false,
  },
  render: {
    folderName: 'freshweb-middle-cost-4-3-test',
    scriptName: './adapter/shorty-book/index.js',
    fluxVariant: 'schnell',
    image: {
      width: 512,
      height: 384,
      numInferenceSteps: 8,
      guidanceScale: 2.5,
      negativePrompt: 'blurry, low detail, warped anatomy, broken perspective',
    },
    video: {
      steps: 6,
      aspectRatio: '4:3',
      single: {
        width: 640,
        height: 480,
        samplingSteps: 18,
        guideScale: 4,
        shift: 5,
      },
    },
    mirelo: {
      steps: 8,
      creativityCoef: 2.5,
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

const createTaktmusterLengthSource = () => {
  const taktmuster = new Taktmuster();
  taktmuster.setTakt(CONFIG.story.taktmusterTakt);
  taktmuster.setType(CONFIG.story.taktmusterType);
  return () => taktmuster.getNext();
};

const resolveSceneCount = () => resolveSceneCountFromConfig({
  sceneLengths: sceneLengthSource,
  sceneCount: CONFIG.story.count,
  defaultSceneCount: CONFIG.story.count,
});

const refreshResolvedSceneLengths = async (sceneCount) => {
  const nextSource = CONFIG.story.useTaktmusterLengths
    ? createTaktmusterLengthSource()
    : CONFIG.story.lengths;

  sceneLengthSource = nextSource;
  resolvedSceneLengths = await resolveSceneLengthsInput(nextSource, sceneCount, 3);
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

const getFrameVision = createWebcamFrameVision({
  enabled: CONFIG.models.visionEnabled,
  prompt: VISION_PROMPT,
  providers: VISION_PROVIDERS,
  logPrefix: 'freshweb-middle-cost',
  onResult: createWebcamVisionStoreHandler({ prompt: VISION_PROMPT }),
});

const sceneGenerator = createWebcamSceneGenerator({
  openai,
  model: CONFIG.models.chatModel,
  systemPrompt: SCENE_PLAN_SYSTEM_PROMPT,
  temperature: 0.45,
  top_p: 0.9,
});

const resolveLaterClipSingleImageMode = ({ isLast } = {}) => {
  if (!CONFIG.story.dynamicLaterSingleImage) {
    return CONFIG.story.laterSingleImageDefault;
  }
  return !Boolean(isLast);
};

const resolveConfiguredVideoMode = ({ index, total, isFirst, isLast }) => {
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
      setActiveSceneDuration,
      nextSceneDuration,
    }),
  },
  model: {
    audioOnly: true,
    steps: CONFIG.render.video.steps,
    duration_seconds: currentSceneDuration,
    seed: CONFIG.models.videoSeed,
    randomize_seed: false,
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
      setActiveSceneDuration,
      nextSceneDuration,
    }),
  },
  model: {
    audioOnly: true,
    steps: CONFIG.render.video.steps,
    duration_seconds: currentSingleImageDuration,
    height: CONFIG.render.video.single.height,
    width: CONFIG.render.video.single.width,
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
    ? path.resolve(CONFIG.camera.imagePath)
    : captureCameraShot()
);

const buildSceneLoopConfig = () => ({
  enabled: true,
  sceneCount: async () => resolveSceneCount(),
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
  console.log('[freshweb-middle-cost-4-3] sceneLengths:', sceneLengths.join(','));
  console.log('[freshweb-middle-cost-4-3] scenes:');
  for (const scene of scenePlan) {
    console.log(
      `  ${scene.index}. ${scene.title} | ${scene.videoMode} | ${scene.frameSource} | ${scene.durationSeconds}s`
    );
  }
};

const promptFunktion = async (streams, config) => {
  const openingCameraShot = await resolveOpeningCameraShot();
  const sceneCount = resolveSceneCount();
  const activeSceneLengths = await refreshResolvedSceneLengths(sceneCount);
  const sourceCues = await buildSourceCues(streams, sceneCount);

  const rawScenePlan = await sceneGenerator({
    sceneCount,
    sceneLengths: activeSceneLengths,
    sourceCues,
    visualDirection: CONFIG.story.visualDirection,
    configMode: CONFIG.story.mode,
  });

  if (CONFIG.story.mode === 'camera') {
    const rawCameraPlanIssues = describeWebcamCameraScenePlanIssues(rawScenePlan);
    if (rawCameraPlanIssues.length > 0) {
      console.warn('[freshweb-middle-cost-4-3] raw camera scene-plan issues:', rawCameraPlanIssues);
    }
  }

  const runtimeScenePlan = CONFIG.story.mode === 'camera'
    ? sanitizeWebcamCameraScenePlan(rawScenePlan)
    : rawScenePlan;
  const scenePlan = applySceneLoopDefaultsToPlan(runtimeScenePlan);

  config.sceneLoop = config.sceneLoop || {};
  config.sceneLoop.scenePlan = scenePlan;
  config.sceneLoop.openingImage = {
    ...(config.sceneLoop.openingImage || {}),
    imagePath: openingCameraShot,
    promptSource: '',
    sourceType: 'cameraShot',
  };

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
    pollingTime: null,
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
