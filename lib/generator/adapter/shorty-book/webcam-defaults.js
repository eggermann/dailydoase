import fs from 'fs-extra';
import path from 'node:path';

import getIamge from '../../../helper/getIamge.js';
import {
  buildFallbackStillPrompt,
  buildFallbackVideoPrompt,
  compactScenePrompt,
  createSceneGenerator,
  DEFAULT_SCENE_SYSTEM_PROMPT,
  getScenePlanEntry,
} from '../helpers/scene-generator.js';
import {
  createFrameVisionHelper,
  extractVisionStoryContext,
  summarizeVisionActorIdentity,
  summarizeVisionActors,
  summarizeVisionLocation,
} from '../helpers/frame-vision.js';
import {
  buildCameraGroundedPrompt,
  buildVisionAwarePrompt,
  resolveFreshwebVisionPrompt,
  resolveFreshwebVisionProviders,
} from '../helpers/freshweb-vision-prompt.js';

export const DEFAULT_WEBCAM_CAMERA_SCENE_SYSTEM_PROMPT = [
  DEFAULT_SCENE_SYSTEM_PROMPT,
  'When configMode is "camera", keep every scene grounded in the currently visible real camera shot.',
  'In camera mode, source cues must shape the emotional arc and implied off-screen story inside the real shot.',
  'Treat source cues as an ordered wordstream and make each next cue visibly change scene state in sequence.',
  'Treat the source screenshot as the stage for a curious spectacle shaped by the wordstream, not as a flat frame to paraphrase.',
  'Translate source cues into visible tension, dread, curiosity, suspicion, shock, relief, obsession, or other concrete states that can be read from posture, gaze, expression, framing, and lighting inside the same room.',
  'In camera mode, let the source cues drive the storybook progression mainly through title, beat, storyBeat, motionCue, cameraCue, and emotional change, not by replacing the visible shot with literal off-screen objects.',
  'In camera mode, favor embodied, visually readable subscene beats over explanatory, analytical, or topic-summary phrasing.',
  'In camera mode, map wordstream changes through visible location emphasis, actor movement, and sensory atmosphere shifts (light, texture, tension) inside the same room.',
  'For each camera scene, decide whether the cue acts mainly on the subject, on the room, or on both together, and make that interaction explicit in beat, storyBeat, motionCue, and cameraCue.',
  'Across the sequence, vary the interaction pattern so some cues visibly push the body, some reshape the room emphasis, and some force the subject and room to answer each other in the same shot.',
  'If a source cue refers to an unseen object, meal, title, location, or event, show the subject reacting to it, remembering it, craving it, or fearing it inside the real shot instead of inserting that unseen thing into the frame.',
  'In camera mode, do not literalize unseen source-cue nouns into visible props; convert them into body action, room emphasis, lighting pressure, and camera behavior inside the existing shot.',
  'In camera mode, do not turn the source cues into a generic host presentation, review, explanation, or discussion unless the source cues explicitly call for that format.',
  'When camera-mode vision context is provided, use its location description, actor descriptions, and visible-shot description as the basis for every scene beat, stillPrompt, imageDescription, and video prompt.',
  'In camera mode, scene changes should come from recomposing, reframing, or evolving the visible location and actor state described by vision, not from hardcoded banned-word lists or hand-written object filters.',
  'In camera mode, scene 1 must always start from a fresh live webcam shot.',
  'In camera mode, scene 1 must always use videoMode "singleImage".',
  'For every camera scene, first decide the new story point or subscene moment, then choose frameSource and videoMode to fit that moment.',
  'In camera mode, a different setting means a different visible setup inside the same real shot: a new pose, gaze direction, body position, framing emphasis, relation to the window or artwork, foreground-background balance, or lighting emphasis that is already plausible from the source image.',
  'Respect the image prompt fields: stillPrompt and imageDescription must describe that chosen visible setup clearly and literally.',
  'Make title, beat, storyBeat, videoPrompt, and singleImagePrompt feel specific, sensory, and cinematic, with physical behavior and visual pressure rather than vague discussion.',
  'Do not invent a new location, set, landscape, or props that are not visible in the camera image.',
  'For camera mode, videoPrompt and singleImagePrompt must describe only what can happen inside the visible shot: facial expression, body movement, gaze shift, hand movement, posture change, lighting change, focus change, or camera motion.',
  'In camera mode, keep the same subject identity, room, and overall setting unless a fresh camera shot is explicitly requested.',
  'In camera mode, keep the location static across the sequence and follow the beat through expression, gesture, props, framing, and lighting inside that same space.',
  'Default to videoMode "singleImage" in camera mode when in doubt, especially for small emotional or gestural changes that should preserve actor and background continuity.',
  'Choose videoMode "singleImage" when the subscene is mainly one held visual state with believable internal motion.',
  'Choose videoMode "firstLast" only when the subscene should travel from the current frame toward a small, clearly believable destination setup in the same real room and subject continuity.',
  'Choose frameSource "lastFrame" when the next subscene should continue naturally from the previous generated ending.',
  'After scene 1, keep later camera scenes chained from the previous generated last frame instead of restarting from a fresh webcam shot.',
  'When a later scene uses videoMode "firstLast", treat the previous last frame as the start image and make the destination stillPrompt describe the fresh webcam end state you want to arrive at.',
  'For every later firstLast camera scene, set useCameraShot=true and freshImage=false.',
  'For every later singleImage camera scene, set frameSource="lastFrame", useCameraShot=false, and freshImage=false.',
  'For later scenes in camera mode, only these structures are valid: singleImage from lastFrame or firstLast from lastFrame toward a fresh webcam end shot.',
  'For later scenes in camera mode, useCameraShot=true is only for the fresh webcam destination of a firstLast scene.',
  'In camera mode, if videoMode is "firstLast", frameSource must be "lastFrame" and the destination should be a fresh webcam end shot.',
  'Across the whole camera plan, vary the subscene logic through expression, gesture, gaze, framing emphasis, and emotional progression even if several consecutive scenes all use singleImage.',
  'Do not force firstLast just to create variety; continuity is more important than mode variety in camera mode.',
  'Do not let the last two scenes repeat the same confrontation, determination, or payoff beat. In the final stretch, each scene must change the dominant body action, framing emphasis, or end-state.',
  'Before you output JSON, check that every later singleImage scene starts from lastFrame and that every firstLast camera scene has useCameraShot=true.',
  'cameraCue and motionCue must be simple, literal, and shot-grounded.',
].join(' ');

const TRIPPY_CAMERA_SCENE_PROMPT_APPENDIX = [
  'When sceneFlavor is "ltxTrippy", the source cue may visibly overtake the room instead of staying strictly inside plain webcam realism.',
  'When sceneFlavor is "ltxTrippy", allow surreal transformations of light, texture, background geometry, color cast, atmosphere, and implied props generated from the source cues.',
  'When sceneFlavor is "ltxTrippy", do not reduce unseen cue nouns to mere reaction shots; let them become visible hallucination, dream logic, symbolic objects, and uncanny set dressing.',
  'When sceneFlavor is "ltxTrippy", prompt-dominant spectacle is more important than strict shot continuity, but keep a trace of the original actor or room as an anchor when possible.',
  'When sceneFlavor is "ltxTrippy", singleImagePrompt and videoPrompt should stage a complete cinematic scene event, not just animate the existing webcam frame slightly.',
].join(' ');

const normalizeString = (value) => (typeof value === 'string' ? value.trim() : '');

const COMMON_FUNCTION_WORDS = new Set([
  'a', 'after', 'an', 'and', 'are', 'as', 'at', 'away', 'back', 'be', 'before',
  'behind', 'beside', 'by', 'for', 'from', 'he', 'her', 'him', 'in', 'inside',
  'into', 'is', 'it', 'near', 'of', 'on', 'or', 'out', 'over', 'she', 'the',
  'them', 'they', 'through', 'to', 'toward', 'towards', 'under', 'up', 'while',
  'with'
]);

