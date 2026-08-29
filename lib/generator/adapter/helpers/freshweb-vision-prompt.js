import { compactScenePrompt } from './scene-generator.js';
import {
  extractVisionStoryContext,
  normalizeVisionText,
  summarizeVisionAnchor,
  summarizeVisionActorIdentity,
  summarizeVisionActors,
  summarizeVisionLocation,
  summarizeVisionSetup,
} from './frame-vision.js';

const buildSceneAnchorSummary = ({ stillPrompt, imageDescription } = {}) => {
  const visibleAnchors = compactScenePrompt(normalizeVisionText(imageDescription), 1, 28);
  const destinationSetup = compactScenePrompt(normalizeVisionText(stillPrompt), 1, 24);

  return {
    visibleAnchors,
    destinationSetup,
  };
};

const buildVisionVisibleState = (storyContext = {}, anchor = '', maxWords = 18) => {
  const summary = compactScenePrompt(
    normalizeVisionText(
      storyContext?.description
      || storyContext?.setupSummary
      || anchor
    ),
    1,
    maxWords
  ).replace(/[.]+$/g, '').trim();

  return summary;
};

const joinNaturalList = (values = []) => {
  const items = values.filter(Boolean);
  if (items.length === 0) {
    return '';
  }
  if (items.length === 1) {
    return items[0];
  }
  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
};

const trimDanglingConnector = (value) => String(value || '')
  .replace(/(?:\s|,)+(?:and|or|but)$/i, '')
  .trim();

const LEADING_PROMPT_META_PATTERN = /^(?:room\s+geometry|geometry|location|setting)\s*:\s*/i;

const stripPromptLead = (value) => {
  let normalized = String(value || '').trim();
  let previous = '';

  while (normalized && normalized !== previous) {
    previous = normalized;
    normalized = normalized
      .replace(/^[+|/:;,\-–—]+\s*/u, '')
      .replace(/^in\s+/i, '')
      .replace(/^appears to be\s+/i, '')
      .replace(/^looks like\s+/i, '')
      .replace(/^seems to be\s+/i, '')
      .replace(LEADING_PROMPT_META_PATTERN, '')
      .replace(/^[+|/:;,\-–—]+\s*/u, '')
      .trim();
  }

  return trimDanglingConnector(normalized);
};

const stripLeadingIn = (value) => stripPromptLead(value);

const buildContinuityLead = ({
  storyContext,
  actorsSummary,
  locationSummary,
  anchor,
} = {}) => {
  const labels = [];
  if (actorsSummary) {
    labels.push(storyContext?.actors?.length === 1 ? 'same actor' : 'same actors');
  }
  if (locationSummary) {
    labels.push('same setting');
  }
  if (storyContext?.setupSummary || locationSummary || actorsSummary) {
    labels.push('same shot family');
  }

  if (labels.length === 0) {
    if (anchor) {
      return 'Keep continuity with the same visible subject and setting.';
    }
    return '';
  }

  const details = [];
  if (actorsSummary) {
    details.push(actorsSummary);
  }
  if (locationSummary) {
    details.push(`in ${stripLeadingIn(locationSummary)}`);
  }
  const compactDetails = compactScenePrompt(details.join(' '), 1, 18);
  const labelText = joinNaturalList(labels);

  return compactDetails
    ? `Keep continuity with the ${labelText}: ${compactDetails}.`
    : `Keep continuity with the ${labelText}.`;
};

const buildStaticLocationLead = ({
  locationSummary,
  anchor,
} = {}) => {
  const lockedLocation = stripLeadingIn(locationSummary || '');
  if (lockedLocation) {
    return `Keep the location fixed in ${lockedLocation}; let the beat play inside this same space.`;
  }
  if (anchor) {
    return 'Keep the location fixed in the visible setting; let the beat play inside this same space.';
  }
  return '';
};

const buildLabeledSentence = (label, value, maxWords = 18) => {
  const normalized = compactScenePrompt(normalizeVisionText(value), 1, maxWords);
  if (!normalized) {
    return '';
  }
  return `${label} ${normalized.replace(/[.]+$/g, '').trim()}.`;
};

const buildLabeledPromptSentence = (label, value, maxSentences = 1, maxWords = 24) => {
  const normalized = compactScenePrompt(normalizeVisionText(value), maxSentences, maxWords);
  if (!normalized) {
    return '';
  }
  return `${label} ${normalized.replace(/[.]+$/g, '').trim()}.`;
};

const toCompactPromptFragment = (value, maxWords = 18) => trimDanglingConnector(
  compactScenePrompt(
    normalizeVisionText(value),
    1,
    maxWords
  ).replace(/[.]+$/g, '').trim()
);

const collapseLeadingSame = (value) => String(value || '')
  .replace(/^the same\s+/i, 'the ')
  .replace(/^same\s+/i, '')
  .trim();

const MISSING_ACTOR_PATTERN = /\b(?:none visible|none visibly present|no visible (?:actor|person)|no person visible|no actor visible)\b/i;

const sanitizeVisibleActorSummary = (value) => {
  const normalized = String(value || '').trim();
  if (!normalized || MISSING_ACTOR_PATTERN.test(normalized)) {
    return '';
  }
  return normalized;
};

const FUNCTION_WORDS = new Set([
  'a', 'after', 'an', 'and', 'are', 'as', 'at', 'back', 'be', 'been', 'before',
  'being', 'but', 'by', 'down', 'for', 'from', 'he', 'her', 'him', 'in', 'into',
  'is', 'of', 'on', 'or', 'she', 'the', 'them', 'they', 'to', 'up', 'was',
  'were', 'with'
]);

