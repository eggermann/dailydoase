const isLtxSingleVideoModel = (value = '') => String(value || '')
  .trim()
  .toLowerCase()
  .startsWith('ltx');

const resolveSingleVideoPromptFlavor = ({ configuredFlavor = '', modelType = '' } = {}) => {
  if (configuredFlavor) {
    return configuredFlavor;
  }
  return isLtxSingleVideoModel(modelType) ? 'ltx' : 'default';
};

/**
 * Build media provider contracts after all runtime state exists.
 * Prompt handlers and duration callbacks are injected to keep this module
 * independent from the live loop.
 */
export const createMediaProviders = ({
  config,
  dependencies = {},
} = {}) => {
  const {
    useWebcamPersonaReference,
    webcamPersonaReferenceModel,
    webcamPersonaReferenceProvider,
    videoMaxRetriesOnFailure,
    videoRetryDelayMs,
    firstLastRunwareFallbacks = [],
    singleRunwareFallbacks = [],
    firstLastFalFallbacks = [],
    singleFalFallbacks = [],
    directExplicitFalSingleModel = false,
    directExplicitRunwareSingleModel = false,
    enablePaidFalFallbacks = false,
    createImagePrompt,
    createFirstLastPrompt,
    createSingleImagePrompt,
    getFrameVision,
    getContinuityFrameVision,
    setActiveSceneDuration,
    nextSceneDuration,
    currentSceneDuration,
    currentSingleImageDuration,
  } = dependencies;

  const singleVideoPromptFlavor = resolveSingleVideoPromptFlavor({
    configuredFlavor: config.story.singleVideoPromptFlavor,
    modelType: config.models.singleVideoModelType,
  });

  const image = {
    ...(useWebcamPersonaReference
      ? {
        type: 'imageActorInScene',
        model: {
          model: webcamPersonaReferenceModel,
          hfProvider: webcamPersonaReferenceProvider,
          width: config.render.image.width,
          height: config.render.image.height,
          num_inference_steps: config.render.image.numInferenceSteps,
          guidance_scale: config.render.image.guidanceScale,
          negative_prompt: config.render.image.negativePrompt,
          seed: config.models.imageSeed,
        },
      }
      : {}),
    fluxVariant: config.render.fluxVariant,
    width: config.render.image.width,
    height: config.render.image.height,
    num_inference_steps: config.render.image.numInferenceSteps,
    guidance_scale: config.render.image.guidanceScale,
    negative_prompt: config.render.image.negativePrompt,
    seed: config.models.imageSeed,
    prompts: { create: createImagePrompt },
    staticPrompt: {},
  };

  const retryOptions = videoMaxRetriesOnFailure !== null
    ? { maxRetriesOnFailure: videoMaxRetriesOnFailure }
    : {};

  const video = {
    prompts: {
      create: createFirstLastPrompt({
        configMode: config.story.mode,
        getFrameVision,
        getContinuityFrameVision,
        setActiveSceneDuration,
        nextSceneDuration,
        cameraSourceLabel: config.camera.sourceLabel,
        cameraStyle: config.story.cameraStyle,
      }),
    },
    model: {
      type: config.models.firstLastVideoModelType,
      ...(config.models.firstLastVideoModel ? { model: config.models.firstLastVideoModel } : {}),
      audioOnly: true,
      steps: config.render.video.first.steps,
      duration_seconds: currentSceneDuration,
      width: config.render.video.first.width,
      height: config.render.video.first.height,
      guidance_scale: config.render.video.first.guidanceScale,
      fps: config.render.video.first.fps,
      seed: config.models.videoSeed,
      randomize_seed: config.render.video.first.randomizeSeed,
      custom_max_area: config.render.video.first.customMaxArea,
      space: config.models.wanFirstLastSpace,
      selfHostedHugginfaceModel: config.models.useSelfHostedFirstLast,
      selfHostedHugginfaceSpace: config.models.wanFirstLastSelfHostedSpace,
      aspect_ratio: config.render.video.aspectRatio,
      ...retryOptions,
      retryDelayMs: videoRetryDelayMs,
      fallbacks: [
        ...config.models.wanFirstLastFallbackSpaces.map((space) => ({ type: 'wanFirstLast', space })),
        ...firstLastRunwareFallbacks,
        ...firstLastFalFallbacks,
      ],
    },
    useImagePrompt: false,
  };

  const singleVideoFallbacks = isLtxSingleVideoModel(config.models.singleVideoModelType)
    ? config.models.ltxSingleFallbackSpaces.map((space) => ({ type: 'ltxImageToVideo', space }))
    : (directExplicitFalSingleModel && !enablePaidFalFallbacks) || directExplicitRunwareSingleModel
      ? []
      : [
          ...config.models.wanSingleFallbackSpaces.map((space) => ({ type: 'wanSingleImage', space })),
          ...singleRunwareFallbacks,
          ...singleFalFallbacks,
        ];

  const video2 = {
    prompts: {
      create: createSingleImagePrompt({
        configMode: config.story.mode,
        getFrameVision,
        getContinuityFrameVision,
        setActiveSceneDuration,
        nextSceneDuration,
        promptFlavor: singleVideoPromptFlavor,
        cameraSourceLabel: config.camera.sourceLabel,
        cameraStyle: config.story.cameraStyle,
      }),
    },
    model: {
      type: config.models.singleVideoModelType,
      ...(config.models.singleVideoModel ? { model: config.models.singleVideoModel } : {}),
      audioOnly: true,
      steps: config.render.video.first.steps,
      duration_seconds: currentSingleImageDuration,
      height: config.render.video.single.height,
      width: config.render.video.single.width,
      fps: config.render.video.single.fps,
      sampling_steps: config.render.video.single.samplingSteps,
      guide_scale: config.render.video.single.guideScale,
      shift: config.render.video.single.shift,
      seed: config.models.videoSeed,
      randomize_seed: false,
      space: isLtxSingleVideoModel(config.models.singleVideoModelType)
        ? config.models.ltxSingleSpace
        : config.models.wanSingleSpace,
      selfHostedHugginfaceModel: isLtxSingleVideoModel(config.models.singleVideoModelType)
        ? false
        : config.models.useSelfHostedSingle,
      selfHostedHugginfaceSpace: isLtxSingleVideoModel(config.models.singleVideoModelType)
        ? undefined
        : config.models.wanSingleSelfHostedSpace,
      aspect_ratio: config.render.video.aspectRatio,
      ...retryOptions,
      retryDelayMs: videoRetryDelayMs,
      fallbacks: singleVideoFallbacks,
    },
    useImagePrompt: false,
  };

  const mireloAI = {
    duration: async () => currentSceneDuration(),
    num_samples: 1,
    steps: config.render.mirelo.steps,
    seed: -1,
    creativity_coef: config.render.mirelo.creativityCoef,
    model_version: config.models.mireloModelVersion,
    maxRetries5xx: 0,
    retryDelayMs: 250,
    auto_upload_if_local: true,
  };

  return {
    image,
    video,
    video2,
    mireloAI,
    singleVideoPromptFlavor,
  };
};

export default createMediaProviders;
