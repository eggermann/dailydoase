import { buildFallbackStillPrompt } from '../helpers/scene-generator.js';
import { buildCameraGroundedPrompt } from '../helpers/freshweb-vision-prompt.js';
import {
  buildSelfomatCaptureCameraDirection,
  buildSelfomatCaptureMaterialStyle,
} from './selfomat-capture-style.js';

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
  cameraSourceLabel = 'webcam shot',
} = {}) => {
  const primaryCue = String(sourceCues?.[0] || '').trim();
  const basePrompt = String(
    scenePlanEntry?.singleImagePrompt
      || scenePlanEntry?.stillPrompt
      || scenePlanEntry?.imageDescription
      || scenePlanEntry?.videoPrompt
      || primaryCue
      || openingPromptSource
      || buildFallbackStillPrompt('Open on the current shot with a stronger story image.')
  ).trim();
  const storyBeat = String(
    scenePlanEntry?.storyBeat
      || scenePlanEntry?.beat
      || primaryCue
      || openingPromptSource
      || basePrompt
  ).trim();

  if (scenePlanEntry?.selfomat === true) {
    const sceneVisual = String(
      scenePlanEntry?.creativeDecision?.visualEvent
        || scenePlanEntry?.storyEvent
        || scenePlanEntry?.imageDescription
        || scenePlanEntry?.stillPrompt
        || ''
    ).trim();
    const sceneTransformation = String(
      scenePlanEntry?.creativeDecision?.transformation
        || scenePlanEntry?.locationAction
        || ''
    ).trim();
    return [
      'Create the opening still for Scene 1 by restyling the provided real visitor image.',
      'Keep the current visitor recognizable as the main person.',
      sceneVisual ? `Scene 1 visible story: ${sceneVisual}` : '',
      sceneTransformation ? `Show this semantic transformation visibly: ${sceneTransformation}` : '',
      buildSelfomatCaptureCameraDirection({
        captureSource: scenePlanEntry?.captureSource,
        sceneIndex: 0,
        cameraCue: scenePlanEntry?.cameraCue,
      }),
      buildSelfomatCaptureMaterialStyle({
        captureSource: scenePlanEntry?.captureSource,
        sceneIndex: 0,
      }),
      'Keep this opening image to the current visitor; a later cast-context step adds the earlier visitor from their actual reference image.',
    ].filter(Boolean).join(' ');
  }

  return buildCameraGroundedPrompt({
    basePrompt,
    storyBeat,
    stillPrompt: scenePlanEntry?.stillPrompt,
    imageDescription: scenePlanEntry?.imageDescription,
    motionCue: scenePlanEntry?.motionCue,
    cameraCue: scenePlanEntry?.cameraCue,
    startVision: openingVisionText,
    useSingleImage: true,
    promptFlavor,
    cameraSourceLabel,
  });
};
