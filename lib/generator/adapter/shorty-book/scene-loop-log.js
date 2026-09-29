export const logSceneLoopSummary = ({
  config,
  openingCameraShot,
  openingPersonaReferencePath = '',
  openingFluxContextActive = false,
  openingFluxContextPrompt = '',
  storyRunIndex = 1,
  sourceCues = [],
  scenePlan = [],
  sceneLengths = [],
} = {}) => {
  const loggedSceneLengths = scenePlan
    .map((scene) => Number(scene?.requestedDurationSeconds) || Number(scene?.durationSeconds) || 0)
    .filter((value) => Number.isFinite(value) && value > 0);

  console.log('[freshweb-middle-cost-4-3] openingCameraShot:', openingCameraShot);
  if (openingPersonaReferencePath) {
    console.log('[freshweb-middle-cost-4-3] openingPersonaReference:', openingPersonaReferencePath);
  }
  console.log('[freshweb-middle-cost-4-3] storyRunIndex:', storyRunIndex);
  console.log(
    '[freshweb-middle-cost-4-3] openingStart:',
    `${config.render.openingStart.mode} | enabled=${config.render.openingStart.enabled} | interval=${config.render.openingStart.interval} | active=${openingFluxContextActive}`
  );
  console.log(
    '[freshweb-middle-cost-4-3] driftCorrection:',
    `${config.render.driftCorrection.level} | enabled=${config.render.driftCorrection.enabled}`
  );
  if (openingFluxContextPrompt) {
    console.log('[freshweb-middle-cost-4-3] openingStartPrompt:', openingFluxContextPrompt);
  }
  if (config.story.staticTestMode) {
    console.log('[freshweb-middle-cost-4-3] staticTestMode: enabled');
  }
  console.log('[freshweb-middle-cost-4-3] sourceCues:', sourceCues.join(' | '));
  console.log('[freshweb-middle-cost-4-3] scenePlan:', scenePlan.map((scene) => scene.title).join(' | '));
  console.log('[freshweb-middle-cost-4-3] sceneModes:', scenePlan.map((scene) => scene.videoMode).join(' | '));
  console.log('[freshweb-middle-cost-4-3] IMG_SEED:', config.models.imageSeed, 'VID_SEED:', config.models.videoSeed);
  console.log(
    '[freshweb-middle-cost-4-3] sceneCountTaktmuster:',
    `${config.story.sceneCountTaktmusterType} | ${config.story.sceneCountTaktmusterCount} x ${config.story.sceneCountTaktmusterZaehler}/${config.story.sceneCountTaktmusterNenner}`
  );
  console.log('[freshweb-middle-cost-4-3] sceneCountBias:', config.story.sceneCountBias);
  console.log(
    '[freshweb-middle-cost-4-3] sceneCountInitialPattern:',
    (config.story.sceneCountInitialPattern || []).join(',') || 'none'
  );
  console.log(
    '[freshweb-middle-cost-4-3] sceneLengthTaktmuster:',
    `${config.story.sceneLengthTaktmusterType} | takt ${config.story.sceneLengthTaktmusterTakt}`
  );
  console.log('[freshweb-middle-cost-4-3] sceneLengthMultiplier:', config.story.sceneLengthMultiplier);
  console.log('[freshweb-middle-cost-4-3] sceneLengthBias:', config.story.sceneLengthBias);
  console.log('[freshweb-middle-cost-4-3] imageToVideoOnly:', config.story.forceImageToVideoOnly);
  console.log('[freshweb-middle-cost-4-3] mireloMode:', config.story.mireloMode);
  console.log(
    '[freshweb-middle-cost-4-3] sceneLengths:',
    (loggedSceneLengths.length > 0 ? loggedSceneLengths : sceneLengths).join(',')
  );
  console.log('[freshweb-middle-cost-4-3] scenes:');
  for (const scene of scenePlan) {
    const requestedDuration = Number(scene?.requestedDurationSeconds);
    const plannedDuration = Number(scene?.durationSeconds);
    const durationLabel = Number.isFinite(requestedDuration) && requestedDuration > 0
      ? (Number.isFinite(plannedDuration) && plannedDuration > 0 && Math.abs(requestedDuration - plannedDuration) >= 0.01
        ? `${requestedDuration}s (planned ${plannedDuration}s)`
        : `${requestedDuration}s`)
      : `${scene.durationSeconds}s`;
    console.log(
      `  ${scene.index}. ${scene.title} | ${scene.videoMode} | ${scene.frameSource} | ${durationLabel}`
    );
  }
};

export default logSceneLoopSummary;
