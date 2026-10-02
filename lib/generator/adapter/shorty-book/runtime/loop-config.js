export const createDriftCorrectionConfig = ({
  config,
  driftStepsInput,
  driftGuidanceInput,
  resolveDriftCorrectionProfile,
  resolveDriftCorrectionModelConfig,
  isReferenceImageActorMode,
  resolveRunningIterationCameraShot,
} = {}) => {
  const driftProfile = resolveDriftCorrectionProfile({
    enabled: config.render.driftCorrection.enabled,
    level: config.render.driftCorrection.level,
    configMode: config.story.mode,
  });
  const driftModel = resolveDriftCorrectionModelConfig({
    model: config.render.driftCorrection.model,
    level: driftProfile.level,
    hasExplicitSteps: driftStepsInput !== '',
    hasExplicitGuidance: driftGuidanceInput !== '',
  });
  const useCameraReference = driftProfile.enabled
    && config.render.driftCorrection.useCameraReference;

  return {
    ...config.render.driftCorrection,
    ...driftProfile,
    model: driftModel,
    cameraMode: isReferenceImageActorMode(config.story.mode),
    ...(useCameraReference
      ? {
        referenceImage: {
          captureFn: async () => {
            const result = await resolveRunningIterationCameraShot();
            return result.imagePath;
          },
          promptSource: '',
        },
      }
      : {}),
  };
};

export const createSceneLoopConfig = ({
  config,
  imageOnly,
  scenesImageOnly = false,
  dryRun,
  resolveSceneCount,
  resolveLaterClipSingleImageMode,
  isReferenceImageActorMode,
  resolveRunningIterationCameraShot,
  useWebcamPersonaReference,
  webcamPersonaReferenceModel,
  webcamPersonaReferenceProvider,
  asyncPersonaReferenceUpdates,
  asyncPersonaReferenceInterval,
  asyncPersonaReferenceMinBeatSeconds,
  captureBestPersonaReferenceShot,
} = {}) => ({
  enabled: true,
  imageOnly,
  scenesImageOnly,
  dryRun,
  sceneCount: async () => resolveSceneCount(),
  chainFromPreviousLoopLastFrame: config.story.chainFromPreviousLoopLastFrame,
  restartFromPreviousMovieLastFrame: config.story.restartFromPreviousMovieLastFrame,
  mireloMode: config.story.mireloMode,
  audioAdapter: config.story.audioAdapter,
  concatTrimLeadingSeconds: config.story.concatTrimLeadingSeconds,
  independentSceneStarts: false,
  firstClipUseSingleImage: config.story.firstClipVideoMode === 'singleImage',
  subsequentClipsUseSingleImage: resolveLaterClipSingleImageMode,
  captureLastFrame: true,
  ...(isReferenceImageActorMode(config.story.mode)
    ? {
      liveStartImage: {
        captureFn: async () => {
          const result = await resolveRunningIterationCameraShot();
          return result.imagePath;
        },
        promptSource: '',
      },
      ...(config.story.realityIntrusionMode === 'semantic'
        ? {
          realityIntrusionImage: {
            captureFn: async () => {
              const result = await resolveRunningIterationCameraShot();
              return result.imagePath;
            },
            promptSource: '',
          },
        }
        : {}),
    }
    : {}),
  openingImage: {
    promptSource: config.camera.imagePath ? '' : config.story.openingPromptSource,
    sourceType: 'cameraShot',
    enabled: config.render.openingStart.enabled,
    // Selfie drift correction must not lock the room by default.
    // Enable explicitly for modes that require location continuity.
    useLocationContinuityForDriftCorrection: config.story.useLocationContinuityForDriftCorrection === true,
    usePersonaReferenceForFreshImages: useWebcamPersonaReference,
    personaReferenceModel: useWebcamPersonaReference
      ? {
        model: webcamPersonaReferenceModel,
        hfProvider: webcamPersonaReferenceProvider,
        width: config.render.image.width,
        height: config.render.image.height,
        num_inference_steps: config.render.image.numInferenceSteps,
        guidance_scale: config.render.image.guidanceScale,
        negative_prompt: config.render.image.negativePrompt,
        seed: config.models.imageSeed,
      }
      : undefined,
    asyncPersonaReference: asyncPersonaReferenceUpdates
      ? {
        enabled: true,
        intervalScenes: asyncPersonaReferenceInterval,
        minBeatMs: asyncPersonaReferenceMinBeatSeconds > 0
          ? asyncPersonaReferenceMinBeatSeconds * 1000
          : 0,
        captureFn: async () => captureBestPersonaReferenceShot(),
      }
      : undefined,
    mode: config.render.openingStart.mode,
    interval: config.render.openingStart.interval,
    model: { ...(config.render.openingStart.model || {}) },
    ...(config.camera.imagePath ? { imagePath: config.camera.imagePath } : {}),
  },
  castContext: {
    enabled: config.render.castContext.enabled,
    timeoutMs: config.render.castContext.timeoutMs,
    model: { ...(config.render.castContext.model || {}) },
  },
});
