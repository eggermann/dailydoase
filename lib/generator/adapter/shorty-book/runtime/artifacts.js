import { saveWebcamScenePlanArtifact } from '../webcam-defaults.js';

export const createCameraSnapshotArtifactSaver = ({
  config,
  openAiVisionModel,
  visionPrompt,
  visionProviders,
  scenePlanSystemPrompt,
} = {}) => {
const saveCameraSnapshotArtifact = async ({
  outputDir,
  openingCameraShot,
  openingPersonaReferencePath,
  imageSource,
  sourceCues,
  sceneCount,
  sceneLengths,
  visionStoryContext,
  rawScenePlan,
  validatedScenePlan,
  runtimeScenePlan,
  scenePlan,
  openingVision,
  storyRunIndex,
  storyTransport,
  storyTransportArtifactPath = '',
  openingFluxContextActive = false,
  openingFluxContextPrompt = '',
} = {}) => {
  const stagePlans = [
    ['validation', rawScenePlan, validatedScenePlan],
    ['runtime', validatedScenePlan, runtimeScenePlan],
    ['applied', runtimeScenePlan, scenePlan],
  ];
  const scenePlanTransforms = stagePlans.flatMap(([stage, beforePlan = [], afterPlan = []]) => (
    afterPlan.flatMap((afterScene, index) => {
      const beforeScene = beforePlan[index] || {};
      const fields = new Set([...Object.keys(beforeScene), ...Object.keys(afterScene)]);
      const changes = {};
      fields.forEach((field) => {
        if (JSON.stringify(beforeScene[field]) !== JSON.stringify(afterScene[field])) {
          changes[field] = [beforeScene[field] ?? null, afterScene[field] ?? null];
        }
      });
      return Object.keys(changes).length > 0
        ? [{ scene: index + 1, stage, changes }]
        : [];
    })
  ));

  return saveWebcamScenePlanArtifact({
    outputDir,
    payload: {
      openAiVisionModel: openingVision?.provider === 'openai'
        ? (openingVision.model || openAiVisionModel)
        : (visionProviders.includes('openai') ? openAiVisionModel : ''),
      openAiSceneModel: config.models.chatModel,
      configMode: config.story.mode,
      visionPrompt: visionPrompt,
      visionProviders: visionProviders,
      scenePlanSystemPrompt: scenePlanSystemPrompt,
      requestedSceneCount: sceneCount,
      effectiveSceneCount: scenePlan.length,
      imagePath: openingCameraShot,
      openingPersonaReferencePath,
      imageSource,
      sourceCues,
      visionStoryContext,
      sceneLengths: sceneLengths.slice(0, scenePlan.length),
      vision: openingVision,
      storyRunIndex,
      storyTransport,
      storyTransportArtifactPath,
      openingStartMode: config.render.openingStart.mode,
      openingStartEnabled: config.render.openingStart.enabled,
      openingStartInterval: config.render.openingStart.interval,
      openingFluxContextActive,
      openingFluxContextPrompt,
      rawScenePlan,
      validatedScenePlan,
      runtimeScenePlan,
      appliedScenePlan: scenePlan,
      scenePlanTransforms,
    },
  });
};


  return saveCameraSnapshotArtifact;
};

export default createCameraSnapshotArtifactSaver;