const PROMPT_META_WORDS = new Set([
  'action', 'actor', 'actors', 'angle', 'beat', 'camera', 'consistent',
  'consistency', 'continuity', 'framing', 'identity', 'keep', 'location',
  'maintain', 'motion', 'next', 'readable', 'same', 'scene', 'setting',
  'shot', 'subject', 'timing', 'visible'
]);

const PHRASE_PREFIX_WORDS = new Set(['same']);

const ENTITY_LEAD_WORDS = new Set([
  'a', 'an', 'the', 'this', 'that', 'these', 'those', 'in', 'on', 'at', 'by',
  'near', 'behind', 'beside', 'under', 'over', 'inside', 'outside', 'around',
  'toward', 'towards', 'into', 'through', 'from', 'against', 'across'
]);

const POSSESSIVE_WORDS = new Set([
  'his', 'her', 'hers', 'its', 'my', 'our', 'their', 'your'
]);

const normalizeKeyword = (value) => {
  const word = String(value || '').toLowerCase();
  if (word.length <= 4) {
    return word;
  }
  if (word.endsWith('ies') && word.length > 5) {
    return `${word.slice(0, -3)}y`;
  }
  if (word.endsWith('ing') && word.length > 6) {
    return word.slice(0, -3);
  }
  if (word.endsWith('ed') && word.length > 5) {
    return word.slice(0, -2);
  }
  if (word.endsWith('es') && word.length > 5) {
    return word.slice(0, -2);
  }
  if (word.endsWith('s') && word.length > 4) {
    return word.slice(0, -1);
  }
  return word;
};

const tokenizeKeywords = (value) => normalizeVisionText(value)
  .toLowerCase()
  .replace(/[^a-z0-9\s]/g, ' ')
  .split(/\s+/)
  .filter(Boolean);

const isKeywordNoise = (word) => {
  const normalized = normalizeKeyword(word);
  return FUNCTION_WORDS.has(normalized) || PROMPT_META_WORDS.has(normalized);
};

const extractMeaningfulKeywords = (value) => tokenizeKeywords(value)
  .map(normalizeKeyword)
  .filter((word) => word.length >= 4 && !isKeywordNoise(word));

const extractReferenceKeywords = (value, minLength = 3) => tokenizeKeywords(value)
  .map(normalizeKeyword)
  .filter((word) => word.length >= minLength && !isKeywordNoise(word));

const extractCandidateEntitySpans = (value) => {
  const words = tokenizeKeywords(value);
  const spans = [];

  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    if (!ENTITY_LEAD_WORDS.has(word) || POSSESSIVE_WORDS.has(word)) {
      continue;
    }

    const phrase = [];
    for (let nextIndex = index + 1; nextIndex < words.length; nextIndex += 1) {
      const nextWord = words[nextIndex];
      const normalized = normalizeKeyword(nextWord);

      if (ENTITY_LEAD_WORDS.has(nextWord) || POSSESSIVE_WORDS.has(nextWord)) {
        break;
      }
      if (FUNCTION_WORDS.has(normalized)) {
        break;
      }
      if (PROMPT_META_WORDS.has(normalized)) {
        if (phrase.length === 0 && PHRASE_PREFIX_WORDS.has(normalized)) {
          continue;
        }
        break;
      }
      if (phrase.length > 0 && phrase[phrase.length - 1].length < 4) {
        break;
      }

      phrase.push(normalized);
      if (phrase.length >= 3) {
        break;
      }
    }

    const candidates = phrase.filter((candidate) => candidate.length >= 3);
    if (candidates.length > 0) {
      spans.push(candidates);
    }
  }

  return spans;
};

const extractCandidateEntityKeywords = (value) => [
  ...new Set(
    extractCandidateEntitySpans(value)
      .flat()
      .filter((candidate) => candidate.length >= 4)
  ),
];

const normalizeContinuityValue = (value) => String(value || '')
  .replace(/^maintain consistency in:?\s*/i, '')
  .replace(/^maintain consistency with:?\s*/i, '')
  .replace(/^maintain consistency of:?\s*/i, '')
  .replace(/^keep consistent:?\s*/i, '')
  .trim();

const looksLikeWeakContinuityFragment = (value) => {
  const normalized = normalizeVisionText(value).trim();
  if (!normalized) {
    return true;
  }
  if (/^\d+(?:[.,]\d+)?$/.test(normalized)) {
    return true;
  }
  const keywords = extractMeaningfulKeywords(normalized);
  return keywords.length === 0;
};

const buildContinuityConstraint = ({
  continuityText,
  maxWords = 22,
} = {}) => {
  const normalized = toCompactPromptFragment(normalizeContinuityValue(continuityText), maxWords);
  if (!normalized || looksLikeWeakContinuityFragment(normalized)) {
    return '';
  }
  return `Continuity: ${normalized}.`;
};

const normalizePromptSignature = (value) => normalizeVisionText(value)
  .toLowerCase()
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const shouldIncludeCameraAction = ({
  basePrompt,
  storyBeat,
  motionCue,
  cameraCue,
  actorsSummary,
  locationSummary,
  readableState,
  endVisibleState,
} = {}) => {
  const actionSignature = normalizePromptSignature(basePrompt);
  if (!actionSignature) {
    return false;
  }

  const comparisonSignature = normalizePromptSignature([
    storyBeat,
    motionCue,
    cameraCue,
  ].filter(Boolean).join(' '));

  const actionSpans = extractCandidateEntitySpans(basePrompt);
  const visibleKeywords = new Set([
    ...extractReferenceKeywords(actorsSummary),
    ...extractCandidateEntityKeywords(actorsSummary),
    ...extractCandidateEntityKeywords(locationSummary),
    ...extractCandidateEntityKeywords(readableState),
    ...extractCandidateEntityKeywords(endVisibleState),
    ...extractCandidateEntityKeywords(motionCue),
    ...extractCandidateEntityKeywords(cameraCue),
  ]);

  const introducesUnsupportedElements = actionSpans.some((span) => !span.some((keyword) => visibleKeywords.has(keyword)));
  if (introducesUnsupportedElements) {
    return false;
  }

  if (!comparisonSignature) {
    return true;
  }

  return !comparisonSignature.includes(actionSignature)
    && !actionSignature.includes(comparisonSignature);
};

