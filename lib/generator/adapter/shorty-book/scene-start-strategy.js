export const START_FRAME_STRATEGIES = {
  locationReanchor: 'locationReanchor',
  driftCorrectedLastFrame: 'driftCorrectedLastFrame',
  rawLastFrame: 'rawLastFrame',
};

const VALID_START_FRAME_STRATEGIES = new Set(Object.values(START_FRAME_STRATEGIES));

export const normalizeStartFrameStrategy = (value, fallback = '') => {
  const strategy = String(value || '').trim();
  if (VALID_START_FRAME_STRATEGIES.has(strategy)) {
    return strategy;
  }
  return fallback;
};

export const deriveLegacyStartFrameStrategy = (scene = {}, sceneIndex = 0) => {
  if (sceneIndex === 0) {
    return START_FRAME_STRATEGIES.locationReanchor;
  }

  const requestsFreshImage = scene?.freshImage === true || scene?.frameSource === 'newImage';
  if (requestsFreshImage) {
    return START_FRAME_STRATEGIES.locationReanchor;
  }

  return START_FRAME_STRATEGIES.rawLastFrame;
};

export const resolveSceneStartFrameStrategy = (scene = {}, sceneIndex = 0) => {
  const plannedStrategy = normalizeStartFrameStrategy(scene?.startFrameStrategy);
  if (plannedStrategy) {
    return plannedStrategy;
  }
  return deriveLegacyStartFrameStrategy(scene, sceneIndex);
};

export const resolveConfiguredStartFrameStrategy = ({
  scene = {},
  sceneIndex = 0,
  sceneCount = 0,
  config = {},
} = {}) => {
  const isFirstScene = sceneIndex === 0;
  const isLastScene = sceneCount > 1 && sceneIndex === sceneCount - 1;

  if (isFirstScene) {
    return normalizeStartFrameStrategy(
      config.firstSceneStrategy,
      resolveSceneStartFrameStrategy(scene, sceneIndex)
    );
  }

  if (isLastScene) {
    return normalizeStartFrameStrategy(
      config.lastSceneStrategy,
      resolveSceneStartFrameStrategy(scene, sceneIndex)
    );
  }

  return resolveSceneStartFrameStrategy(scene, sceneIndex);
};

export const applyPlannedStartFrameStrategy = (scene = {}, sceneIndex = 0) => {
  const startFrameStrategy = resolveSceneStartFrameStrategy(scene, sceneIndex);

  if (startFrameStrategy === START_FRAME_STRATEGIES.locationReanchor) {
    return {
      ...scene,
      startFrameStrategy,
      frameSource: 'newImage',
      freshImage: true,
      useCameraShot: true,
    };
  }

  return {
    ...scene,
    startFrameStrategy,
    frameSource: 'lastFrame',
    freshImage: false,
    useCameraShot: false,
  };
};

export const shouldGenerateLocationStartFrame = ({
  scene,
  sceneIndex = 0,
  plannerControlEnabled = false,
} = {}) => {
  if (!plannerControlEnabled) {
    return true;
  }
  return resolveSceneStartFrameStrategy(scene, sceneIndex)
    === START_FRAME_STRATEGIES.locationReanchor;
};

export const shouldDriftCorrectLastFrame = ({
  scene,
  sceneIndex = 0,
  plannerControlEnabled = false,
} = {}) => {
  if (!plannerControlEnabled) {
    return null;
  }
  return resolveSceneStartFrameStrategy(scene, sceneIndex)
    === START_FRAME_STRATEGIES.driftCorrectedLastFrame;
};

export default {
  START_FRAME_STRATEGIES,
  normalizeStartFrameStrategy,
  deriveLegacyStartFrameStrategy,
  resolveSceneStartFrameStrategy,
  resolveConfiguredStartFrameStrategy,
  applyPlannedStartFrameStrategy,
  shouldGenerateLocationStartFrame,
  shouldDriftCorrectLastFrame,
};
