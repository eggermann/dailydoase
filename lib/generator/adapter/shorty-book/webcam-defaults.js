import fs from 'fs-extra';
import path from 'node:path';

import getIamge from '../../../helper/getIamge.js';
import {
  buildFallbackStillPrompt,
  buildFallbackVideoPrompt,
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
  'Translate source cues into visible tension, dread, curiosity, suspicion, shock, relief, obsession, or other concrete states that can be read from posture, gaze, expression, framing, and lighting inside the same room.',
  'In camera mode, let the source cues drive the storybook progression mainly through title, beat, storyBeat, motionCue, cameraCue, and emotional change, not by replacing the visible shot with literal off-screen objects.',
  'In camera mode, favor embodied, visually readable subscene beats over explanatory, analytical, or topic-summary phrasing.',
  'In camera mode, map wordstream changes through visible location emphasis, actor movement, and sensory atmosphere shifts (light, texture, tension) inside the same room.',
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

const normalizeString = (value) => (typeof value === 'string' ? value.trim() : '');

const WORDSTREAM_FUNCTION_WORDS = new Set([
  'a', 'after', 'an', 'and', 'are', 'as', 'at', 'away', 'back', 'be', 'before',
  'behind', 'beside', 'by', 'for', 'from', 'he', 'her', 'him', 'in', 'inside',
  'into', 'is', 'it', 'near', 'of', 'on', 'or', 'out', 'over', 'she', 'the',
  'them', 'they', 'through', 'to', 'under', 'up', 'with'
]);

const WORDSTREAM_META_WORDS = new Set([
  'action', 'actor', 'actors', 'angle', 'beat', 'camera', 'close', 'closeup',
  'continuity', 'expression', 'focus', 'focused', 'framing', 'identity',
  'image', 'location', 'medium', 'motion', 'profile', 'readable', 'scene',
  'setting', 'shot', 'single', 'state', 'still', 'subject', 'timing', 'video',
  'visible', 'wide', 'zoom'
]);

const WORDSTREAM_BODY_WORDS = new Set([
  'arm', 'arms', 'body', 'breathe', 'breath', 'brow', 'chin', 'eye', 'eyes',
  'face', 'gaze', 'gesture', 'hair', 'hand', 'hands', 'head', 'jacket', 'jaw',
  'mouth', 'neck', 'pose', 'posture', 'shoulder', 'shoulders', 'silhouette',
  'stance', 'torso'
]);

const WORDSTREAM_ABSTRACT_WORDS = new Set([
  'afterimage', 'alarm', 'anticipation', 'anxiety', 'appetite', 'arrival',
  'attention', 'charge', 'charged', 'comfort', 'compression', 'curiosity',
  'desire', 'dread', 'emotion', 'fear', 'focus', 'hesitation', 'horror',
  'impact', 'impulse', 'intensity', 'intrigue', 'memory', 'mood', 'obsession',
  'paranoia', 'pressure', 'recognition', 'relief', 'sensation', 'search',
  'shock', 'silence', 'strain', 'stress', 'suspicion', 'tension', 'turn',
  'unease'
]);

const ENTITY_LEAD_WORDS = new Set([
  'a', 'an', 'the', 'this', 'that', 'these', 'those', 'in', 'on', 'at', 'by',
  'near', 'behind', 'beside', 'under', 'over', 'inside', 'outside', 'around',
  'toward', 'towards', 'into', 'through', 'from', 'against', 'across'
]);

const POSSESSIVE_WORDS = new Set([
  'his', 'her', 'hers', 'its', 'my', 'our', 'their', 'your'
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
  return WORDSTREAM_FUNCTION_WORDS.has(normalized) || WORDSTREAM_META_WORDS.has(normalized);
};

const extractWordstreamKeywords = (value, minLength = 4) => tokenizeWordstreamKeywords(value)
  .map(normalizeKeyword)
  .filter((word) => word.length >= minLength && !isWordstreamNoise(word));

const extractCandidateEntitySpans = (value) => {
  const words = tokenizeWordstreamKeywords(value);
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
      if (WORDSTREAM_FUNCTION_WORDS.has(normalized) || WORDSTREAM_META_WORDS.has(normalized)) {
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
  ...WORDSTREAM_BODY_WORDS,
  ...WORDSTREAM_ABSTRACT_WORDS,
]);

const findUnsupportedVisibleEntities = (scene = {}, storyContext = {}) => {
  const visibleKeywords = collectVisibleContextKeywords(storyContext);
  const unsupported = new Set();

  CAMERA_VISIBLE_TEXT_FIELDS.forEach((field) => {
    extractCandidateEntitySpans(scene?.[field]).forEach((span) => {
      const concreteKeywords = span.filter((keyword) => (
        keyword.length >= 4
        && !WORDSTREAM_BODY_WORDS.has(keyword)
        && !WORDSTREAM_ABSTRACT_WORDS.has(keyword)
      ));
      if (concreteKeywords.length === 0) {
        return;
      }
      const supported = concreteKeywords.some((keyword) => visibleKeywords.has(keyword));
      if (!supported) {
        unsupported.add(concreteKeywords.join(' '));
      }
    });
  });

  return [...unsupported];
};

const stripLeadingIn = (value) => String(value || '').replace(/^in\s+/i, '').trim();

const resolveRoomAnchors = (storyContext = {}) => {
  const contextText = [
    storyContext.location,
    storyContext.setupSummary,
    storyContext.description,
  ].join(' ').toLowerCase();
  const anchors = [];

  if (contextText.includes('window')) {
    anchors.push('the window line');
  }
  if (contextText.includes('glass')) {
    anchors.push('the glass edge');
  }
  if (contextText.includes('door')) {
    anchors.push('the door frame');
  }
  if (contextText.includes('wall')) {
    anchors.push('the wall behind him');
  }
  if (contextText.includes('map')) {
    anchors.push('the map in the background');
  }
  if (contextText.includes('globe')) {
    anchors.push('the globe in the background');
  }
  if (contextText.includes('ceiling')) {
    anchors.push('the ceiling line overhead');
  }
  if (contextText.includes('low angle')) {
    anchors.push('the low-angle room geometry');
  }
  if (contextText.includes('close-up') || contextText.includes('close up')) {
    anchors.push('the tight face framing');
  }

  if (anchors.length === 0) {
    const location = stripLeadingIn(storyContext.locationSummary || storyContext.location || '');
    if (location) {
      anchors.push(location);
    }
  }

  if (anchors.length === 0) {
    anchors.push('the same room geometry');
  }

  return anchors;
};

const pickRoomAnchor = (storyContext = {}, sceneIndex = 0) => {
  const anchors = resolveRoomAnchors(storyContext);
  return anchors[sceneIndex % anchors.length] || anchors[0] || 'the same room geometry';
};

const resolveWordstreamPhase = ({
  sceneIndex = 0,
  totalScenes = 1,
} = {}) => {
  if (totalScenes <= 1) {
    return 'impact';
  }
  if (sceneIndex <= 0) {
    return 'entry';
  }
  if (sceneIndex >= totalScenes - 1) {
    return 'afterimage';
  }
  if (sceneIndex >= totalScenes - 2) {
    return 'turn';
  }
  if (sceneIndex === 1) {
    return 'search';
  }
  return 'compression';
};

const buildWordstreamSceneProfile = ({
  cueText = '',
  storyContext = {},
  sceneIndex = 0,
  totalScenes = 1,
} = {}) => {
  const actorText = summarizeVisionActorIdentity(storyContext.actors)
    || summarizeVisionActors(storyContext.actors)
    || storyContext.actorIdentity
    || storyContext.actorSummary
    || 'the same actor';
  const locationText = stripLeadingIn(
    summarizeVisionLocation(storyContext.location) || storyContext.locationSummary || storyContext.location || 'the same room'
  );
  const roomAnchor = pickRoomAnchor(storyContext, sceneIndex);
  const phase = resolveWordstreamPhase({
    sceneIndex,
    totalScenes,
  });
  const cueLabel = compactCueLabel(cueText);
  const titleSuffix = cueLabel ? `: ${cueLabel}` : '';
  let state = '';
  let beatLead = '';
  let motion = '';
  let camera = '';

  switch (phase) {
    case 'entry':
      state = 'arrival pressure';
      beatLead = `The next wordstream cue enters the room as a new pressure that reads through his face and shoulders near ${roomAnchor}.`;
      motion = 'He settles into alert stillness, then gathers his hands close to his torso as his eyes fix off-axis.';
      camera = `Hold the same shot and press in slightly while keeping ${roomAnchor} readable behind him.`;
      break;
    case 'search':
      state = 'searching attention';
      beatLead = `The next wordstream cue gets tested against the visible room, shifting into searching attention around ${roomAnchor}.`;
      motion = 'His eyes scan across the room, his chin tilts a fraction, and his breath checks before the rest of the body moves.';
      camera = `Drift subtly across the frame so his face and ${roomAnchor} stay tied together.`;
      break;
    case 'compression':
      state = 'compressed focus';
      beatLead = `The current cue compresses the shot, tightening posture and room tension around ${roomAnchor}.`;
      motion = 'His shoulders tense, he leans forward a fraction, then stops hard with the gaze locked in place.';
      camera = `Keep the low-angle continuity and tighten the frame slightly around his face and ${roomAnchor}.`;
      break;
    case 'turn':
      state = 'turning strain';
      beatLead = `The cue forces a turn in the same room, visible as a body check and a changed relation to ${roomAnchor}.`;
      motion = 'He turns partway, then recoils a fraction as his mouth opens and closes on a held breath.';
      camera = `Widen just enough to catch the turn while holding ${roomAnchor} steady behind him.`;
      break;
    case 'afterimage':
      state = 'afterimage tension';
      beatLead = `The cue leaves an afterimage in the room, settling into the silence around ${roomAnchor}.`;
      motion = 'He holds the aftermath in a taut stare, with only his breath, jaw, and eyes still moving.';
      camera = `Hold steady and let ${roomAnchor} anchor the frame while the feeling settles.`;
      break;
    case 'impact':
      state = 'contained impact';
      beatLead = `The cue lands inside the visible room as one contained impact around ${roomAnchor}.`;
      motion = 'He absorbs the change in one small body jolt, then steadies into a fixed stare.';
      camera = `Keep the shot steady and readable while ${roomAnchor} stays anchored behind him.`;
      break;
    default:
      state = 'restless attention';
      beatLead = `The cue changes the scene through restless attention in the same room, visible in his body and in the emphasis on ${roomAnchor}.`;
      motion = 'He settles into alert stillness, then lets his eyes travel across the room before fixing on one point.';
      camera = `Hold continuity and drift slightly so ${roomAnchor} stays present with his face.`;
      break;
  }

  const stillPrompt = `${actorText} in ${locationText}, carrying ${state} in posture and expression, with ${roomAnchor} still clearly readable.`;
  const imageDescription = `${actorText} remains in ${locationText}; ${motion.replace(/[.]+$/g, '')}; the same light and ${roomAnchor} stay visible.`;
  const storyBeat = 'The visible shot absorbs the current wordstream cue through body language, gaze, and room emphasis without introducing new props.';
  const videoPrompt = `${beatLead} ${motion} ${camera}`;
  const singleImagePrompt = `${stillPrompt} ${motion}`;

  return {
    title: `Wordstream shift ${sceneIndex + 1}${titleSuffix}`,
    beat: beatLead,
    stillPrompt,
    imageDescription,
    storyBeat,
    motionCue: motion,
    cameraCue: camera,
    videoPrompt,
    singleImagePrompt,
  };
};

const rewriteSceneFromWordstream = ({
  scene = {},
  storyContext = {},
  sourceCues = [],
  sceneIndex = 0,
  totalScenes = 1,
} = {}) => {
  const cueText = sourceCues[sceneIndex] || sourceCues[sourceCues.length - 1] || '';
  const rewritten = buildWordstreamSceneProfile({
    cueText,
    storyContext,
    sceneIndex,
    totalScenes,
  });

  return {
    ...scene,
    ...rewritten,
  };
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
} = {}) => {
  const normalizedScenePrompt = normalizeString(scenePlanSystemPrompt);
  const normalizedCameraPrompt = normalizeString(cameraScenePlanSystemPrompt);

  if (configMode === 'camera') {
    return normalizedCameraPrompt
      || normalizedScenePrompt
      || DEFAULT_WEBCAM_CAMERA_SCENE_SYSTEM_PROMPT;
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
  const startVision = continuityVision || await readFrameVision(frameContext.startFrame);
  const endVision = await readFrameVision(frameContext.endFrame);
  const plannedPrompt = scenePlanEntry?.videoPrompt || buildFallbackVideoPrompt(
    scenePlanEntry,
    `${startFramePrompt} ${endFramePrompt}` || 'Continue into the next destination scene.'
  );

  if (configMode === 'camera') {
    return buildCameraGroundedPrompt({
      basePrompt: plannedPrompt,
      storyBeat: scenePlanEntry?.storyBeat || scenePlanEntry?.beat,
      stillPrompt: scenePlanEntry?.stillPrompt,
      imageDescription: scenePlanEntry?.imageDescription,
      durationSeconds: resolvedDurationSeconds,
      motionCue: scenePlanEntry?.motionCue,
      cameraCue: scenePlanEntry?.cameraCue,
      startVision,
      endVision,
      useSingleImage: false,
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
      storyBeat: scenePlanEntry?.storyBeat || scenePlanEntry?.beat,
      stillPrompt: scenePlanEntry?.stillPrompt,
      imageDescription: scenePlanEntry?.imageDescription,
      durationSeconds: resolvedDurationSeconds,
      motionCue: scenePlanEntry?.motionCue,
      cameraCue: scenePlanEntry?.cameraCue,
      startVision,
      useSingleImage: true,
      preferDynamicSingleImage: wasTransitionBeat,
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
  } = {}
) => {
  const parsedStoryContext = typeof visionStoryContext === 'string'
    ? extractVisionStoryContext(visionStoryContext)
    : (visionStoryContext || {});
  const hasWordstream = sourceCues.some((cue) => normalizeString(cue).length > 0);
  const hasVisionContext = normalizeString([
    parsedStoryContext.location,
    parsedStoryContext.locationSummary,
    parsedStoryContext.description,
  ].filter(Boolean).join(' ')).length > 0;
  const sanitizedPlan = scenePlan.map((scene, index) => {
    let normalized = { ...scene };
    const isFirst = index === 0;
    const unsupportedVisibleEntities = findUnsupportedVisibleEntities(normalized, parsedStoryContext);
    const needsWordstreamRewrite = unsupportedVisibleEntities.length > 0
      || (hasWordstream && hasVisionContext);

    if (needsWordstreamRewrite) {
      normalized = rewriteSceneFromWordstream({
        scene: normalized,
        storyContext: parsedStoryContext,
        sourceCues,
        sceneIndex: index,
        totalScenes: scenePlan.length,
      });
    }

    if (isFirst) {
      return {
        ...normalized,
        videoMode: 'singleImage',
        frameSource: 'newImage',
        freshImage: true,
        useCameraShot: true,
      };
    }

    if (normalized.videoMode === 'firstLast') {
      return {
        ...normalized,
        frameSource: 'lastFrame',
        useCameraShot: true,
      };
    }

    return {
      ...normalized,
      frameSource: 'lastFrame',
      freshImage: false,
      useCameraShot: false,
    };
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