const looksLikeWeakLocationSummary = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  if (/visible$/.test(normalized) && normalized.split(/\s+/).length <= 3) {
    return true;
  }
  return false;
};

const shouldIncludeContinuityConstraint = ({
  continuityText,
  actorsSummary,
  locationSummary,
  readableState,
  useSingleImage = false,
} = {}) => {
  const normalizedContinuity = normalizeContinuityValue(continuityText);
  if (!normalizedContinuity || looksLikeWeakContinuityFragment(normalizedContinuity)) {
    return false;
  }

  if (!useSingleImage) {
    return true;
  }

  const continuityKeywords = extractMeaningfulKeywords(normalizedContinuity);
  if (continuityKeywords.length === 0) {
    return false;
  }

  const contextKeywords = new Set([
    ...extractMeaningfulKeywords(actorsSummary),
    ...extractMeaningfulKeywords(locationSummary),
    ...extractMeaningfulKeywords(readableState),
  ]);
  const uniqueKeywords = continuityKeywords.filter((keyword) => !contextKeywords.has(keyword));

  return uniqueKeywords.length >= 1;
};

const buildCameraContinuityParts = ({
  actorCount = 0,
  actorsSummary,
  locationSummary,
  anchor,
} = {}) => {
  const actorText = collapseLeadingSame(toCompactPromptFragment(sanitizeVisibleActorSummary(actorsSummary), 18));
  const locationText = collapseLeadingSame(stripLeadingIn(toCompactPromptFragment(locationSummary, 12)));
  const parts = [];

  if (actorText) {
    parts.push(`${actorCount > 1 ? 'Same actors:' : 'Same actor:'} ${actorText}.`);
  }
  if (locationText && !looksLikeWeakLocationSummary(locationText)) {
    parts.push(`Same location: ${locationText}.`);
  }
  if (parts.length > 0) {
    return parts;
  }
  if (anchor) {
    return ['Same visible subject and setting.'];
  }
  return [];
};

const buildCameraIdentityLock = ({
  actorsSummary,
} = {}) => {
  const actorText = collapseLeadingSame(toCompactPromptFragment(sanitizeVisibleActorSummary(actorsSummary), 16));
  if (!actorText) {
    return 'Identity lock: keep the same visible shot identity from the source frame; do not introduce a replacement person or a new setup.';
  }
  return `Identity lock: keep ${actorText} as the exact same person from the source frame; do not recast, beautify, or substitute the actor.`;
};

const buildCameraFramingLock = ({
  readableState,
  continuityText,
  locationSummary,
  useSingleImage = false,
} = {}) => {
  const continuityFragment = toCompactPromptFragment(continuityText, 18);
  if (continuityFragment && !looksLikeWeakContinuityFragment(continuityFragment)) {
    return `Framing lock: ${continuityFragment}; prefer small pose, gaze, and crop changes over a new setup.`;
  }

  const readableFragment = toCompactPromptFragment(readableState, 14);
  const locationFragment = collapseLeadingSame(stripLeadingIn(toCompactPromptFragment(locationSummary, 10)));
  if (useSingleImage && readableFragment) {
    return `Framing lock: preserve the same readable setup (${readableFragment}) and only allow a small internal motion change.`;
  }
  if (locationFragment) {
    return `Framing lock: keep the same room geometry in ${locationFragment} and avoid a new camera height or replacement setup.`;
  }
  return 'Framing lock: preserve the same shot geometry and avoid a replacement setup.';
};

const buildCameraTimingSentence = ({
  durationSeconds,
  useSingleImage = false,
} = {}) => {
  const duration = Number(durationSeconds);
  if (!Number.isFinite(duration) || duration <= 0) {
    return '';
  }

  return useSingleImage
    ? `Timing: one ${duration}-second held shot with one continuous motion arc.`
    : `Timing: one ${duration}-second transition with one clear start-to-end arc.`;
};

const buildEndContinuityLead = ({
  storyContext,
  actorsSummary,
  locationSummary,
  anchor,
} = {}) => {
  const labels = [];
  if (actorsSummary) {
    labels.push(storyContext?.actors?.length === 1 ? 'same actor' : 'same actors');
  }
  if (locationSummary) {
    labels.push('same setting');
  }

  if (labels.length > 0) {
    return `By the end, the ${joinNaturalList(labels)} should still read clearly.`;
  }
  if (anchor) {
    return 'By the end, the same subject and setting should still read clearly.';
  }
  return '';
};

const buildDurationGuidance = ({
  durationSeconds,
  useSingleImage = false,
} = {}) => {
  const duration = Number(durationSeconds);
  if (!Number.isFinite(duration) || duration <= 0) {
    return '';
  }

  const durationLabel = `${duration}-second`;
  if (useSingleImage) {
    if (duration <= 2) {
      return `Fit the action to a ${durationLabel} held shot: play one immediate readable beat and avoid a frozen hold.`;
    }
    if (duration <= 4) {
      return `Fit the action to a ${durationLabel} held shot: show one clear action, one expression change, and one readable camera move.`;
    }
    return `Fit the action to a ${durationLabel} held shot: keep one coherent motion progression, evolving expression, and no extra drift.`;
  }

  if (duration <= 2) {
    return `Fit the action to a ${durationLabel} transition: move directly to the destination with one immediate readable change.`;
  }
  if (duration <= 4) {
    return `Fit the action to a ${durationLabel} transition: keep one clear movement arc and one simple camera move.`;
  }
  return `Fit the action to a ${durationLabel} transition: allow one smooth progression from start to destination without unrelated sub-beats.`;
};

