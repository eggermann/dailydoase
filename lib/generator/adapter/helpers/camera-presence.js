import { createVisionHelper } from './vision-model.js';

const normalizeText = (value) => String(value ?? '')
  .replace(/\s+/g, ' ')
  .trim();

export const DEFAULT_CAMERA_PRESENCE_PROMPT = [
  'Check only whether one or more real human people are visibly present in this live camera frame.',
  'Inspect the entire frame, especially edges and lower corners. A small, partially occluded, side-facing, or back-facing real person still counts as PERSON_PRESENT.',
  'Ignore posters, paintings, artwork, printed faces, screens, mirrors, statues, mannequins, and reflections.',
  'Reply with exactly one token: PERSON_PRESENT or NO_PERSON.',
].join(' ');

const NO_PERSON_SIGNALS = [
  'no_person',
  'no person',
  'no people',
  'no human',
  'no visible person',
  'no visible people',
  'nobody visible',
  'none visible',
  'empty room',
  'empty frame',
  'vacant room',
];

const PERSON_PRESENT_SIGNALS = [
  'person_present',
  'person present',
  'people present',
  'visible person',
  'visible people',
  'one person',
  'two people',
  'three people',
  'a person',
  'a man',
  'a woman',
  'man visible',
  'woman visible',
  'human subject',
  'human figure',
  'face visible',
];

export const resolveCameraPresenceDecision = (value = '') => {
  const normalizedText = normalizeText(value).toLowerCase();
  if (!normalizedText) {
    return {
      hasPerson: false,
      status: 'unknown',
      normalizedText: '',
    };
  }

  if (NO_PERSON_SIGNALS.some((signal) => normalizedText.includes(signal))) {
    return {
      hasPerson: false,
      status: 'no_person',
      normalizedText,
    };
  }

  if (PERSON_PRESENT_SIGNALS.some((signal) => normalizedText.includes(signal))) {
    return {
      hasPerson: true,
      status: 'person_present',
      normalizedText,
    };
  }

  return {
    hasPerson: false,
    status: 'unknown',
    normalizedText,
  };
};

export const createCameraPresenceDetector = ({
  prompt = DEFAULT_CAMERA_PRESENCE_PROMPT,
  providers = ['lmstudio'],
} = {}) => {
  const visionHelper = createVisionHelper({
    prompt,
    providers,
  });

  return async ({ imagePath } = {}) => {
    if (!imagePath) {
      throw new Error('createCameraPresenceDetector requires an imagePath');
    }

    const result = await visionHelper({ imagePath });
    const outputText = normalizeText(result?.outputText);
    const decision = resolveCameraPresenceDecision(outputText);
    return {
      ...decision,
      outputText,
      provider: result?.provider || '',
      model: result?.model || '',
    };
  };
};

export default {
  DEFAULT_CAMERA_PRESENCE_PROMPT,
  createCameraPresenceDetector,
  resolveCameraPresenceDecision,
};
