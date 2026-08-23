import { buildFallbackStillPrompt } from '../helpers/scene-generator.js';
import { compileFluxEditPrompt } from './visual-prompt-compiler.js';

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
  cameraStyle = '',
  model = 'bfl:6@1',
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
  const compilation = compileFluxEditPrompt({
    scene: {
      ...scenePlanEntry,
      singleImagePrompt: scenePlanEntry?.singleImagePrompt || basePrompt,
    },
    currentState: openingVisionText || `The supplied ${cameraSourceLabel} is composition truth.`,
    model,
    cameraStyle,
    referenceRoles: [
      { role: 'current webcam frame / composition and room truth' },
      { role: 'webcam identity truth when supplied' },
    ],
  });

  return compilation.prompt;
};