const buildActorCountLockSentence = ({
  actorCount = 0,
  useSingleImage = false,
  strengthenIdentity = false,
} = {}) => {
  if (actorCount <= 0) {
    return useSingleImage
      ? 'Keep the shot non-human; do not introduce any person or actor.'
      : 'Do not introduce any person or actor into the shot.';
  }

  if (actorCount === 1) {
    if (strengthenIdentity) {
      return useSingleImage
        ? 'One person only: same real person from the source frame, same face and clothes.'
        : 'One person only through the shot: same real person from the source frame, same face and clothes.';
    }
    return useSingleImage
      ? 'Keep exactly one person in frame; no extra actors.'
      : 'Keep exactly one person in frame through the shot; no extra actors.';
  }

  return '';
};

const buildCameraFirstLastLeanPrompt = ({
  continuityParts = [],
  beatText = '',
  actionText = '',
  motion = '',
  camera = '',
  readableState = '',
  endState = '',
} = {}) => compactScenePrompt([
  ...continuityParts.slice(0, 2),
  readableState ? buildLabeledSentence('Keep readable:', readableState, 16) : '',
  beatText ? buildLabeledSentence('Beat:', beatText, 18) : '',
  actionText ? buildLabeledPromptSentence('Action:', actionText, 1, 18) : '',
  motion ? buildLabeledSentence('Motion:', motion, 14) : '',
  camera ? buildLabeledSentence('Camera:', camera, 14) : '',
  endState ? buildLabeledSentence('End state:', endState, 16) : '',
].filter(Boolean).join(' '), 8, 95);

const promptFragmentsOverlap = (left = '', right = '') => {
  const leftSignature = normalizePromptSignature(left);
  const rightSignature = normalizePromptSignature(right);
  if (!leftSignature || !rightSignature) {
    return false;
  }

  return leftSignature === rightSignature
    || leftSignature.includes(rightSignature)
    || rightSignature.includes(leftSignature);
};

const appendDistinctPromptFragment = (fragments, value, maxWords = 18) => {
  const normalized = toCompactPromptFragment(value, maxWords);
  if (!normalized) {
    return fragments;
  }

  if (fragments.some((fragment) => promptFragmentsOverlap(fragment, normalized))) {
    return fragments;
  }

  fragments.push(normalized);
  return fragments;
};

const buildNaturalPromptSentence = (values = [], maxWords = 30, fragmentWordLimit = 18) => {
  const fragments = [];
  values.forEach((value) => appendDistinctPromptFragment(fragments, value, fragmentWordLimit));
  if (fragments.length === 0) {
    return '';
  }

  const joined = fragments.join('; ').trim();
  const sentence = joined
    ? `${joined.charAt(0).toUpperCase()}${joined.slice(1)}.`
    : '';

  return compactScenePrompt(sentence, 1, maxWords);
};

const buildActorIdentityAnchor = ({
  actorsSummary,
  maxWords = 18,
  cameraSourceLabel = 'source frame',
} = {}) => {
  const actorText = collapseLeadingSame(
    toCompactPromptFragment(sanitizeVisibleActorSummary(actorsSummary), maxWords)
  );
  if (!actorText) {
    return `the same real person from the ${cameraSourceLabel}`;
  }
  return `${actorText}, the exact same real person from the ${cameraSourceLabel}`;
};

const buildCameraSceneSetupSentence = ({
  actorsSummary,
  locationSummary,
  readableState,
  anchor,
} = {}) => {
  const actorText = collapseLeadingSame(
    toCompactPromptFragment(sanitizeVisibleActorSummary(actorsSummary), 18)
  );
  const rawLocationText = collapseLeadingSame(
    stripLeadingIn(toCompactPromptFragment(locationSummary, 12))
  );
  const locationText = looksLikeWeakLocationSummary(rawLocationText) ? '' : rawLocationText;
  const lead = actorText && locationText
    ? `${actorText} in ${locationText}`
    : actorText || locationText || '';
  return buildNaturalPromptSentence([
    lead,
    readableState || anchor,
  ], 36, 30);
};

const buildCameraNarrativeSentence = ({
  beatText,
  actionText,
} = {}) => buildNaturalPromptSentence([
  actionText,
  beatText,
], 54, 48);

const buildCameraMovementSentence = ({
  motion,
  camera,
  endState,
} = {}) => buildNaturalPromptSentence([
  motion,
  camera,
  endState,
], 36, 18);

const buildSceneMemoryClause = ({
  previousSceneMemory,
  actorVisible = false,
  surreal = false,
} = {}) => {
  const memoryText = toCompactPromptFragment(previousSceneMemory, 12);
  if (!memoryText) {
    return '';
  }

  if (surreal) {
    return actorVisible
      ? `let a residue of ${memoryText} haunt the expression, posture, and room`
      : `let a residue of ${memoryText} haunt the light, texture, and room pressure`;
  }

  return actorVisible
    ? `let a trace of ${memoryText} linger in the expression, posture, and gaze`
    : `let a trace of ${memoryText} linger in the light and room pressure`;
};

const buildSceneMemorySentence = ({
  previousSceneMemory,
  actorVisible = false,
  surreal = false,
} = {}) => {
  const clause = buildSceneMemoryClause({
    previousSceneMemory,
    actorVisible,
    surreal,
  });
  if (!clause) {
    return '';
  }

  return `${clause.charAt(0).toUpperCase()}${clause.slice(1)}.`;
};

