export const createSceneLoopPrompt = ({
  CONFIG,
  SELFOMAT_ENABLED,
  SELFOMAT_IMAGE_ONLY,
  selfomatSession,
  resolveOpeningCameraShot,
  nextStoryRunIndex,
  prepareStoryIteration,
  resolveSceneCount,
  refreshResolvedSceneLengths,
  resolveSceneContextImages,
  buildSourceCues,
  getFrameVision,
  VISION_PROMPT,
  extractVisionStoryContext,
  summarizeVisionStoryContext,
  storyTransportController,
  adaptSelfomatScenePlan,
  formatStoryTransportForPrompt,
  persistOpeningPersonaReference,
  buildOpeningVisionPayload,
  setOpeningPromptContinuityVision,
  generateScenePlanWithFallback,
  sceneGenerator,
  singleVideoPromptFlavor,
  applySceneLoopDefaultsToPlan,
  attachCastReferencesToScenePlan,
  isReferenceImageActorMode,
  describeWebcamCameraScenePlanIssues,
  sanitizeWebcamCameraScenePlan,
  applyRequestedSceneDurations,
  shouldUseOpeningFluxContextImage,
  buildOpeningFluxContextPrompt,
  createSelfomatAnnouncement,
  openai,
  CHAT_MODEL,
  scenePlanSystemPrompt,
  resetScenePlannerTrace = () => {},
  getScenePlannerTrace = () => [],
  saveSelfomatRunLog,
  saveStoryTransportArtifact,
  saveCameraSnapshotArtifact,
  logSceneLoopSummary,
  USE_WEBCAM_PERSONA_REFERENCE,
  WEBCAM_PERSONA_REFERENCE_MODEL,
  WEBCAM_PERSONA_REFERENCE_PROVIDER,
} = {}) => {
return async (streams, config) => {
  const iteration = await prepareStoryIteration({
    streams,
    loopConfig: config,
    storyConfig: { ...CONFIG.story, selfomatEnabled: SELFOMAT_ENABLED },
    selfomatSession,
    resolveOpeningCameraShot,
    nextStoryRunIndex,
    resolveSceneCount,
    refreshResolvedSceneLengths,
    resolveSceneContextImages,
    buildSourceCues,
    getFrameVision,
    visionPrompt: VISION_PROMPT,
    extractVisionStoryContext,
    summarizeVisionStoryContext,
    storyTransportController,
    adaptSelfomatScenePlan,
    formatStoryTransportForPrompt,
    persistOpeningPersonaReference,
    buildOpeningVisionPayload,
    setOpeningPromptContinuityVision,
  });

  const {
    openingCameraShot,
    imageSource,
    storyRunIndex: currentStoryRunIndex,
    requestedSceneCount,
    requestedSceneLengths,
    sceneContextImages,
    sourceCues,
    sourceCueCount,
    sourceCuePattern,
    sourceCuePatternTrace,
    sourceCueBatches,
    sourceCueStreamTrace,
    sourceCueStreamTraceBatches,
    sceneAspectCues,
    sceneAspectTrace,
    sourceCuePatternSource,
    openingVisionText,
    structuredVisionStoryContext,
    visionStoryContext,
    storyTransportDraft,
    storyTransportPrompt,
    resolvedOpeningPersonaReferencePath,
    openingVision,
  } = iteration;

  resetScenePlannerTrace();

  const {
    scenePlan: generatedScenePlan,
    effectiveSceneLengths,
  } = await generateScenePlanWithFallback({
    generateScenes: sceneGenerator,
    sceneCount: requestedSceneCount,
    sceneLengths: requestedSceneLengths,
    sourceCues,
    sourceCueCount,
    sourceCuePattern,
    sourceCueBatches,
    sourceCueStreamTraceBatches,
    sceneAspectCues,
    sceneAspectTrace,
    realityRatio: CONFIG.story.realityRatio,
    visualDirection: CONFIG.story.visualDirection,
    visionStoryContext,
    storyTransport: storyTransportPrompt,
    configMode: CONFIG.story.mode,
    sceneFlavor: singleVideoPromptFlavor,
    forceImageToVideoOnly: CONFIG.story.forceImageToVideoOnly,
    realityIntrusionMode: CONFIG.story.realityIntrusionMode,
    onFallback: ({ requestedSceneCount: requestedCount, receivedSceneCount, nextSceneCount }) => {
      console.warn(
        `[freshweb-middle-cost-4-3] scene-plan fallback: requested ${requestedCount}, received ${receivedSceneCount}, retrying with ${nextSceneCount}`
      );
    },
  });

  const rawScenePlan = attachCastReferencesToScenePlan({
    scenePlan: generatedScenePlan,
    cast: storyTransportDraft.cast,
  });

  if (isReferenceImageActorMode(CONFIG.story.mode)) {
    const rawCameraPlanIssues = describeWebcamCameraScenePlanIssues(rawScenePlan);
    if (rawCameraPlanIssues.length > 0) {
      console.warn(
        `[freshweb-middle-cost-4-3] raw reference-image-actor scene-plan issues${CONFIG.story.forceImageToVideoOnly ? ' (before image-to-video-only override)' : ''}:`,
        rawCameraPlanIssues
      );
    }
  }

  const validatedScenePlan = rawScenePlan;
  const runtimeScenePlan = applySceneLoopDefaultsToPlan(validatedScenePlan);
  const sanitizedScenePlan = isReferenceImageActorMode(CONFIG.story.mode)
    ? sanitizeWebcamCameraScenePlan(runtimeScenePlan, {
        visionStoryContext: openingVisionText,
        sourceCues,
        sceneFlavor: singleVideoPromptFlavor,
        trippyReanchorInterval: CONFIG.story.trippyReanchorInterval,
        cameraReanchorInterval: CONFIG.story.cameraReanchorInterval,
      })
    : runtimeScenePlan;
  const scenePlan = SELFOMAT_ENABLED
    ? attachCastReferencesToScenePlan({
        scenePlan: adaptSelfomatScenePlan({
          scenePlan: sanitizedScenePlan,
          transport: storyTransportDraft,
        }),
        cast: storyTransportDraft.cast,
      })
    : sanitizedScenePlan;
  const requestedDurationScenePlan = applyRequestedSceneDurations(scenePlan);
  const openingFluxContextActive = shouldUseOpeningFluxContextImage({
    enabled: CONFIG.render.openingStart.enabled,
    mode: CONFIG.render.openingStart.mode,
    interval: CONFIG.render.openingStart.interval,
    iteration: currentStoryRunIndex,
  });
  const openingFluxContextPrompt = openingFluxContextActive
    ? buildOpeningFluxContextPrompt({
        scenePlanEntry: requestedDurationScenePlan[0] || {},
        sourceCues,
        openingVisionText,
        openingPromptSource: CONFIG.story.openingPromptSource,
        promptFlavor: singleVideoPromptFlavor,
        cameraSourceLabel: CONFIG.camera.sourceLabel,
      })
    : '';
  const storyTransport = storyTransportController.completeIteration({
    draft: storyTransportDraft,
    scenePlan: requestedDurationScenePlan,
  });
  if (selfomatSession) {
    const message = await createSelfomatAnnouncement({ client: openai, model: CHAT_MODEL, scenePlan: requestedDurationScenePlan });
    config.sceneLoop = config.sceneLoop || {};
    config.sceneLoop.renderAnnouncement = message;
    await selfomatSession.publish({ phase: 'rendering', message });
    const promptLogContent = {
      iteration: currentStoryRunIndex,
      sourceImage: openingCameraShot,
      imageOnly: SELFOMAT_IMAGE_ONLY,
      starterPhotoPrompt: openingFluxContextPrompt,
      semanticTopics: storyTransportDraft.topics,
      semanticCues: sourceCues,
      sourceCueCount,
      sourceCuePattern,
      sourceCuePatternTrace,
      sourceCueBatches,
      sourceCueStreamTrace,
      sourceCueStreamTraceBatches,
      sceneAspectCues,
      sceneAspectTrace,
      sourceCuePatternSource,
      sceneCount: requestedDurationScenePlan.length,
      sceneLengths: requestedDurationScenePlan.map((scene) => scene.durationSeconds),
      realityRatio: CONFIG.story.realityRatio,
      currentWord: storyTransportDraft.topic,
      visionStoryContext: structuredVisionStoryContext,
      visionPrompt: VISION_PROMPT,
      visionResult: openingVisionText,
      scenePlanSystemPrompt,
      scenePlannerTrace: getScenePlannerTrace(),
      storyTransportPrompt,
      announcement: message,
      scenePlan: requestedDurationScenePlan,
      completedTransport: storyTransport,
      audioAdapter: config.sceneLoop.audioAdapter || CONFIG.story.audioAdapter || 'mirelo',
    };
    config.sceneLoop.promptLog = {
      outputDir: config.outputDir,
      content: promptLogContent,
    };
    await saveSelfomatRunLog({
      outputDir: config.outputDir,
      ...promptLogContent,
      renderedSceneAssets: config.sceneLoop.renderedSceneAssets || [],
    });
  }
  const storyTransportArtifactPath = await saveStoryTransportArtifact({
    outputDir: config.outputDir,
    transport: storyTransport,
  });
  config.sceneLoop = config.sceneLoop || {};
  config.sceneLoop.scenePlan = requestedDurationScenePlan;
  config.sceneLoop.storyTransport = storyTransport;
  config.sceneLoop.onRealityIntrusion = async ({
    referenceImagePath,
    sceneContext,
    scenePlanEntry,
  } = {}) => {
    const completedSceneCount = Math.max(0, Number(sceneContext?.index) || 0);
    const remainingSceneCount = requestedDurationScenePlan.length - completedSceneCount;
    if (!referenceImagePath || remainingSceneCount <= 0) {
      return { scenePlan: [] };
    }

    const liveVisionText = await getFrameVision(
      { image: { path: referenceImagePath } },
      { prompt: VISION_PROMPT }
    );
    const liveVisionContext = extractVisionStoryContext(liveVisionText);
    const remembered = storyTransportController.rememberRealityIntrusion({
      visionStoryContext: liveVisionContext,
      referenceImagePath,
      iteration: currentStoryRunIndex,
      sceneIndex: completedSceneCount,
    });
    const liveTransport = {
      ...storyTransport,
      people: remembered.people,
      cast: {
        ...(storyTransport.cast || {}),
        actorReferences: remembered.actorReferences,
        archivedActorReferences: remembered.archivedActorReferences,
      },
    };
    const completedStory = config.sceneLoop.scenePlan
      .slice(0, completedSceneCount)
      .map((scene) => scene.storyBeat || scene.beat || scene.title)
      .filter(Boolean)
      .join(' -> ');
    const tailReplanContext = [
      formatStoryTransportForPrompt(liveTransport),
      completedStory ? `Completed scenes are fixed and already rendered: ${completedStory}.` : '',
      `A live-camera reality intrusion followed scene ${completedSceneCount}: ${scenePlanEntry?.storyBeat || scenePlanEntry?.beat || scenePlanEntry?.title || ''}.`,
      'Plan the remaining scenes so the new live cast may enter immediately, return as an echo, or remain a latent witness. Do not rewrite completed scenes.',
    ].filter(Boolean).join(' ');

    const { scenePlan: replannedFullScenePlan } = await generateScenePlanWithFallback({
      generateScenes: sceneGenerator,
      sceneCount: requestedDurationScenePlan.length,
      sceneLengths: requestedDurationScenePlan.map((scene) => scene.requestedDurationSeconds || scene.durationSeconds),
      sourceCues,
      visualDirection: `${CONFIG.story.visualDirection} Tail replan after a deliberate live-camera reality intrusion.`,
      visionStoryContext: summarizeVisionStoryContext(liveVisionText),
      storyTransport: tailReplanContext,
      configMode: CONFIG.story.mode,
      sceneFlavor: singleVideoPromptFlavor,
      forceImageToVideoOnly: CONFIG.story.forceImageToVideoOnly,
      realityIntrusionMode: CONFIG.story.realityIntrusionMode,
    });
    const replannedRuntimeScenePlan = applySceneLoopDefaultsToPlan(replannedFullScenePlan);
    const replannedSanitizedScenePlan = isReferenceImageActorMode(CONFIG.story.mode)
      ? sanitizeWebcamCameraScenePlan(replannedRuntimeScenePlan, {
          visionStoryContext: liveVisionText,
          sourceCues,
          sceneFlavor: singleVideoPromptFlavor,
          trippyReanchorInterval: CONFIG.story.trippyReanchorInterval,
          cameraReanchorInterval: CONFIG.story.cameraReanchorInterval,
        })
      : replannedRuntimeScenePlan;
    const replannedTailPlan = SELFOMAT_ENABLED
      ? adaptSelfomatScenePlan({
          scenePlan: applyRequestedSceneDurations(replannedSanitizedScenePlan).slice(completedSceneCount),
          transport: liveTransport,
        })
      : applyRequestedSceneDurations(replannedSanitizedScenePlan).slice(completedSceneCount);
    const replannedTail = attachCastReferencesToScenePlan({
      scenePlan: replannedTailPlan,
      cast: liveTransport.cast,
    });
    config.sceneLoop.scenePlan.splice(completedSceneCount, remainingSceneCount, ...replannedTail);
    config.sceneLoop.storyTransport = liveTransport;
    console.log(
      `[freshweb-middle-cost-4-3] reality intrusion tail replan: ${remembered.people.actors.length} new actor(s), ${replannedTail.length} remaining scene(s)`
    );
    return { scenePlan: replannedTail, cast: remembered.actorReferences };
  };
  config.sceneLoop.openingImage = {
    ...(config.sceneLoop.openingImage || {}),
    imagePath: resolvedOpeningPersonaReferencePath,
    referenceImagePath: resolvedOpeningPersonaReferencePath,
    personaReferencePath: resolvedOpeningPersonaReferencePath,
    sceneContextReferencePath: sceneContextImages[0]?.path || '',
    sceneContextReferenceUrl: sceneContextImages[0]?.url || '',
    usePersonaReferenceForFreshImages: USE_WEBCAM_PERSONA_REFERENCE,
    personaReferenceModel: USE_WEBCAM_PERSONA_REFERENCE
      ? {
        model: WEBCAM_PERSONA_REFERENCE_MODEL,
        hfProvider: WEBCAM_PERSONA_REFERENCE_PROVIDER,
        width: CONFIG.render.image.width,
        height: CONFIG.render.image.height,
        num_inference_steps: CONFIG.render.image.numInferenceSteps,
        guidance_scale: CONFIG.render.image.guidanceScale,
        negative_prompt: CONFIG.render.image.negativePrompt,
        seed: CONFIG.models.imageSeed,
      }
      : undefined,
    promptSource: (CONFIG.camera.imagePath || CONFIG.camera.imageUrls.length > 0)
      ? ''
      : CONFIG.story.openingPromptSource,
    generatedPrompt: openingFluxContextPrompt,
    sourceType: openingFluxContextActive
      ? 'fluxContext'
      : (CONFIG.camera.imageUrls.length > 0 ? 'cameraImage' : 'cameraShot'),
    active: openingFluxContextActive,
    storyRunIndex: currentStoryRunIndex,
    continuityVisionText: openingVisionText,
    continuityPersonAnchors: structuredVisionStoryContext?.continuityPersonAnchors || '',
    continuityLocationAnchors: structuredVisionStoryContext?.continuityLocationAnchors || '',
    // Room continuity is opt-in. Selfie mode keeps person identity, not room identity.
    useLocationContinuityForDriftCorrection: config.sceneLoop?.openingImage?.useLocationContinuityForDriftCorrection === true,
    // Compatibility for older generator adapters.
    continuityAnchor: structuredVisionStoryContext?.continuityPersonAnchors || '',
  };
  config.sceneLoop.sceneContextImage = {
    enabled: CONFIG.sceneContextImage.enabled && sceneContextImages.length > 0,
    mode: 'fluxContext',
    images: sceneContextImages,
    promptSource: CONFIG.story.openingPromptSource,
    model: {
      ...(CONFIG.render.openingStart.model || {}),
    },
  };

  await saveCameraSnapshotArtifact({
    outputDir: config.outputDir,
    openingCameraShot: resolvedOpeningPersonaReferencePath,
    openingPersonaReferencePath: resolvedOpeningPersonaReferencePath,
    imageSource,
    sourceCues,
    sceneCount: requestedSceneCount,
    sceneLengths: effectiveSceneLengths,
    visionStoryContext,
    rawScenePlan,
    validatedScenePlan,
    runtimeScenePlan,
    scenePlan: requestedDurationScenePlan,
    openingVision,
    storyRunIndex: currentStoryRunIndex,
    storyTransport,
    storyTransportArtifactPath,
    openingFluxContextActive,
    openingFluxContextPrompt,
  });

  logSceneLoopSummary({
    config: CONFIG,
    openingCameraShot: resolvedOpeningPersonaReferencePath,
    openingPersonaReferencePath: resolvedOpeningPersonaReferencePath,
    openingFluxContextActive,
    openingFluxContextPrompt,
    storyRunIndex: currentStoryRunIndex,
    sourceCues,
    scenePlan: requestedDurationScenePlan,
    sceneLengths: effectiveSceneLengths,
  });
  console.log('[freshweb-middle-cost-4-3] storyTopic:', storyTransport.topic || 'n/a');
  console.log('[freshweb-middle-cost-4-3] visiblePeople:', storyTransport.people.count);
  console.log('[freshweb-middle-cost-4-3] storyTransport:', storyTransportArtifactPath || 'not saved');

  return streams;
};


};

export default createSceneLoopPrompt;
