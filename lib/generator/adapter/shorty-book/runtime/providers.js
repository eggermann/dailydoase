import {
  applyWebcamScenePlanVideoModeDefaults,
  createWebcamFirstLastPrompt,
  createWebcamImagePromptHandler,
  createWebcamSceneGenerator,
  createWebcamSingleImagePrompt,
} from '../webcam-defaults.js';
import { createMediaProviders } from './media-providers.js';
import { createCameraInputController } from './camera-input.js';
import { createCameraSession } from './camera-session.js';

export const createRuntimeProviders = ({
  config,
  openai,
  fallbackOpenai,
  localMistralModel,
  scenePlanSystemPrompt,
  scenePlanTemperature,
  scenePlanTopP,
  useWebcamPersonaReference,
  webcamPersonaReferenceModel,
  webcamPersonaReferenceProvider,
  videoMaxRetriesOnFailure,
  videoRetryDelayMs,
  firstLastRunwareFallbacks,
  singleRunwareFallbacks,
  firstLastFalFallbacks,
  singleFalFallbacks,
  directExplicitFalSingleModel,
  directExplicitRunwareSingleModel,
  enablePaidFalFallbacks,
  getFrameVision,
  getPromptContinuityVision,
  setActiveSceneDuration,
  nextSceneDuration,
  currentSceneDuration,
  currentSingleImageDuration,
  cameraOutputDir,
  captureWebcamImage,
  extractVisionStoryContext,
  getLatestVisionResult,
  selfomatSession,
  visionPrompt,
  cameraSettings,
} = {}) => {
  const sceneGenerator = createWebcamSceneGenerator({
    openai,
    fallbackOpenai,
    model: config.models.chatModel,
    fallbackModel: localMistralModel,
    systemPrompt: scenePlanSystemPrompt,
    temperature: scenePlanTemperature,
    top_p: scenePlanTopP,
  });

  const resolveLaterClipSingleImageMode = ({ isLast } = {}) => {
    if (config.story.forceImageToVideoOnly) return true;
    if (!config.story.dynamicLaterSingleImage) return config.story.laterSingleImageDefault;
    return !Boolean(isLast);
  };
  const resolveConfiguredVideoMode = ({ index, total, isFirst, isLast }) => {
    if (config.story.forceImageToVideoOnly) return 'singleImage';
    const useSingleImage = isFirst
      ? config.story.firstClipVideoMode === 'singleImage'
      : resolveLaterClipSingleImageMode({ index, total, isFirst, isLast });
    return useSingleImage ? 'singleImage' : 'firstLast';
  };
  const applySceneLoopDefaultsToPlan = (scenePlan = []) => applyWebcamScenePlanVideoModeDefaults(scenePlan, {
    resolveConfiguredVideoMode,
    scenePlanControlsVideoMode: config.story.controlsVideoMode,
    firstClipVideoMode: config.story.firstClipVideoMode,
  });

  const media = createMediaProviders({
    config,
    dependencies: {
      useWebcamPersonaReference,
      webcamPersonaReferenceModel,
      webcamPersonaReferenceProvider,
      videoMaxRetriesOnFailure,
      videoRetryDelayMs,
      firstLastRunwareFallbacks,
      singleRunwareFallbacks,
      firstLastFalFallbacks,
      singleFalFallbacks,
      directExplicitFalSingleModel,
      directExplicitRunwareSingleModel,
      enablePaidFalFallbacks,
      createImagePrompt: createWebcamImagePromptHandler,
      createFirstLastPrompt: createWebcamFirstLastPrompt,
      createSingleImagePrompt: createWebcamSingleImagePrompt,
      getFrameVision,
      getContinuityFrameVision: getPromptContinuityVision,
      setActiveSceneDuration,
      nextSceneDuration,
      currentSceneDuration,
      currentSingleImageDuration,
    },
  });

  const cameraInput = createCameraInputController({
    camera: config.camera,
    sceneContextImage: config.sceneContextImage,
    cameraOutputDir,
    captureWebcamImage,
  });
  const cameraSession = createCameraSession({
    cameraInput,
    config,
    extractVisionStoryContext,
    getFrameVision,
    getLatestVisionResult,
    selfomatSession,
    visionPrompt,
    settings: cameraSettings,
  });

  return {
    sceneGenerator,
    resolveLaterClipSingleImageMode,
    applySceneLoopDefaultsToPlan,
    ...media,
    resolveSceneContextImages: cameraInput.resolveSceneContextImages,
    ...cameraSession,
  };
};

export default createRuntimeProviders;