const buildIncomingMotionSentence = (incomingMotion = '') => {
  const vector = toCompactPromptFragment(incomingMotion, 24);
  if (!vector) {
    return '';
  }

  return `Start with the previous motion already underway: ${vector}. Continue it without a neutral reset.`;
};

const CAMERA_ORIENTATION_LOCK_SENTENCE = 'Keep the source camera orientation unmirrored; preserve the real left-right layout from the source frame and avoid a mirrored selfie look.';
const LOCKED_VIEWPOINT_ACTION_SENTENCE = 'Inside this locked viewpoint, the planned subject or room event evolves continuously.';
const GENERIC_ACTOR_LEAD_PATTERN = /^(?:the\s+)?(?:man|woman|person|subject|actor|visitor|artist|figure)\b|^(?:he|she|they)\b/i;

const lowerCaseFirstCharacter = (value) => value
  ? `${value.charAt(0).toLowerCase()}${value.slice(1)}`
  : '';

const normalizeLockedCameraLanguage = (value) => normalizeVisionText(value)
  .replace(/\bno tracking\b/gi, 'locked viewpoint')
  .replace(/\bno movement\b/gi, 'locked viewpoint')
  .replace(/\b(?:static|steady|fixed)\b/gi, 'locked')
  .replace(/\bthe camera holds?\b/gi, 'the camera stays locked')
  .replace(/\bthe shot holds?\b/gi, 'the viewpoint stays locked')
  .replace(/\bholding still\b/gi, 'inside the locked viewpoint')
  .replace(/\bbarely moves?\b/gi, 'evolves visibly')
  .replace(/\bscene remains quiet\b/gi, 'scene develops visibly')
  .replace(/\bquiet and still\b/gi, 'under surveillance light')
  .replace(/\blocked\s+locked\b/gi, 'locked')
  .replace(/\s{2,}/g, ' ')
  .trim();

const summarizeCastReferences = (castReferences = []) => (Array.isArray(castReferences) ? castReferences : [])
  .map((reference) => normalizeVisionText(reference?.description || reference?.reference || ''))
  .filter(Boolean)
  .slice(0, 2)
  .join('; ');

const bindActionToObservedSubject = ({ subject, action } = {}) => {
  const resolvedSubject = normalizeVisionText(subject);
  const resolvedAction = normalizeVisionText(action);
  if (!resolvedSubject || !resolvedAction || /;/.test(resolvedSubject)) {
    return resolvedAction;
  }
  if (GENERIC_ACTOR_LEAD_PATTERN.test(resolvedAction)) {
    return resolvedAction.replace(GENERIC_ACTOR_LEAD_PATTERN, resolvedSubject);
  }
  return `${resolvedSubject} ${lowerCaseFirstCharacter(resolvedAction)}`;
};

export const FRESHWEB_ACTOR_PLACEMENT_PROMPT = [
  'Actors must be a JSON array with one object per real visible person using keys reference, description, position, and orientation.',
  'Use position to report depth and frame placement, for example foreground left, midground center, background right, or top center.',
  'Use orientation to report front-facing, side-facing, or back-facing.',
  'If two people are visible, return two separate actor objects. Do not include people shown only in posters, artwork, screens, mirrors, or reflections.',
].join(' ');

export const DEFAULT_FRESHWEB_VISION_PROMPT = [
  'Describe only the visible shot for continuity.',
  'Return concise labeled lines for Subject, Setting, Framing, Lighting, Location, Actors, Description, and what should stay consistent for the next video shot.',
  FRESHWEB_ACTOR_PLACEMENT_PROMPT,
].join(' ');

export const resolveFreshwebVisionPrompt = (...values) => {
  const match = values.find((value) => typeof value === 'string' && value.trim().length > 0);
  const basePrompt = match || DEFAULT_FRESHWEB_VISION_PROMPT;
  return basePrompt.includes('Actors must be a JSON array')
    ? basePrompt
    : `${basePrompt} ${FRESHWEB_ACTOR_PLACEMENT_PROMPT}`;
};

export const resolveFreshwebVisionProviders = (...values) => values
  .find((value) => typeof value === 'string')
  ?.split(',')
  .map((value) => value.trim())
  .filter(Boolean) || [];

export const buildVisionAwarePrompt = ({
  basePrompt,
  startVision,
  endVision,
  durationSeconds,
  useSingleImage = false,
  anchorBuilder = summarizeVisionAnchor,
} = {}) => {
  const prompt = normalizeVisionText(basePrompt);
  const toAnchor = typeof anchorBuilder === 'function' ? anchorBuilder : summarizeVisionAnchor;
  const startStoryContext = extractVisionStoryContext(startVision);
  const endStoryContext = extractVisionStoryContext(endVision);
  const startAnchor = toAnchor(startVision);
  const endAnchor = toAnchor(endVision);
  const startActors = summarizeVisionActorIdentity(startStoryContext.actors)
    || summarizeVisionActors(startStoryContext.actors);
  const endActors = summarizeVisionActorIdentity(endStoryContext.actors)
    || summarizeVisionActors(endStoryContext.actors);
  const startLocation = summarizeVisionLocation(startStoryContext.location);
  const endLocation = summarizeVisionLocation(endStoryContext.location);
  const startSetup = summarizeVisionSetup(startStoryContext);
  const startContinuity = normalizeVisionText(startStoryContext.continuity || '');
  const durationGuidance = buildDurationGuidance({
    durationSeconds,
    useSingleImage,
  });

  if (!prompt) {
    return compactScenePrompt([
      startLocation && `Location: ${startLocation}.`,
      startActors && `Actors: ${startActors}.`,
      startSetup && `Setup: ${startSetup}.`,
      durationGuidance,
      !useSingleImage && endLocation
        ? `Destination location: ${endLocation}.`
        : '',
      !useSingleImage && endActors
        ? `Destination actors: ${endActors}.`
        : '',
      !useSingleImage && endAnchor && !(endStoryContext.location || endActors)
        ? `Destination anchor: ${endAnchor}.`
        : '',
    ].filter(Boolean).join(' '), 5, 90);
  }

  const additions = [];
  const continuityLead = buildContinuityLead({
    storyContext: startStoryContext,
    actorsSummary: startActors,
    locationSummary: startLocation,
    anchor: startAnchor,
  });
  if (continuityLead) {
    additions.push(continuityLead);
  }
  const staticLocationLead = buildStaticLocationLead({
    locationSummary: startLocation,
    anchor: startAnchor,
  });
  if (staticLocationLead) {
    additions.push(staticLocationLead);
  }
  if (durationGuidance) {
    additions.push(durationGuidance);
  }
  const continuityConstraint = buildContinuityConstraint({
    continuityText: startContinuity,
    maxWords: 24,
  });
  if (continuityConstraint) {
    additions.push(continuityConstraint);
  }
  const endContinuityLead = !useSingleImage
    ? buildEndContinuityLead({
        storyContext: endStoryContext,
        actorsSummary: endActors,
        locationSummary: endLocation,
        anchor: endAnchor,
      })
    : '';
  if (endContinuityLead) {
    additions.push(endContinuityLead);
  }

  if (additions.length === 0) {
    return compactScenePrompt(prompt);
  }

  return compactScenePrompt(`${prompt} ${additions.join(' ')}`, 6, 120);
};

