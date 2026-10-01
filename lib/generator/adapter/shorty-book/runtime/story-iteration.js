/**
 * Prepare one story iteration before the scene planner runs.
 *
 * Narrative order:
 * input image -> scene rhythm -> semantic cues -> Vision context
 * -> story transport -> opening reference.
 */
export const prepareStoryIteration = async ({
  streams,
  loopConfig,
  storyConfig,
  selfomatSession,
  resolveOpeningCameraShot,
  nextStoryRunIndex,
  resolveSceneCount,
  refreshResolvedSceneLengths,
  resolveSceneContextImages,
  buildSourceCues,
  getFrameVision,
  visionPrompt,
  extractVisionStoryContext,
  summarizeVisionStoryContext,
  storyTransportController,
  adaptSelfomatScenePlan,
  formatStoryTransportForPrompt,
  persistOpeningPersonaReference,
  buildOpeningVisionPayload,
  setOpeningPromptContinuityVision,
} = {}) => {
  const {
    imagePath: openingCameraShot,
    imageSource,
    visionText: capturedVisionText = '',
  } = await resolveOpeningCameraShot();

  const storyRunIndex = nextStoryRunIndex();
  if (selfomatSession) {
    await selfomatSession.publish({
      phase: 'planning',
      iteration: storyRunIndex,
      message: 'Ich seh dich. Deine Geschichte entsteht.',
    });
  }

  const requestedSceneCount = resolveSceneCount();
  const requestedSceneLengths = await refreshResolvedSceneLengths(requestedSceneCount);
  const sceneContextImages = await resolveSceneContextImages({ sceneCount: requestedSceneCount });
  const sourceCues = await buildSourceCues({
    streams,
    sceneCount: requestedSceneCount,
    sourceCueCount: storyConfig.sourceCueCount,
    configMode: storyConfig.mode,
    staticTestMode: storyConfig.staticTestMode,
    staticSourceCues: storyConfig.staticSourceCues,
  });
  loopConfig.semanticStreamLogResponse = sourceCues;

  const openingVisionText = capturedVisionText || await getFrameVision(
    { image: { path: openingCameraShot } },
    { prompt: visionPrompt }
  );
  setOpeningPromptContinuityVision(openingVisionText || '');

  const structuredVisionStoryContext = extractVisionStoryContext(openingVisionText);
  const visionStoryContext = summarizeVisionStoryContext(openingVisionText);
  const storyTransportDraft = storyTransportController.beginIteration({
    iteration: storyRunIndex,
    words: storyConfig.words,
    sourceCues,
    sourceCueCount: storyConfig.sourceCueCount || sourceCues.length,
    visionStoryContext: structuredVisionStoryContext,
    referenceImagePath: openingCameraShot,
  });

  const plannedSelfomatCast = storyConfig.selfomatEnabled
    ? adaptSelfomatScenePlan({
        scenePlan: Array.from({ length: requestedSceneCount }, () => ({})),
        transport: storyTransportDraft,
      })
    : [];
  const storyTransportPrompt = [
    storyConfig.selfomatEnabled
      ? `SELFOMAT: Fixed cast per scene: ${JSON.stringify(plannedSelfomatCast.map((scene) => scene.castSelection))}. Keep the current visitor primary. Use precisely these returning people. Interpret each source cue as a concrete physical interaction in actorsInteraction (or actorAction when alone). Never use semantic matching to change cast. No invented participants.`
      : '',
    formatStoryTransportForPrompt(storyTransportDraft),
  ].filter(Boolean).join(' ');

  const openingPersonaReferencePath = await persistOpeningPersonaReference({
    outputDir: loopConfig.outputDir,
    openingCameraShot,
  });
  const resolvedOpeningPersonaReferencePath = openingPersonaReferencePath || openingCameraShot;
  const openingVision = buildOpeningVisionPayload(openingCameraShot, openingVisionText);

  return {
    openingCameraShot,
    imageSource,
    storyRunIndex,
    requestedSceneCount,
    requestedSceneLengths,
    sceneContextImages,
    sourceCues,
    openingVisionText,
    structuredVisionStoryContext,
    visionStoryContext,
    storyTransportDraft,
    storyTransportPrompt,
    openingPersonaReferencePath,
    resolvedOpeningPersonaReferencePath,
    openingVision,
  };
};

export default prepareStoryIteration;