const PROMPT_CONTROL_WORDS = new Set([
  'action', 'actor', 'actors', 'angle', 'beat', 'camera', 'close', 'closeup',
  'continuity', 'expression', 'focus', 'focused', 'framing', 'identity',
  'image', 'location', 'medium', 'motion', 'profile', 'readable', 'scene',
  'setting', 'shot', 'single', 'state', 'still', 'subject', 'timing', 'video',
  'visible', 'wide', 'zoom'
]);

const CAMERA_VISIBLE_TEXT_FIELDS = [
  'stillPrompt',
  'imageDescription',
  'motionCue',
  'cameraCue',
  'videoPrompt',
  'singleImagePrompt',
];

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

const tokenizeWordstreamKeywords = (value) => normalizeString(value)
  .toLowerCase()
  .replace(/[^a-z0-9\s]/g, ' ')
  .split(/\s+/)
  .filter(Boolean);

const isWordstreamNoise = (word) => {
  const normalized = normalizeKeyword(word);
  return COMMON_FUNCTION_WORDS.has(normalized) || PROMPT_CONTROL_WORDS.has(normalized);
};

const extractWordstreamKeywords = (value, minLength = 4) => tokenizeWordstreamKeywords(value)
  .map(normalizeKeyword)
  .filter((word) => word.length >= minLength && !isWordstreamNoise(word));

const compactCueLabel = (value, maxWords = 4) => extractWordstreamKeywords(value, 3)
  .slice(0, maxWords)
  .join(' ');

const collectVisibleContextKeywords = (storyContext = {}) => new Set([
  ...extractWordstreamKeywords(storyContext.location, 3),
  ...extractWordstreamKeywords(storyContext.locationSummary, 3),
  ...extractWordstreamKeywords(storyContext.setupSummary, 3),
  ...extractWordstreamKeywords(storyContext.description, 3),
  ...extractWordstreamKeywords(storyContext.actorIdentity, 3),
  ...extractWordstreamKeywords(storyContext.actorSummary, 3),
]);

const collectSpatialContextKeywords = (storyContext = {}) => new Set([
  ...extractWordstreamKeywords(storyContext.location, 3),
  ...extractWordstreamKeywords(storyContext.locationSummary, 3),
  ...extractWordstreamKeywords(storyContext.setupSummary, 3),
  ...extractWordstreamKeywords(storyContext.description, 3),
]);

const MISSING_ACTOR_PATTERN = /\b(?:none visible|none visibly present|no visible (?:actor|person)|no person visible|no actor visible)\b/i;
const ACTOR_LANGUAGE_PATTERN = /\b(?:he|his|him|she|her|hers|man|woman|person|people|figure|subject|face|eyes?|mouth|jaw|chin|hands?|shoulders?|torso|posture|breath)\b/i;
const ROOM_ONLY_ANCHOR_REPLACEMENTS = [
  [/\bbehind him\b/gi, 'on the back wall'],
  [/\bbehind her\b/gi, 'on the back wall'],
  [/\bnear him\b/gi, 'near the frame edge'],
  [/\bnear her\b/gi, 'near the frame edge'],
];

const normalizeCueSignature = (value) => normalizeString(value)
  .toLowerCase()
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const escapeRegex = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const hashCueText = (value) => [...normalizeCueSignature(value)]
  .reduce((total, character) => ((total * 33) + character.charCodeAt(0)) >>> 0, 5381);

const WORDSTREAM_FIELD_LABEL_PATTERN = /^(?:same actor|same location|keep readable|identity lock|framing lock|beat|story beat|storybeat|motion|camera|continuity|action|description|setup):\s*/i;
const GENERIC_SCENE_PATTERN = /\b(?:same room|same shot|holding still|barely moves|the shot holds|scene remains quiet|the room feels tense)\b/i;
const MOTION_LANGUAGE_PATTERN = /\b(?:turn|tilt|shift|lean|flinch|brace|recoil|glance|stare|look|raise|lower|tighten|relax|move|jerk|twitch|clench|open|close|step|hold|breathe|breath|scan|fix|settle|gather|check|hesitate|examine)\b/i;
const CAMERA_LANGUAGE_PATTERN = /\b(?:camera|framing|crop|push|drift|reframe|zoom|tilt|pan|hold|tighten|widen|follow|edge|press|pull)\b/i;

const stripWordstreamFieldLead = (value) => normalizeString(value)
  .replace(WORDSTREAM_FIELD_LABEL_PATTERN, '')
  .replace(/^the shot captures\s+/i, '')
  .replace(/^the image shows\s+/i, '')
  .replace(/^the frame shows\s+/i, '')
  .replace(/^appears to be\s+/i, '')
  .replace(/^there is\s+/i, '')
  .replace(/^subject is\s+/i, '')
  .replace(/^a shot of\s+/i, '')
  .replace(/^the same\s+/i, '')
  .trim();

const stripCueTextForEntityCheck = (value, cueText = '') => {
  let normalized = normalizeString(value);
  const cueVariants = [
    normalizeString(cueText),
    compactCueLabel(cueText),
  ].filter(Boolean);

  cueVariants.forEach((cueVariant) => {
    normalized = normalized.replace(new RegExp(escapeRegex(cueVariant), 'ig'), ' ');
    normalized = normalized.replace(new RegExp(`"${escapeRegex(cueVariant)}"`, 'ig'), ' ');
  });

  return normalized.replace(/\s+/g, ' ').trim();
};

const splitWordstreamFragments = (value) => normalizeString(value)
  .replace(/[()[\]]/g, ' ')
  .split(/\s*(?:[.!?;]|\n|\|)\s*/)
  .flatMap((part) => part.split(/\s*,\s*/))
  .map(stripWordstreamFieldLead)
  .filter(Boolean);

const compactWordstreamFragment = (value, maxWords = 14) => normalizeString(value)
  .replace(/\s+/g, ' ')
  .split(' ')
  .filter(Boolean)
  .slice(0, maxWords)
  .join(' ')
  .trim();

const buildWordstreamFragmentSignature = (value) => createFieldKeywordSignature(value)
  || normalizeCueSignature(value);

const extractNovelContentRuns = ({
  value = '',
  storyContext = {},
  cueText = '',
} = {}) => {
  const visibleKeywords = collectVisibleContextKeywords(storyContext);
  const sanitizedValue = stripCueTextForEntityCheck(value, cueText);
  const tokens = tokenizeWordstreamKeywords(sanitizedValue).map(normalizeKeyword);
  const runs = [];
  let currentRun = [];

  const flushRun = () => {
    const uniqueRun = [...new Set(currentRun.filter((keyword) => keyword.length >= 4))];
    if (uniqueRun.length >= 2) {
      runs.push(uniqueRun.join(' '));
    }
    currentRun = [];
  };

  tokens.forEach((token) => {
    if (!token || COMMON_FUNCTION_WORDS.has(token) || PROMPT_CONTROL_WORDS.has(token)) {
      return;
    }
    if (token.endsWith('ly')) {
      return;
    }
    if (
      visibleKeywords.has(token)
      || ACTOR_LANGUAGE_PATTERN.test(token)
      || MOTION_LANGUAGE_PATTERN.test(token)
      || CAMERA_LANGUAGE_PATTERN.test(token)
    ) {
      flushRun();
      return;
    }
    currentRun.push(token);
  });

  flushRun();
  return [...new Set(runs)];
};

const collectWordstreamFragments = ({
  scene = {},
  storyContext = {},
} = {}) => {
  const fragments = [];
  const pushFragments = (value, {
    field = '',
    kind = 'visual',
    source = 'scene',
  } = {}) => {
    splitWordstreamFragments(value).forEach((text, index) => {
      const signature = buildWordstreamFragmentSignature(text);
      if (!signature) {
        return;
      }
      fragments.push({
        text,
        field,
        kind,
        source,
        index,
        signature,
      });
    });
  };

  pushFragments(storyContext.locationSummary || storyContext.location, {
    field: 'location',
    kind: 'spatial',
    source: 'context',
  });
  pushFragments(storyContext.setupSummary, {
    field: 'setupSummary',
    kind: 'visual',
    source: 'context',
  });
  pushFragments(storyContext.description, {
    field: 'description',
    kind: 'visual',
    source: 'context',
  });
  pushFragments(scene.beat, { field: 'beat', kind: 'beat' });
  pushFragments(scene.storyBeat, { field: 'storyBeat', kind: 'beat' });
  pushFragments(scene.motionCue, { field: 'motionCue', kind: 'motion' });
  pushFragments(scene.cameraCue, { field: 'cameraCue', kind: 'camera' });
  pushFragments(scene.stillPrompt, { field: 'stillPrompt', kind: 'visual' });
  pushFragments(scene.imageDescription, { field: 'imageDescription', kind: 'visual' });

  return fragments;
};