const STATIC_CAMERA_PATTERN = /\b(?:close[\s-]?up|medium(?:\s+close[\s-]?up)?|wide shot|portrait|framing|angle|camera(?:\s+height)?|tilted|push(?:ed)?\s+in|centered|focusing on|focus(?:ed|ing)? on|shot(?:\s+of)?|upper chest|upper torso)\b/i;
const ACTION_VERB_PATTERN = /\b(?:blink|shift|look|turn|lean|raise|lower|move|step|glance|stiffen|tighten|reach|pull|push|brace|recoil|hold|pause|breathe|inhale|exhale|tilt|nod|cross|startle|freeze|change)\b/i;

const looksLikeStaticCameraFragment = (value) => {
  const normalized = normalizeVisionText(value).trim();
  if (!normalized) {
    return true;
  }
  if (!STATIC_CAMERA_PATTERN.test(normalized)) {
    return false;
  }
  return !ACTION_VERB_PATTERN.test(normalized);
};

const buildLtxSetupSentence = ({
  actorsSummary,
  locationSummary,
  readableState,
  anchor,
} = {}) => {
  const actorText = collapseLeadingSame(
    toCompactPromptFragment(sanitizeVisibleActorSummary(actorsSummary), 10)
  );
  const locationText = collapseLeadingSame(
    stripLeadingIn(toCompactPromptFragment(locationSummary, 8))
  );
  const readableText = toCompactPromptFragment(readableState || anchor, 8);
  const lead = actorText && locationText
    ? `${actorText} in ${locationText}`
    : actorText || locationText || readableText;
  if (!lead) {
    return '';
  }

  return compactScenePrompt(
    `Animate the same ${lead}.`,
    1,
    18
  );
};

const buildLtxCueActionSentence = ({
  beatText,
  actionText,
  motion,
  readableState,
  preferDynamicSingleImage = false,
  actorVisible = false,
  previousSceneMemory = '',
} = {}) => {
  const cueText = toCompactPromptFragment(beatText || actionText, 10);
  const actionFragment = !looksLikeStaticCameraFragment(motion)
    ? toCompactPromptFragment(motion, 16)
    : '';
  const fallbackAction = actorVisible
    ? (preferDynamicSingleImage
        ? 'he changes posture, redirects his gaze, and lets the expression turn visibly'
        : 'he blinks, shifts his gaze, and lets the expression change')
    : 'the visible frame changes through light, crop pressure, and small internal motion';
  const resolvedAction = actionFragment || fallbackAction;
  const memoryClause = buildSceneMemoryClause({
    previousSceneMemory,
    actorVisible,
  });

  return compactScenePrompt(
    cueText
      ? `Let ${cueText} register through ${resolvedAction}${memoryClause ? `, and ${memoryClause}` : ''}.`
      : `Let the cue register through ${resolvedAction}${memoryClause ? `, and ${memoryClause}` : ''}.`,
    1,
    24
  );
};

const buildLtxCameraSentence = ({
  camera,
  motion,
  endState,
  preferDynamicSingleImage = false,
} = {}) => {
  const cameraFragment = !looksLikeStaticCameraFragment(camera)
    ? toCompactPromptFragment(camera, 14)
    : '';
  const motionFragment = !looksLikeStaticCameraFragment(motion)
    ? toCompactPromptFragment(motion, 12)
    : '';
  const endFragment = toCompactPromptFragment(endState, 10);
  const fallbackCamera = preferDynamicSingleImage
    ? 'use a small push or drift inside the same shot'
    : 'use a slight camera drift inside the same shot';
  const resolvedCamera = cameraFragment || fallbackCamera;

  return compactScenePrompt([
    `${resolvedCamera.charAt(0).toUpperCase()}${resolvedCamera.slice(1)}.`,
    motionFragment && motionFragment !== cameraFragment ? `Keep the motion readable through ${motionFragment}.` : '',
    endFragment ? `Land on ${endFragment}.` : '',
  ].filter(Boolean).join(' '), 2, 20);
};

