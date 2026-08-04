import { buildFallbackStillPrompt } from '../helpers/scene-generator.js';
import { buildCameraGroundedPrompt } from '../helpers/freshweb-vision-prompt.js';
import {
  selectFluxStillDirection,
  selectSceneStoryBeat,
} from './scene-prompt-selection.js';

const OPENING_START_MODE_ALIASES = {
  camera: 'cameraShot',
  camerashot: 'cameraShot',
  newimage: 'cameraShot',
  raw: 'cameraShot',
  fluxcontext: 'fluxContext',
  'flux-context': 'fluxContext',
  fluxkontext: 'fluxContext',
  kontext: 'fluxContext',
};

export const normalizeOpeningStartMode = (value, fallback = 'cameraShot') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }
  return OPENING_START_MODE_ALIASES[normalized] || fallback;
};

export const shouldUseOpeningFluxContextImage = ({
  enabled = false,
  mode = 'cameraShot',
  interval = 1,
  iteration = 1,
} = {}) => {
  if (!enabled) {
    return false;
  }

  if (normalizeOpeningStartMode(mode) !== 'fluxContext') {
    return false;
  }

  const resolvedInterval = Math.max(1, Math.floor(Number(interval) || 1));
  const resolvedIteration = Math.max(1, Math.floor(Number(iteration) || 1));
  return resolvedIteration % resolvedInterval === 0;
};

export const buildOpeningFluxContextPrompt = ({
  scenePlanEntry = {},
  sourceCues = [],
  openingVisionText = '',
  openingPromptSource = '',
  promptFlavor = 'default',
  lockActorCount = true,
  cameraSourceLabel = 'webcam shot',
} = {}) => {
  const primaryCue = String(sourceCues?.[0] || '').trim();
  const fallbackPrompt = buildFallbackStillPrompt(
    'Open on the current shot with a stronger story image.'
  );
  const basePrompt = selectFluxStillDirection({
    scenePlanEntry,
    primarySourceCue: primaryCue,
    openingPromptSource,
    fallbackPrompt,
  });
  const storyBeat = selectSceneStoryBeat({
    scenePlanEntry,
    primarySourceCue: primaryCue,
    openingPromptSource,
    selectedPrompt: basePrompt,
  });

  const groundedPrompt = buildCameraGroundedPrompt({
    basePrompt,
    storyBeat,
    stillPrompt: scenePlanEntry?.stillPrompt,
    imageDescription: scenePlanEntry?.imageDescription,
    motionCue: scenePlanEntry?.motionCue,
    cameraCue: scenePlanEntry?.cameraCue,
    startVision: openingVisionText,
    useSingleImage: true,
    promptFlavor,
    lockActorCount,
    cameraSourceLabel,
  });

  return [
    groundedPrompt,
    `Still image direction: ${basePrompt}`,
  ].filter(Boolean).join(' ');
};