const scoreWordstreamFragment = (fragment, {
  cueText = '',
  storyContext = {},
  actorVisible = true,
  preferActor = false,
  preferSpatial = false,
  preferCamera = false,
  preferMotion = false,
  avoidSignatures = new Set(),
  sceneIndex = 0,
} = {}) => {
  if (!fragment?.text) {
    return Number.NEGATIVE_INFINITY;
  }

  const cueKeywords = extractWordstreamKeywords(cueText, 3);
  const fragmentKeywords = extractWordstreamKeywords(fragment.text, 3);
  const fragmentKeywordSet = new Set(fragmentKeywords);
  const visibleKeywords = collectVisibleContextKeywords(storyContext);
  const cueOverlap = cueKeywords.filter((keyword) => fragmentKeywordSet.has(keyword)).length;
  const visibleOverlap = [...fragmentKeywordSet].filter((keyword) => visibleKeywords.has(keyword)).length;
  const weakPlaceholder = GENERIC_SCENE_PATTERN.test(fragment.text);
  const unsupportedEntities = extractNovelContentRuns({
    value: fragment.text,
    storyContext,
    cueText,
  });

  let score = fragmentKeywords.length;
  score += cueOverlap * 6;
  score += visibleOverlap * 2;

  if (fragment.source === 'context') {
    score += 2;
  }
  if (preferActor && (fieldContainsActorLanguage(fragment.text) || fragment.kind === 'motion')) {
    score += 4;
  }
  if (preferSpatial && (fieldContainsSpatialSignal(fragment.text, storyContext) || fragment.kind === 'spatial')) {
    score += 5;
  }
  if (preferCamera && fragment.kind === 'camera') {
    score += 5;
  }
  if (preferMotion && fragment.kind === 'motion') {
    score += 5;
  }
  if (!actorVisible && fieldContainsActorLanguage(fragment.text)) {
    score -= 12;
  }
  if (avoidSignatures.has(fragment.signature)) {
    score -= 8;
  }
  if (weakPlaceholder) {
    score -= 6;
  }
  if (unsupportedEntities.length > 0) {
    score -= 24;
  }
  if (fieldLooksWeak(fragment.text, {
    cueText,
    storyContext,
    actorVisible,
    minKeywordCount: 3,
  })) {
    score -= 2;
  }

  return score + (((hashCueText(cueText) + sceneIndex + fragment.index) % 17) / 100);
};

const pickWordstreamFragment = (fragments = [], options = {}) => fragments
  .map((fragment) => ({
    fragment,
    score: scoreWordstreamFragment(fragment, options),
  }))
  .sort((left, right) => right.score - left.score)
  .find(({ score }) => Number.isFinite(score) && score > 0)?.fragment || null;

const ensureWordstreamSentence = (value) => {
  const normalized = normalizeString(value);
  if (!normalized) {
    return '';
  }
  const capitalized = normalized.charAt(0).toUpperCase() + normalized.slice(1);
  return /[.!?]$/.test(capitalized) ? capitalized : `${capitalized}.`;
};

const fragmentSupportsMotion = (fragment, actorVisible = true) => {
  if (!fragment?.text) {
    return false;
  }
  if (!actorVisible) {
    return fieldContainsSpatialSignal(fragment.text, { location: fragment.text, locationSummary: fragment.text });
  }
  return fragment.kind === 'motion'
    || (fieldContainsActorLanguage(fragment.text) && MOTION_LANGUAGE_PATTERN.test(fragment.text));
};

const fragmentSupportsCamera = (fragment) => {
  if (!fragment?.text) {
    return false;
  }
  return fragment.kind === 'camera' || CAMERA_LANGUAGE_PATTERN.test(fragment.text);
};


const joinPromptFragments = (...values) => {
  const seen = new Set();
  return values
    .flat()
    .map((value) => compactWordstreamFragment(value, 22))
    .filter((value) => {
      const signature = normalizeCueSignature(value);
      if (!signature || seen.has(signature)) {
        return false;
      }
      seen.add(signature);
      return true;
    })
    .join(', ');
};

const toCueFragment = (cueText = '') => {
  const compact = compactWordstreamFragment(normalizeString(cueText), 10);
  return compact || compactCueLabel(cueText) || '';
};