const buildLtxTrippySetupSentence = ({
  actorsSummary,
  locationSummary,
  readableState,
  anchor,
  cameraSourceLabel = 'webcam shot',
} = {}) => {
  const actorText = collapseLeadingSame(
    toCompactPromptFragment(sanitizeVisibleActorSummary(actorsSummary), 9)
  );
  const locationText = collapseLeadingSame(
    stripLeadingIn(toCompactPromptFragment(locationSummary, 7))
  );
  const readableText = toCompactPromptFragment(readableState || anchor, 7);
  const visibleLead = actorText && locationText
    ? `${actorText} in ${locationText}`
    : actorText || locationText || readableText || 'the visible shot';
  const sourceRealismLabel = String(cameraSourceLabel || '').toLowerCase().includes('webcam')
    ? 'webcam realism'
    : 'source realism';
  const identityAnchor = actorText
    ? buildActorIdentityAnchor({ actorsSummary, maxWords: 10, cameraSourceLabel })
    : `the same real person from the ${cameraSourceLabel}`;

  return compactScenePrompt(
    `Start from ${visibleLead} and let the image break away from plain ${sourceRealismLabel}; keep ${identityAnchor} with the same face and clothes.`,
    1,
    24
  );
};

const buildLtxTrippyTransformationSentence = ({
  beatText,
  actionText,
  actorVisible = false,
  previousSceneMemory = '',
} = {}) => {
  const cueText = toCompactPromptFragment(beatText || actionText, 10) || 'the cue';
  const actionFragment = !looksLikeStaticCameraFragment(actionText)
    ? toCompactPromptFragment(actionText, 16)
    : '';
  const fallbackAction = actorVisible
    ? 'the subject recoils, changes expression, and moves as if pulled into a dream'
    : 'the room warps, the light flickers, and the frame mutates like a dream';
  const memoryClause = buildSceneMemoryClause({
    previousSceneMemory,
    actorVisible,
    surreal: true,
  });

  return compactScenePrompt(
    `Let ${cueText} take over the scene; ${actionFragment || fallbackAction}${memoryClause ? `, and ${memoryClause}` : ''}.`,
    1,
    26
  );
};

const buildLtxTrippyAtmosphereSentence = ({
  beatText,
  readableState,
  locationSummary,
} = {}) => {
  const cueText = toCompactPromptFragment(beatText, 9);
  const readableText = toCompactPromptFragment(readableState, 8);
  const locationText = stripLeadingIn(toCompactPromptFragment(locationSummary, 7));

  return compactScenePrompt([
    cueText ? `Build the mood around ${cueText}` : 'Build a feverish surreal mood',
    readableText ? `while ${readableText} stays just readable enough to orient the shot` : '',
    locationText ? `and let ${locationText} bend into something uncanny` : '',
  ].filter(Boolean).join(', ') + '.', 1, 26);
};

const buildLtxTrippyCameraSentence = ({
  camera,
  motion,
} = {}) => {
  const cameraFragment = !looksLikeStaticCameraFragment(camera)
    ? toCompactPromptFragment(camera, 12)
    : '';
  const motionFragment = !looksLikeStaticCameraFragment(motion)
    ? toCompactPromptFragment(motion, 10)
    : '';
  const resolvedCamera = cameraFragment || 'keep the camera motion uneasy, unstable, and hallucinatory';

  return compactScenePrompt([
    `${resolvedCamera.charAt(0).toUpperCase()}${resolvedCamera.slice(1)}.`,
    motionFragment ? `Keep the movement building through ${motionFragment}.` : '',
  ].filter(Boolean).join(' '), 2, 22);
};

export const DOCUMENTARY_MATERIAL_REALISM_SENTENCE = 'Render objects as physically present: plausible scale, contact, occlusion, material texture, room-lit shadows, documentary deep focus.';

export const buildCameraGroundedPrompt = ({
  basePrompt,
  storyBeat,
  stillPrompt,
  imageDescription,
  durationSeconds,
  motionCue,
  cameraCue,
  actorAction,
  actorsInteraction,
  locationAction,
  storyEvent,
  castReferences,
  startVision,
  endVision,
  useSingleImage = false,
  preferDynamicSingleImage = false,
  promptFlavor = 'default',
  previousSceneMemory = '',
  incomingMotion = '',
  cameraSourceLabel = 'webcam shot',
  cameraStyle = '',
} = {}) => {
  const startStoryContext = extractVisionStoryContext(startVision);
  const endStoryContext = extractVisionStoryContext(endVision);
  const startAnchor = startStoryContext.anchor || summarizeVisionAnchor(startVision);
  const endAnchor = endStoryContext.anchor || summarizeVisionAnchor(endVision);
  const startActors = sanitizeVisibleActorSummary(
    summarizeVisionActorIdentity(startStoryContext.actors)
      || summarizeVisionActors(startStoryContext.actors)
  );
  const castActors = summarizeCastReferences(castReferences);
  const actionSubject = startActors || castActors;
  const endActors = sanitizeVisibleActorSummary(
    summarizeVisionActorIdentity(endStoryContext.actors)
      || summarizeVisionActors(endStoryContext.actors)
  );
  const startLocation = summarizeVisionLocation(startStoryContext.location);
  const endLocation = summarizeVisionLocation(endStoryContext.location);
  const startContinuity = normalizeVisionText(startStoryContext.continuity || '');
  const {
    visibleAnchors,
    destinationSetup,
  } = buildSceneAnchorSummary({ stillPrompt, imageDescription });
  const startVisibleState = buildVisionVisibleState(startStoryContext, startAnchor, 18);
  const endVisibleState = buildVisionVisibleState(endStoryContext, endAnchor, 18);
  const explicitSceneAction = [
    normalizeVisionText(actorAction),
    normalizeVisionText(actorsInteraction),
    normalizeVisionText(locationAction),
    normalizeVisionText(storyEvent),
  ].filter(Boolean).join(' ');
  const beatText = compactScenePrompt(
    normalizeVisionText(storyBeat) || (explicitSceneAction ? '' : normalizeVisionText(basePrompt)),
    1,
    18
  );
  const plannedAction = explicitSceneAction || normalizeVisionText(basePrompt);
  const actionText = compactScenePrompt(
    explicitSceneAction
      ? bindActionToObservedSubject({ subject: actionSubject, action: plannedAction })
      : plannedAction,
    2,
    54
  );
  const motion = normalizeVisionText(motionCue);
  const camera = normalizeLockedCameraLanguage(cameraCue);
  const cameraStyleSentence = compactScenePrompt(normalizeLockedCameraLanguage(cameraStyle), 1, 36);
  const plannedCameraSentence = cameraStyleSentence
    ? compactScenePrompt(camera, 1, 22)
    : '';
  const readableState = startVisibleState || visibleAnchors;
  const resolvedHoldState = useSingleImage
    ? ''
    : (endVisibleState || destinationSetup);
  const actorVisible = Boolean(actionSubject);
  const actorCountLockSentence = buildActorCountLockSentence({
    actorCount: Array.isArray(startStoryContext.actors) ? startStoryContext.actors.length : 0,
    useSingleImage,
    strengthenIdentity: actorVisible,
  });
  const orientationLockSentence = CAMERA_ORIENTATION_LOCK_SENTENCE;
  const memorySentence = buildSceneMemorySentence({
    previousSceneMemory,
    actorVisible,
    surreal: String(promptFlavor || '').toLowerCase() === 'ltxtrippy',
  });
  const incomingMotionSentence = buildIncomingMotionSentence(incomingMotion);
  const includeAction = Boolean(explicitSceneAction) || shouldIncludeCameraAction({
    basePrompt: actionText,
    storyBeat: beatText,
    motionCue,
    cameraCue,
    actorsSummary: actionSubject,
    locationSummary: startLocation,
    readableState,
    endVisibleState,
  });

  if (useSingleImage && String(promptFlavor || '').toLowerCase() === 'ltx') {
    const setupSentence = buildLtxSetupSentence({
      actorsSummary: startActors,
      locationSummary: startLocation,
      readableState,
      anchor: startAnchor,
    });
    const cueActionSentence = buildLtxCueActionSentence({
      beatText,
      actionText: includeAction ? actionText : '',
      motion,
      readableState,
      preferDynamicSingleImage,
      actorVisible,
      previousSceneMemory,
    });
    const cameraSentence = buildLtxCameraSentence({
      camera,
      motion,
      endState: resolvedHoldState,
      preferDynamicSingleImage,
    });

    return compactScenePrompt([
      setupSentence,
      incomingMotionSentence,
      DOCUMENTARY_MATERIAL_REALISM_SENTENCE,
      orientationLockSentence,
      cameraStyleSentence,
      plannedCameraSentence,
      cueActionSentence,
      cameraSentence,
    ].filter(Boolean).join(' '), 5, 114);
  }

  if (useSingleImage && String(promptFlavor || '').toLowerCase() === 'ltxtrippy') {
    return compactScenePrompt([
      buildLtxTrippySetupSentence({
        actorsSummary: startActors,
        locationSummary: startLocation,
        readableState,
        anchor: startAnchor,
        cameraSourceLabel,
      }),
      incomingMotionSentence,
      DOCUMENTARY_MATERIAL_REALISM_SENTENCE,
      buildLtxTrippyTransformationSentence({
        beatText,
        actionText: includeAction ? actionText : '',
        actorVisible,
        previousSceneMemory,
      }),
      buildLtxTrippyAtmosphereSentence({
        beatText,
        readableState,
        locationSummary: startLocation,
      }),
      orientationLockSentence,
      cameraStyleSentence,
      plannedCameraSentence,
      buildLtxTrippyCameraSentence({
        camera,
        motion,
      }),
    ].filter(Boolean).join(' '), 7, 138);
  }

  const setupSentence = buildCameraSceneSetupSentence({
    actorsSummary: startActors,
    locationSummary: startLocation,
    readableState,
    anchor: startAnchor,
  });

  const narrativeSentence = buildCameraNarrativeSentence({
    beatText,
    actionText: includeAction ? actionText : '',
  });

  const movementSentence = buildCameraMovementSentence({
    motion,
    camera,
    endState: resolvedHoldState,
  });

  const fallbackSetupSentence = (!setupSentence && !narrativeSentence && !movementSentence)
    ? buildNaturalPromptSentence([
        startActors || startAnchor,
        startLocation,
        readableState,
        includeAction ? actionText : beatText,
      ], 36, 20)
    : '';

  const prompt = compactScenePrompt([
    incomingMotionSentence,
    narrativeSentence,
    DOCUMENTARY_MATERIAL_REALISM_SENTENCE,
    memorySentence,
    setupSentence,
    orientationLockSentence,
    cameraStyleSentence,
    plannedCameraSentence,
    (cameraStyleSentence || plannedCameraSentence) ? LOCKED_VIEWPOINT_ACTION_SENTENCE : '',
    actorCountLockSentence,
    movementSentence,
    fallbackSetupSentence,
  ].filter(Boolean).join(' '), 7, useSingleImage ? 146 : 130);

  if (prompt) {
    return prompt;
  }

  return compactScenePrompt([
    orientationLockSentence,
    cameraStyleSentence,
    plannedCameraSentence,
    readableState,
    includeAction ? actionText : beatText,
    motion,
    camera,
    resolvedHoldState,
  ].filter(Boolean).join(' '), 6, useSingleImage ? 146 : 130);
};

export default {
  DEFAULT_FRESHWEB_VISION_PROMPT,
  FRESHWEB_ACTOR_PLACEMENT_PROMPT,
  resolveFreshwebVisionPrompt,
  resolveFreshwebVisionProviders,
  buildVisionAwarePrompt,
  buildCameraGroundedPrompt,
};