const toCueTitle = (cueText = '', fallback = '', sceneIndex = 0) => {
  const titleSource = compactWordstreamFragment(normalizeString(cueText), 6)
    || compactWordstreamFragment(fallback, 6)
    || `scene ${sceneIndex + 1}`;

  return titleSource
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const joinUniqueWordstreamSentences = (...values) => {
  const seen = new Set();
  return values
    .map((value) => ensureWordstreamSentence(value))
    .filter((value) => {
      const signature = normalizeCueSignature(value);
      if (!signature || seen.has(signature)) {
        return false;
      }
      seen.add(signature);
      return true;
    })
    .join(' ');
};

const sanitizeVisibleActorSummary = (value) => {
  const normalized = normalizeString(value);
  if (!normalized || MISSING_ACTOR_PATTERN.test(normalized)) {
    return '';
  }
  return normalized;
};

const hasVisibleActorInStoryContext = (storyContext = {}) => Boolean(
  sanitizeVisibleActorSummary(
    summarizeVisionActorIdentity(storyContext.actors)
      || summarizeVisionActors(storyContext.actors)
      || storyContext.actorIdentity
      || storyContext.actorSummary
  )
);

const normalizeRoomAnchorForScene = (value, actorVisible = true) => {
  let normalized = normalizeString(value);
  if (!normalized) {
    return 'the same room geometry';
  }
  if (actorVisible) {
    return normalized;
  }
  ROOM_ONLY_ANCHOR_REPLACEMENTS.forEach(([pattern, replacement]) => {
    normalized = normalized.replace(pattern, replacement);
  });
  return normalized;
};

const createFieldKeywordSignature = (value, excludedKeywords = []) => {
  const excluded = new Set(excludedKeywords.map((keyword) => normalizeKeyword(keyword)));
  return extractWordstreamKeywords(value, 3)
    .filter((keyword) => !excluded.has(keyword))
    .join(' ');
};

const fieldContainsCueLanguage = (value, cueText = '') => {
  const text = normalizeCueSignature(value);
  if (!text) {
    return false;
  }
  const cueLabel = compactCueLabel(cueText);
  if (cueLabel && text.includes(cueLabel)) {
    return true;
  }
  const cueKeywords = extractWordstreamKeywords(cueText, 3);
  if (cueKeywords.length === 0) {
    return false;
  }
  const fieldKeywords = new Set(extractWordstreamKeywords(value, 3));
  return cueKeywords.some((keyword) => fieldKeywords.has(keyword));
};

const fieldStronglyContainsCueLanguage = (value, cueText = '') => {
  const text = normalizeCueSignature(value);
  const cueLabel = compactCueLabel(cueText);
  if (!text || !cueLabel) {
    return false;
  }
  if (text.includes(cueLabel)) {
    return true;
  }
  const cueKeywords = extractWordstreamKeywords(cueText, 3);
  if (cueKeywords.length < 2) {
    return fieldContainsCueLanguage(value, cueText);
  }
  const fieldKeywords = new Set(extractWordstreamKeywords(value, 3));
  const overlap = cueKeywords.filter((keyword) => fieldKeywords.has(keyword));
  return overlap.length >= Math.min(2, cueKeywords.length);
};

const fieldContainsActorLanguage = (value) => ACTOR_LANGUAGE_PATTERN.test(normalizeString(value));

const fieldContainsRoomSignal = (value, storyContext = {}) => {
  const visibleKeywords = collectVisibleContextKeywords(storyContext);
  const fieldKeywords = extractWordstreamKeywords(value, 3);
  return fieldKeywords.some((keyword) => visibleKeywords.has(keyword));
};

const fieldContainsSpatialSignal = (value, storyContext = {}) => {
  const spatialKeywords = collectSpatialContextKeywords(storyContext);
  const fieldKeywords = extractWordstreamKeywords(value, 3);
  return fieldKeywords.some((keyword) => spatialKeywords.has(keyword));
};

const fieldLooksWeak = (value, {
  cueText = '',
  previousValue = '',
  storyContext = {},
  actorVisible = true,
  minKeywordCount = 4,
  requireSpatialSignal = false,
} = {}) => {
  const normalized = normalizeString(value);
  if (!normalized) {
    return true;
  }
  if (!actorVisible && fieldContainsActorLanguage(normalized)) {
    return true;
  }

  const currentSignature = createFieldKeywordSignature(normalized, extractWordstreamKeywords(cueText, 3));
  const previousSignature = createFieldKeywordSignature(previousValue, extractWordstreamKeywords(cueText, 3));
  if (currentSignature && previousSignature && currentSignature === previousSignature) {
    return true;
  }

  const keywordCount = extractWordstreamKeywords(normalized, 3).length;
  if (keywordCount < minKeywordCount && !fieldContainsCueLanguage(normalized, cueText) && !fieldContainsRoomSignal(normalized, storyContext)) {
    return true;
  }
  if (requireSpatialSignal && !fieldContainsCueLanguage(normalized, cueText) && !fieldContainsSpatialSignal(normalized, storyContext)) {
    return true;
  }

  return false;
};

const sceneContainsActorLanguage = (scene = {}) => [
  scene.beat,
  scene.storyBeat,
  scene.motionCue,
  scene.cameraCue,
  scene.stillPrompt,
  scene.imageDescription,
  scene.videoPrompt,
  scene.singleImagePrompt,
].some((value) => fieldContainsActorLanguage(value));

const buildSceneDominantSignature = (scene = {}, cueText = '') => [
  createFieldKeywordSignature(scene.beat, extractWordstreamKeywords(cueText, 3)),
  createFieldKeywordSignature(scene.storyBeat, extractWordstreamKeywords(cueText, 3)),
  createFieldKeywordSignature(scene.motionCue, extractWordstreamKeywords(cueText, 3)),
  createFieldKeywordSignature(scene.cameraCue, extractWordstreamKeywords(cueText, 3)),
].filter(Boolean).join('|');

const findUnsupportedEntitiesInFields = (
  scene = {},
  storyContext = {},
  fields = CAMERA_VISIBLE_TEXT_FIELDS,
  cueText = ''
) => {
  const unsupported = new Set();

  fields.forEach((field) => {
    extractNovelContentRuns({
      value: scene?.[field],
      storyContext,
      cueText,
    }).forEach((entry) => unsupported.add(entry));
  });

  return [...unsupported];
};

const stripLeadingIn = (value) => String(value || '').replace(/^in\s+/i, '').trim();

const GENERIC_LOCATION_WORDS = new Set([
  'indoor', 'interior', 'room', 'space', 'area', 'facility', 'building', 'place',
  'hallway', 'corridor'
]);

const buildStableLocationText = ({
  storyContext = {},
  fragments = [],
} = {}) => {
  const baseLocation = stripLeadingIn(
    summarizeVisionLocation(storyContext.location)
      || storyContext.locationSummary
      || storyContext.location
      || ''
  );
  const baseKeywords = extractWordstreamKeywords(baseLocation, 3);
  const baseIsGeneric = baseKeywords.length === 0
    || baseKeywords.every((keyword) => GENERIC_LOCATION_WORDS.has(keyword));
  const parts = [];
  const seen = new Set();
  const addPart = (value, maxWords = 14) => {
    const text = compactWordstreamFragment(value, maxWords);
    const signature = normalizeCueSignature(text);
    if (!text || !signature || seen.has(signature)) {
      return;
    }
    seen.add(signature);
    parts.push(text);
  };

  if (baseLocation && !baseIsGeneric) {
    addPart(baseLocation, 10);
  }

  const contextFragments = fragments
    .filter((fragment) => fragment.source === 'context')
    .filter((fragment) => !fieldContainsActorLanguage(fragment.text))
    .filter((fragment) => !GENERIC_SCENE_PATTERN.test(fragment.text))
    .sort((left, right) => {
      const scoreField = (fragment) => {
        if (fragment.field === 'description') {
          return 3;
        }
        if (fragment.field === 'location') {
          return 2;
        }
        if (fragment.field === 'setupSummary') {
          return 1;
        }
        return 0;
      };
      return scoreField(right) - scoreField(left);
    });

  for (const fragment of contextFragments) {
    if (parts.length >= 2) {
      break;
    }
    if (!fieldContainsSpatialSignal(fragment.text, storyContext)) {
      continue;
    }
    addPart(fragment.text, parts.length === 0 ? 16 : 12);
  }

  if (parts.length === 0 && baseLocation) {
    addPart(baseLocation, 12);
  }

  return parts.join(', ') || 'the same room';
};

const resolveCueInteractionMode = ({
  cueText = '',
  actorVisible = true,
  sceneFlavor = 'default',
  sceneIndex = 0,
} = {}) => {
  if (!actorVisible) {
    return 'room';
  }

  const selector = (
    hashCueText(cueText)
    + sceneIndex
    + extractWordstreamKeywords(cueText, 3).length
  ) % 4;
  const normalizedFlavor = normalizeString(sceneFlavor).toLowerCase();

  if (normalizedFlavor === 'ltxtrippy') {
    return ['both', 'room', 'subject', 'both'][selector];
  }

  return ['both', 'subject', 'room', 'both'][selector];
};

const buildCueInteractionTargetText = ({
  interactionMode = 'both',
  actorVisible = true,
  actorText = '',
  roomFocus = '',
  locationText = '',
} = {}) => {
  const subjectAnchor = compactWordstreamFragment(
    sanitizeVisibleActorSummary(actorText),
    9
  ) || (actorVisible ? 'the visible subject' : '');
  const roomAnchor = compactWordstreamFragment(
    roomFocus || locationText,
    9
  ) || 'the visible room';

  if (interactionMode === 'subject') {
    return {
      subjectAnchor: subjectAnchor || 'the visible subject',
      roomAnchor,
      beatLead: `${subjectAnchor || 'the visible subject'} takes the cue first`,
      storyLead: `${subjectAnchor || 'the visible subject'} carries the cue while ${roomAnchor} stays under pressure`,
      motionFallback: `${subjectAnchor || 'the visible subject'} shifts posture and gaze toward ${roomAnchor}`,
      cameraFallback: `the camera edges toward ${subjectAnchor || 'the visible subject'} while keeping ${roomAnchor} readable`,
    };
  }

  if (interactionMode === 'room') {
    return {
      subjectAnchor: subjectAnchor || 'the shot',
      roomAnchor,
      beatLead: `${roomAnchor} takes the cue pressure`,
      storyLead: `${roomAnchor} starts carrying the cue around ${subjectAnchor || 'the shot'}`,
      motionFallback: `${roomAnchor} changes through light, framing pressure, and internal movement`,
      cameraFallback: actorVisible
        ? `the camera drifts toward ${roomAnchor} while holding ${subjectAnchor || 'the visible subject'} in frame`
        : `the camera drifts across ${roomAnchor} while holding the room geometry readable`,
    };
  }

  return {
    subjectAnchor: subjectAnchor || 'the visible subject',
    roomAnchor,
    beatLead: `${subjectAnchor || 'the visible subject'} and ${roomAnchor} take the cue together`,
    storyLead: `${subjectAnchor || 'the visible subject'} and ${roomAnchor} answer each other under the cue pressure`,
    motionFallback: actorVisible
      ? `${subjectAnchor || 'the visible subject'} reacts while ${roomAnchor} changes around them`
      : `${roomAnchor} changes across the shot as the cue spreads through the frame`,
    cameraFallback: actorVisible
      ? `the camera tracks between ${subjectAnchor || 'the visible subject'} and ${roomAnchor} without losing either`
      : `the camera tracks across ${roomAnchor} while the frame keeps changing under the cue`,
  };
};

const pickGeneratedRoomFocus = ({
  fragments = [],
  storyContext = {},
  cueText = '',
  actorVisible = true,
  sceneIndex = 0,
} = {}) => {
  const fragment = pickWordstreamFragment(fragments, {
    cueText,
    storyContext,
    actorVisible,
    preferSpatial: true,
    sceneIndex,
  });
  if (fragment?.text) {
    return compactWordstreamFragment(fragment.text, 10);
  }

  const location = compactWordstreamFragment(
    stripLeadingIn(storyContext.locationSummary || storyContext.location || ''),
    10
  );
  return location || 'the visible room';
};

const buildGeneratedWordstreamMotion = ({
  fragments = [],
  storyContext = {},
  cueText = '',
  actorVisible = true,
  roomFocus = '',
  avoidSignatures = new Set(),
  sceneIndex = 0,
} = {}) => {
  const selectedFragment = pickWordstreamFragment(fragments, {
    cueText,
    storyContext,
    actorVisible,
    preferActor: actorVisible,
    preferMotion: true,
    preferSpatial: !actorVisible,
    avoidSignatures,
    sceneIndex,
  });
  const fragment = fragmentSupportsMotion(selectedFragment, actorVisible) ? selectedFragment : null;
  const fallbackFragment = actorVisible
    ? compactWordstreamFragment(joinPromptFragments(cueText, roomFocus), 18)
    : compactWordstreamFragment(joinPromptFragments(cueText, storyContext.description, roomFocus), 18);

  return {
    text: compactWordstreamFragment(fragment?.text || fallbackFragment, 18),
    signature: fragment?.signature || normalizeCueSignature(`${cueText} ${roomFocus} motion`),
  };
};

const buildGeneratedWordstreamCamera = ({
  fragments = [],
  storyContext = {},
  cueText = '',
  actorVisible = true,
  roomFocus = '',
  avoidSignatures = new Set(),
  sceneIndex = 0,
} = {}) => {
  const selectedFragment = pickWordstreamFragment(fragments, {
    cueText,
    storyContext,
    actorVisible,
    preferCamera: true,
    preferSpatial: true,
    avoidSignatures,
    sceneIndex,
  });
  const fragment = fragmentSupportsCamera(selectedFragment) && !fieldLooksWeak(selectedFragment?.text, {
    cueText,
    storyContext,
    actorVisible,
    minKeywordCount: 3,
  }) && !GENERIC_SCENE_PATTERN.test(selectedFragment?.text || '')
    ? selectedFragment
    : null;
  const fallbackFragment = compactWordstreamFragment(
    joinPromptFragments(roomFocus, storyContext.setupSummary, cueText),
    18
  );

  return {
    text: compactWordstreamFragment(fragment?.text || fallbackFragment, 18),
    signature: fragment?.signature || normalizeCueSignature(`${cueText} ${roomFocus} camera`),
  };
};

const buildGeneratedWordstreamVisual = ({
  fragments = [],
  storyContext = {},
  cueText = '',
  actorVisible = true,
  avoidSignatures = new Set(),
  sceneIndex = 0,
} = {}) => {
  const fragment = pickWordstreamFragment(fragments, {
    cueText,
    storyContext,
    actorVisible,
    preferSpatial: true,
    avoidSignatures,
    sceneIndex,
  });
  return {
    text: compactWordstreamFragment(
      fragment?.text
      || joinPromptFragments(storyContext.description, storyContext.setupSummary, cueText),
      18
    ),
    signature: fragment?.signature || normalizeCueSignature(`${cueText} visual`),
  };
};

const buildWordstreamSceneProfile = ({
  scene = {},
  previousScene = null,
  cueText = '',
  storyContext = {},
  sceneFlavor = 'default',
  sceneIndex = 0,
} = {}) => {
  const actorVisible = hasVisibleActorInStoryContext(storyContext);
  const actorText = sanitizeVisibleActorSummary(
    summarizeVisionActorIdentity(storyContext.actors)
      || summarizeVisionActors(storyContext.actors)
      || storyContext.actorIdentity
      || storyContext.actorSummary
  );
  const fragments = collectWordstreamFragments({
    scene,
    storyContext,
  });
  const locationText = buildStableLocationText({
    storyContext,
    fragments,
  });
  const cueLabel = compactCueLabel(cueText) || normalizeString(cueText) || '';
  const cueTextValue = normalizeString(cueText) || cueLabel;
  const interactionMode = resolveCueInteractionMode({
    cueText: cueTextValue,
    actorVisible,
    sceneFlavor,
    sceneIndex,
  });
  const roomFocus = normalizeRoomAnchorForScene(
    pickGeneratedRoomFocus({
      fragments,
      storyContext,
      cueText,
      actorVisible,
      sceneIndex,
    }),
    actorVisible
  );
  const interaction = buildCueInteractionTargetText({
    interactionMode,
    actorVisible,
    actorText,
    roomFocus,
    locationText,
  });
  const usedSignatures = new Set([
    buildWordstreamFragmentSignature(previousScene?.beat),
    buildWordstreamFragmentSignature(previousScene?.motionCue),
    buildWordstreamFragmentSignature(previousScene?.cameraCue),
  ].filter(Boolean));
  const visualFocus = buildGeneratedWordstreamVisual({
    fragments,
    storyContext,
    cueText,
    actorVisible,
    avoidSignatures: usedSignatures,
    sceneIndex,
  });
  usedSignatures.add(visualFocus.signature);
  const motion = buildGeneratedWordstreamMotion({
    fragments,
    storyContext,
    cueText: cueTextValue,
    actorVisible,
    roomFocus,
    avoidSignatures: usedSignatures,
    sceneIndex,
  });
  const motionText = !fieldLooksWeak(motion.text, {
    cueText: cueTextValue,
    previousValue: previousScene?.motionCue,
    storyContext,
    actorVisible,
    minKeywordCount: 4,
  })
    ? motion.text
    : compactWordstreamFragment(interaction.motionFallback, 18);
  usedSignatures.add(motion.signature);
  const camera = buildGeneratedWordstreamCamera({
    fragments,
    storyContext,
    cueText: cueTextValue,
    actorVisible,
    roomFocus,
    avoidSignatures: usedSignatures,
    sceneIndex,
  });
  const cameraText = !fieldLooksWeak(camera.text, {
    cueText: cueTextValue,
    previousValue: previousScene?.cameraCue,
    storyContext,
    actorVisible,
    minKeywordCount: 4,
  })
    ? camera.text
    : compactWordstreamFragment(interaction.cameraFallback, 18);
  const visibleFragment = visualFocus.text || joinPromptFragments(locationText, roomFocus);
  const beat = joinUniqueWordstreamSentences(
    cueTextValue,
    interaction.beatLead,
    visibleFragment,
    motionText
  );
  const storyBeat = joinUniqueWordstreamSentences(
    cueTextValue,
    interaction.storyLead,
    actorVisible ? actorText : '',
    locationText,
    visibleFragment,
  );
  const stillPrompt = joinPromptFragments(
    actorVisible ? actorText : '',
    locationText,
    visibleFragment,
    roomFocus,
  );
  const imageDescription = joinUniqueWordstreamSentences(
    joinPromptFragments(actorVisible ? actorText : '', locationText),
    visibleFragment,
    roomFocus,
  );
  const videoPrompt = joinUniqueWordstreamSentences(beat, motionText, cameraText);
  const singleImagePrompt = joinUniqueWordstreamSentences(stillPrompt, motionText, interaction.storyLead);

  return {
    title: toCueTitle(cueTextValue, scene.title, sceneIndex),
    beat,
    stillPrompt,
    imageDescription,
    storyBeat,
    motionCue: motionText,
    cameraCue: cameraText,
    videoPrompt,
    singleImagePrompt,
  };
};

const refineSceneFromWordstream = ({
  scene = {},
  previousScene = null,
  storyContext = {},
  sourceCues = [],
  sceneFlavor = 'default',
  sceneIndex = 0,
} = {}) => {
  const cueText = sourceCues[sceneIndex] || sourceCues[sourceCues.length - 1] || '';
  const previousCueText = sourceCues[sceneIndex - 1] || cueText;
  const actorVisible = hasVisibleActorInStoryContext(storyContext);
  const unsupportedCoreVisibleEntities = findUnsupportedEntitiesInFields(
    scene,
    storyContext,
    ['stillPrompt', 'imageDescription', 'motionCue', 'cameraCue'],
    cueText
  );
  const unsupportedPromptVisibleEntities = findUnsupportedEntitiesInFields(
    scene,
    storyContext,
    ['videoPrompt', 'singleImagePrompt'],
    cueText
  );
  const unsupportedBeatEntities = findUnsupportedEntitiesInFields(
    scene,
    storyContext,
    ['beat'],
    cueText
  );
  const unsupportedStoryBeatEntities = findUnsupportedEntitiesInFields(
    scene,
    storyContext,
    ['storyBeat'],
    cueText
  );
  const repeatedDominantSignature = previousScene
    ? buildSceneDominantSignature(scene, cueText) === buildSceneDominantSignature(previousScene, previousCueText)
    : false;
  const actorMismatch = !actorVisible && sceneContainsActorLanguage(scene);
  const profile = buildWordstreamSceneProfile({
    scene,
    previousScene,
    cueText,
    storyContext,
    sceneFlavor,
    sceneIndex,
  });
  const preservePlannerScene = fieldStronglyContainsCueLanguage(scene.beat, cueText)
    && !repeatedDominantSignature
    && !actorMismatch
    && unsupportedCoreVisibleEntities.length === 0
    && normalizeString(scene.stillPrompt)
    && normalizeString(scene.imageDescription)
    && normalizeString(scene.motionCue)
    && normalizeString(scene.cameraCue)
    && !fieldLooksWeak(scene.motionCue, {
      cueText,
      previousValue: previousScene?.motionCue,
      storyContext,
      actorVisible,
      minKeywordCount: 4,
    })
    && !fieldLooksWeak(scene.cameraCue, {
      cueText,
      previousValue: previousScene?.cameraCue,
      storyContext,
      actorVisible,
      minKeywordCount: 4,
    });

  if (preservePlannerScene) {
    return {
      ...scene,
      title: fieldStronglyContainsCueLanguage(scene.title, cueText) ? scene.title : profile.title,
      storyBeat: fieldContainsCueLanguage(scene.storyBeat, cueText) ? scene.storyBeat : profile.storyBeat,
      videoPrompt: unsupportedPromptVisibleEntities.length > 0 || !normalizeString(scene.videoPrompt)
        ? `${scene.beat} ${scene.motionCue} ${scene.cameraCue}`
        : scene.videoPrompt,
      singleImagePrompt: unsupportedPromptVisibleEntities.length > 0 || !normalizeString(scene.singleImagePrompt)
        ? `${scene.stillPrompt} ${scene.motionCue}`
        : scene.singleImagePrompt,
    };
  }
  const preserveCueDrivenPlannerBeat = fieldStronglyContainsCueLanguage(scene.beat, cueText)
    && unsupportedCoreVisibleEntities.length === 0
    && !repeatedDominantSignature
    && !actorMismatch
    && normalizeString(scene.stillPrompt)
    && normalizeString(scene.motionCue);

  const rewriteVisibleFields = actorMismatch || unsupportedCoreVisibleEntities.length > 0;
  const rewriteDynamicFields = repeatedDominantSignature || actorMismatch;
  const rewriteBeat = !preserveCueDrivenPlannerBeat
    && (
      !normalizeString(scene.beat)
      || rewriteDynamicFields
      || unsupportedBeatEntities.length > 0
    );
  const rewriteStoryBeat = !normalizeString(scene.storyBeat)
    || rewriteDynamicFields
    || !fieldContainsCueLanguage(scene.storyBeat, cueText)
    || unsupportedStoryBeatEntities.length > 0;
  const rewriteMotionCue = !normalizeString(scene.motionCue)
    || rewriteDynamicFields
    || unsupportedCoreVisibleEntities.length > 0
    || fieldLooksWeak(scene.motionCue, {
      cueText,
      previousValue: previousScene?.motionCue,
      storyContext,
      actorVisible,
      minKeywordCount: 4,
    });
  const rewriteCameraCue = !normalizeString(scene.cameraCue)
    || rewriteDynamicFields
    || unsupportedCoreVisibleEntities.length > 0
    || fieldLooksWeak(scene.cameraCue, {
      cueText,
      previousValue: previousScene?.cameraCue,
      storyContext,
      actorVisible,
      minKeywordCount: 4,
    });
  const rewriteStillPrompt = !normalizeString(scene.stillPrompt) || rewriteVisibleFields;
  const rewriteImageDescription = !normalizeString(scene.imageDescription) || rewriteVisibleFields;

  const nextScene = {
    ...scene,
    title: fieldStronglyContainsCueLanguage(scene.title, cueText) ? scene.title : profile.title,
    beat: rewriteBeat ? profile.beat : scene.beat,
    storyBeat: rewriteStoryBeat ? profile.storyBeat : scene.storyBeat,
    motionCue: rewriteMotionCue ? profile.motionCue : scene.motionCue,
    cameraCue: rewriteCameraCue ? profile.cameraCue : scene.cameraCue,
    stillPrompt: rewriteStillPrompt ? profile.stillPrompt : scene.stillPrompt,
    imageDescription: rewriteImageDescription ? profile.imageDescription : scene.imageDescription,
  };

  const shouldRewriteVideoPrompt = rewriteVisibleFields
    || rewriteDynamicFields
    || rewriteBeat
    || rewriteMotionCue
    || rewriteCameraCue
    || rewriteStillPrompt
    || rewriteImageDescription
    || unsupportedPromptVisibleEntities.length > 0
    || !normalizeString(scene.videoPrompt);
  const shouldRewriteSingleImagePrompt = rewriteVisibleFields
    || rewriteDynamicFields
    || rewriteStillPrompt
    || rewriteMotionCue
    || unsupportedPromptVisibleEntities.length > 0
    || !normalizeString(scene.singleImagePrompt);

  nextScene.videoPrompt = shouldRewriteVideoPrompt
    ? `${nextScene.beat} ${nextScene.motionCue} ${nextScene.cameraCue}`
    : scene.videoPrompt;
  nextScene.singleImagePrompt = shouldRewriteSingleImagePrompt
    ? `${nextScene.stillPrompt} ${nextScene.motionCue}`
    : scene.singleImagePrompt;

  return nextScene;
};

const getFrameVisionReader = (getFrameVision) => (
  typeof getFrameVision === 'function'
    ? getFrameVision
    : async () => null
);

const resolveScenePromptDurationSeconds = ({
  scenePlanEntry,
  sceneContext,
  nextSceneDuration,
} = {}) => {
  const contextDuration = Number(sceneContext?.durationSeconds);
  if (Number.isFinite(contextDuration) && contextDuration > 0) {
    return contextDuration;
  }

  const requestedDuration = Number(scenePlanEntry?.requestedDurationSeconds);
  if (Number.isFinite(requestedDuration) && requestedDuration > 0) {
    return requestedDuration;
  }

  const plannedDuration = Number(scenePlanEntry?.durationSeconds);
  if (Number.isFinite(plannedDuration) && plannedDuration > 0) {
    return plannedDuration;
  }

  const fallbackDuration = Number(
    typeof nextSceneDuration === 'function' ? nextSceneDuration() : null
  );
  if (Number.isFinite(fallbackDuration) && fallbackDuration > 0) {
    return fallbackDuration;
  }

  return null;
};

export const resolveWebcamVisionSettings = ({
  middlePrompt,
  testPrompt,
  middleProviders,
  testProviders,
} = {}) => ({
  prompt: resolveFreshwebVisionPrompt(middlePrompt, testPrompt),
  providers: resolveFreshwebVisionProviders(middleProviders, testProviders),
});

export const resolveWebcamScenePlanSystemPrompt = ({
  configMode = 'generated',
  scenePlanSystemPrompt = '',
  cameraScenePlanSystemPrompt = '',
  sceneFlavor = 'default',
} = {}) => {
  const normalizedScenePrompt = normalizeString(scenePlanSystemPrompt);
  const normalizedCameraPrompt = normalizeString(cameraScenePlanSystemPrompt);
  const isTrippyFlavor = normalizeString(sceneFlavor).toLowerCase() === 'ltxtrippy';

  if (configMode === 'camera') {
    const basePrompt = normalizedCameraPrompt
      || normalizedScenePrompt
      || DEFAULT_WEBCAM_CAMERA_SCENE_SYSTEM_PROMPT;
    return isTrippyFlavor
      ? `${basePrompt} ${TRIPPY_CAMERA_SCENE_PROMPT_APPENDIX}`
      : basePrompt;
  }

  return normalizedScenePrompt || DEFAULT_SCENE_SYSTEM_PROMPT;
};

export const createWebcamVisionStoreHandler = ({ prompt = '' } = {}) => async ({
  imagePath,
  outputText,
  result,
}) => {
  const marker = `${path.sep}parts${path.sep}`;
  const markerIndex = String(imagePath || '').indexOf(marker);
  if (markerIndex < 0) {
    return;
  }

  const runRoot = imagePath.slice(0, markerIndex);
  const visionDir = path.join(runRoot, 'parts', 'vision-store');
  await fs.ensureDir(visionDir);
  const targetPath = path.join(
    visionDir,
    `${path.basename(imagePath).replace(path.extname(imagePath), '')}.vision.json`
  );
  await fs.writeJson(targetPath, {
    imagePath,
    outputText,
    provider: result?.provider || '',
    model: result?.model || '',
    prompt,
    timestamp: new Date().toISOString(),
  }, { spaces: 2 });
};

export const saveWebcamScenePlanArtifact = async ({
  outputDir,
  fileName = 'scene-generator.camera-snapshot.live-1.json',
  payload = {},
} = {}) => {
  const resolvedOutputDir = typeof outputDir === 'string' && outputDir.trim().length > 0
    ? path.resolve(outputDir)
    : '';

  if (!resolvedOutputDir) {
    return null;
  }

  await fs.ensureDir(resolvedOutputDir);
  const targetPath = path.join(resolvedOutputDir, fileName);
  await fs.writeJson(targetPath, payload, { spaces: 2 });
  return targetPath;
};

export const createWebcamFrameVision = ({
  enabled,
  prompt,
  providers,
  logPrefix = 'freshweb',
  onResult,
} = {}) => createFrameVisionHelper({
  enabled,
  prompt,
  providers,
  logPrefix,
  onResult,
});

export const createWebcamSceneGenerator = ({
  openai,
  model,
  systemPrompt,
  temperature = 0.45,
  top_p = 0.9,
} = {}) => createSceneGenerator({
  openai,
  model,
  systemPrompt,
  temperature,
  top_p,
});

export const createWebcamImagePromptHandler = async (prompt, sceneContext, scenePlanEntry) => {
  if (scenePlanEntry?.stillPrompt) {
    return scenePlanEntry.stillPrompt;
  }
  if (scenePlanEntry?.imageDescription) {
    return scenePlanEntry.imageDescription;
  }
  return buildFallbackStillPrompt(prompt);
};

const buildPreviousSceneMemory = (scenePlan = [], sceneContext = {}) => {
  const currentIndex = Math.max(1, Number(sceneContext?.index || 1));
  if (currentIndex <= 1) {
    return '';
  }

  const previousScenePlanEntry = getScenePlanEntry(scenePlan, { index: currentIndex - 1 });
  if (!previousScenePlanEntry) {
    return '';
  }

  return compactScenePrompt([
    normalizeString(previousScenePlanEntry.storyBeat || previousScenePlanEntry.beat || previousScenePlanEntry.title),
    normalizeString(previousScenePlanEntry.motionCue),
  ].filter(Boolean).join(' '), 1, 16).replace(/[.]+$/g, '').trim();
};

export const createWebcamFirstLastPrompt = ({
  configMode,
  getFrameVision,
  getContinuityFrameVision,
  setActiveSceneDuration,
  nextSceneDuration,
} = {}) => async (startFramePrompt, endFramePrompt, sceneContext, frameContext = {}) => {
  const scenePlanEntry = getScenePlanEntry(frameContext.scenePlan, sceneContext);
  const resolvedDurationSeconds = resolveScenePromptDurationSeconds({
    scenePlanEntry,
    sceneContext,
    nextSceneDuration,
  });
  if (typeof setActiveSceneDuration === 'function') {
    setActiveSceneDuration(resolvedDurationSeconds);
  }

  const readFrameVision = getFrameVisionReader(getFrameVision);
  const readContinuityFrameVision = getFrameVisionReader(getContinuityFrameVision);
  const continuityVision = await readContinuityFrameVision(frameContext.startFrame, {
    sceneContext,
    frameContext,
    role: 'continuity',
  });
  const previousSceneMemory = buildPreviousSceneMemory(frameContext.scenePlan, sceneContext);
  const startVision = continuityVision || await readFrameVision(frameContext.startFrame);
  const endVision = await readFrameVision(frameContext.endFrame);
  const plannedPrompt = scenePlanEntry?.videoPrompt || buildFallbackVideoPrompt(
    scenePlanEntry,
    `${startFramePrompt} ${endFramePrompt}` || 'Continue into the next destination scene.'
  );

  if (configMode === 'camera') {
    return buildCameraGroundedPrompt({
      basePrompt: plannedPrompt,
      storyBeat: scenePlanEntry?.beat || scenePlanEntry?.storyBeat,
      stillPrompt: scenePlanEntry?.stillPrompt,
      imageDescription: scenePlanEntry?.imageDescription,
      durationSeconds: resolvedDurationSeconds,
      motionCue: scenePlanEntry?.motionCue,
      cameraCue: scenePlanEntry?.cameraCue,
      startVision,
      endVision,
      useSingleImage: false,
      previousSceneMemory,
    });
  }

  if (plannedPrompt) {
    return buildVisionAwarePrompt({
      basePrompt: plannedPrompt,
      startVision,
      endVision,
      durationSeconds: resolvedDurationSeconds,
      useSingleImage: false,
    });
  }

  return buildVisionAwarePrompt({
    basePrompt: buildFallbackVideoPrompt(
      scenePlanEntry,
      `${startFramePrompt} ${endFramePrompt}` || 'Continue into the next destination scene.'
    ),
    startVision,
    endVision,
    durationSeconds: resolvedDurationSeconds,
    useSingleImage: false,
  });
};

export const createWebcamSingleImagePrompt = ({
  configMode,
  getFrameVision,
  getContinuityFrameVision,
  setActiveSceneDuration,
  nextSceneDuration,
  promptFlavor = 'default',
} = {}) => async (startFramePrompt, sceneContext, frameContext = {}) => {
  const scenePlanEntry = getScenePlanEntry(frameContext.scenePlan, sceneContext);
  const resolvedDurationSeconds = resolveScenePromptDurationSeconds({
    scenePlanEntry,
    sceneContext,
    nextSceneDuration,
  });
  if (typeof setActiveSceneDuration === 'function') {
    setActiveSceneDuration(resolvedDurationSeconds);
  }

  const readFrameVision = getFrameVisionReader(getFrameVision);
  const readContinuityFrameVision = getFrameVisionReader(getContinuityFrameVision);
  const continuityVision = await readContinuityFrameVision(frameContext.startFrame, {
    sceneContext,
    frameContext,
    role: 'continuity',
  });
  const previousSceneMemory = buildPreviousSceneMemory(frameContext.scenePlan, sceneContext);
  const startVision = continuityVision || await readFrameVision(frameContext.startFrame);
  const wasTransitionBeat = scenePlanEntry?.originalVideoMode === 'firstLast'
    && scenePlanEntry?.videoMode === 'singleImage';
  const plannedPrompt = (wasTransitionBeat
    ? scenePlanEntry?.videoPrompt || scenePlanEntry?.singleImagePrompt
    : scenePlanEntry?.singleImagePrompt || scenePlanEntry?.videoPrompt)
    || buildFallbackVideoPrompt(
      scenePlanEntry,
      startFramePrompt || 'Continue the current frame with subtle motion.'
    );

  if (configMode === 'camera') {
    return buildCameraGroundedPrompt({
      basePrompt: plannedPrompt,
      storyBeat: scenePlanEntry?.beat || scenePlanEntry?.storyBeat,
      stillPrompt: scenePlanEntry?.stillPrompt,
      imageDescription: scenePlanEntry?.imageDescription,
      durationSeconds: resolvedDurationSeconds,
      motionCue: scenePlanEntry?.motionCue,
      cameraCue: scenePlanEntry?.cameraCue,
      startVision,
      useSingleImage: true,
      preferDynamicSingleImage: wasTransitionBeat,
      promptFlavor,
      previousSceneMemory,
    });
  }

  if (plannedPrompt) {
    return buildVisionAwarePrompt({
      basePrompt: plannedPrompt,
      startVision,
      durationSeconds: resolvedDurationSeconds,
      useSingleImage: true,
    });
  }

  return buildVisionAwarePrompt({
    basePrompt: buildFallbackVideoPrompt(
      scenePlanEntry,
      startFramePrompt || 'Continue the current frame with subtle motion.'
    ),
    startVision,
    durationSeconds: resolvedDurationSeconds,
    useSingleImage: true,
  });
};

export const captureWebcamImage = ({
  cameraOutputDir,
  cameraFallbackImagePath = '',
  captureOptions = {},
} = {}) => getIamge({
  outputDir: cameraOutputDir,
  ...captureOptions,
  fallbackImagePath: cameraFallbackImagePath || undefined,
});

export const describeWebcamCameraScenePlanIssues = (scenePlan = []) => {
  const issues = [];
  const laterScenes = scenePlan.slice(1);

  scenePlan.forEach((scene, index) => {
    const sceneNumber = index + 1;
    const sceneLabel = `scene ${sceneNumber}`;
    const videoMode = normalizeString(scene?.videoMode);
    const frameSource = normalizeString(scene?.frameSource);
    const useCameraShot = scene?.useCameraShot === true;
    const freshImage = scene?.freshImage === true;

    if (index === 0) {
      if (videoMode !== 'singleImage') {
        issues.push(`${sceneLabel}: opening camera scene must use videoMode "singleImage"`);
      }
      if (frameSource !== 'newImage') {
        issues.push(`${sceneLabel}: opening camera scene must start from frameSource "newImage"`);
      }
      if (!useCameraShot) {
        issues.push(`${sceneLabel}: opening camera scene must set useCameraShot=true`);
      }
      if (!freshImage) {
        issues.push(`${sceneLabel}: opening camera scene must set freshImage=true`);
      }
      return;
    }

    if (videoMode === 'firstLast') {
      if (frameSource !== 'lastFrame') {
        issues.push(`${sceneLabel}: firstLast camera scene must start from frameSource "lastFrame"`);
      }
      if (!useCameraShot) {
        issues.push(`${sceneLabel}: firstLast camera scene must set useCameraShot=true for the fresh webcam destination`);
      }
      return;
    }

    if (videoMode !== 'singleImage') {
      issues.push(`${sceneLabel}: camera scene must use videoMode "singleImage" or "firstLast"`);
      return;
    }

    if (frameSource === 'newImage') {
      issues.push(`${sceneLabel}: later singleImage camera scene must start from frameSource "lastFrame"`);
      if (useCameraShot) {
        issues.push(`${sceneLabel}: later singleImage camera scene must set useCameraShot=false`);
      }
      if (freshImage) {
        issues.push(`${sceneLabel}: later singleImage camera scene must set freshImage=false`);
      }
      return;
    }

    if (frameSource === 'lastFrame') {
      if (useCameraShot) {
        issues.push(`${sceneLabel}: singleImage camera scene with frameSource "lastFrame" must set useCameraShot=false`);
      }
      if (freshImage) {
        issues.push(`${sceneLabel}: singleImage camera scene with frameSource "lastFrame" must set freshImage=false`);
      }
      return;
    }

    issues.push(`${sceneLabel}: camera scene has unsupported frameSource "${frameSource || 'unknown'}"`);
  });

  return issues;
};

export const sanitizeWebcamCameraScenePlan = (
  scenePlan = [],
  {
    visionStoryContext = '',
    sourceCues = [],
    sceneFlavor = 'default',
  } = {}
) => {
  const isTrippyFlavor = normalizeString(sceneFlavor).toLowerCase() === 'ltxtrippy';
  const TRIPPY_REANCHOR_INTERVAL = 2;
  const parsedStoryContext = typeof visionStoryContext === 'string'
    ? extractVisionStoryContext(visionStoryContext)
    : (visionStoryContext || {});
  const hasWordstream = sourceCues.some((cue) => normalizeString(cue).length > 0);
  const hasVisionContext = normalizeString([
    parsedStoryContext.location,
    parsedStoryContext.locationSummary,
    parsedStoryContext.description,
  ].filter(Boolean).join(' ')).length > 0;
  let previousSanitizedScene = null;
  const sanitizedPlan = scenePlan.map((scene, index) => {
    let normalized = { ...scene };
    const isFirst = index === 0;

    if (!isTrippyFlavor && hasWordstream && hasVisionContext) {
      normalized = refineSceneFromWordstream({
        scene: normalized,
        previousScene: previousSanitizedScene,
        storyContext: parsedStoryContext,
        sourceCues,
        sceneFlavor,
        sceneIndex: index,
      });
    }

    normalized = isFirst
      ? {
          ...normalized,
          videoMode: 'singleImage',
          frameSource: 'newImage',
          freshImage: true,
          useCameraShot: true,
        }
      : isTrippyFlavor
        ? (() => {
            const shouldReanchor = ((index + 1) % TRIPPY_REANCHOR_INTERVAL) === 1;
            return shouldReanchor
              ? {
                  ...normalized,
                  videoMode: 'singleImage',
                  frameSource: 'newImage',
                  freshImage: true,
                  useCameraShot: true,
                }
              : {
                  ...normalized,
                  videoMode: 'singleImage',
                  frameSource: 'lastFrame',
                  freshImage: false,
                  useCameraShot: false,
                };
          })()
        : normalized.videoMode === 'firstLast'
        ? {
            ...normalized,
            frameSource: 'lastFrame',
            freshImage: false,
            useCameraShot: true,
          }
        : {
            ...normalized,
            frameSource: 'lastFrame',
            freshImage: false,
            useCameraShot: false,
          };

    previousSanitizedScene = normalized;
    return normalized;
  });
  return sanitizedPlan;
};

export const normalizeWebcamCameraScenePlan = sanitizeWebcamCameraScenePlan;

export const applyWebcamScenePlanVideoModeDefaults = (
  scenePlan = [],
  {
    resolveConfiguredVideoMode,
    scenePlanControlsVideoMode = true,
    firstClipVideoMode = 'singleImage',
  } = {}
) => scenePlan.map((scene, index) => {
  const sceneIndex = index + 1;
  const total = scenePlan.length;
  const isFirst = sceneIndex === 1;
  const isLast = sceneIndex === total;
  const configuredVideoMode = typeof resolveConfiguredVideoMode === 'function'
    ? resolveConfiguredVideoMode({
        index: sceneIndex,
        total,
        isFirst,
        isLast,
      })
    : scene.videoMode;

  return {
    ...scene,
    originalVideoMode: normalizeString(scene?.originalVideoMode) || normalizeString(scene?.videoMode),
    videoMode: isFirst
      ? firstClipVideoMode
      : (scenePlanControlsVideoMode
        ? scene.videoMode
        : configuredVideoMode),
  };
});
