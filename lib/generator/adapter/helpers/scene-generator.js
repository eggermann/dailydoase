import {
  clampSceneCount,
  normalizeFrameSource,
  normalizeCaptureSource,
  normalizeSceneLengthValue,
  normalizeString,
  normalizeVideoMode,
  stripCodeFences,
} from './scene-generator-helpers.js';
import {
  isReferenceImageActorMode,
} from '../shorty-book/LiveContextOrchestrator-config.js';
import { createLogger } from '../../logger.js';

const logger = createLogger('scene-generator', { envKeys: ['GENERATOR_DEBUG'] });

// Semantic streams and cast memory can contain long scraped fragments. Keep
// complete sentences and words, never a cut-off fragment: the planner receives
// a readable digest instead of a damaged excerpt.
export const compactPlannerText = (value, maxCharacters = 600) => {
  const normalized = normalizeString(value).replace(/\s+/g, ' ');
  if (normalized.length <= maxCharacters) {
    return normalized;
  }

  const limit = Math.max(2, Number(maxCharacters) || 600);
  const suffix = '…';
  const sentences = normalized.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [normalized];
  const selected = [];
  let length = 0;

  for (const sentence of sentences) {
    const candidate = sentence.trim();
    if (!candidate || length + candidate.length + (selected.length ? 1 : 0) + suffix.length > limit) {
      break;
    }
    selected.push(candidate);
    length += candidate.length + (selected.length > 1 ? 1 : 0);
  }

  if (selected.length > 0) {
    return `${selected.join(' ')}${suffix}`;
  }

  const words = normalized.split(' ').filter(Boolean);
  const wholeWords = [];
  let wordLength = 0;
  for (const word of words) {
    if (wordLength + word.length + (wholeWords.length ? 1 : 0) + suffix.length > limit) {
      break;
    }
    wholeWords.push(word);
    wordLength += word.length + (wholeWords.length > 1 ? 1 : 0);
  }
  return wholeWords.length > 0 ? `${wholeWords.join(' ')}${suffix}` : suffix;
};

export const supportsCustomScenePlanSampling = (model = '') => (
  !String(model).trim().toLowerCase().startsWith('gpt-5')
);

const compactSemanticStreamTrace = (batches = []) => (Array.isArray(batches) ? batches : [])
  .map((batch) => (Array.isArray(batch) ? batch : []).map((entry) => ({
    title: normalizeString(entry?.title || entry?.currentWord),
    linkWord: normalizeString(entry?.linkWord),
    cnt: Number.isFinite(Number(entry?.cnt)) ? Number(entry.cnt) : null,
    prev: Array.isArray(entry?.prev)
      ? entry.prev.map((value) => compactPlannerText(value, 240)).filter(Boolean)
      : [],
    next: Array.isArray(entry?.next)
      ? entry.next.map((value) => compactPlannerText(value, 240)).filter(Boolean)
      : [],
  })));

export const DEFAULT_SCENE_SYSTEM_PROMPT = [
  'You create short visual scene plans for image-to-video generation.',
  'Return only valid JSON.',
  'Build one causal visual story from the ordered source cues. Every next scene must visibly follow from the previous scene and retain a readable residue of it.',
  'Every iteration must have one concrete, visible dramaturgical clue. Plant it in scene 1 or 2, carry its visible consequence through the story, and pay it off in the final scene. With one scene, show the clue and its immediate payoff in that scene. Derive it from the actual vision context and semantic cues; describe what can be seen rather than explaining its meaning.',
  'Make the final scene the story high point: earlier actions converge in one visible payoff or reversal. The final dramaturgicalClue must describe how the earlier clue changes or becomes understandable in the image.',
  'Translate abstract or fragmentary cues into embodied events, not commentary, explanation, or topic summaries.',
  'castSelection is an optional list of cast ids from CAST MEMORY that a scene may recall, reintroduce, transform, or ignore. castUse says how that optional memory enters the scene.',
  'actorAction and actorsInteraction may describe body action or exchange when useful; leave either string empty when the scene works through room, atmosphere, transformation, or abstraction instead.',
  'Choose one eventType per scene: actorToLocation, locationToActor, actorToActor, or actorOnly. locationAction names a physical relation between an actor and an existing room feature. storyEvent names the visible cause and consequence that advances the story.',
  'Treat eventType as descriptive metadata, not a constraint on surreal scene invention.',
  'Vary dominant action and camera behavior across adjacent scenes.',
  'Every Selfomat scene must choose exactly one captureSource: pocketPhone (about 70% of scenes), cheapCCTV (about 20%), or firstPersonDrone (about 10%). pocketPhone is reactive consumer-phone footage: late, tilted, partly cut-off framing, never a slow push-in or composed move. cheapCCTV is fixed high-corner 4:3 security footage: no phone, no handheld movement. firstPersonDrone is a low, unstable FPV view with slight horizon roll: no phone and no fixed CCTV. Never combine sources in one scene.',
  'In every reference-image-actor story, intensify the selfie situation through at least two explicit room or location changes; with four or more scenes use at least three event types. Every scene must inherit visible residue and cause the next, never remain an isolated gesture.',
  'Translate every semantic cue into a stronger physical consequence in the person, object, or room. Let each cue alter an existing visual relationship in the observed setting. Choose consequences from the cue meaning and the actual scene, not from a fixed prop or action list. Avoid logos or readable text.',
  'If Vision provides an enabled animal analogy, sharpen it one step as a recurring physical motif in posture, rhythm, silhouette, texture, or object relation. Preserve the person as the subject, do not insert a literal animal solely from the analogy, and keep low confidence as interpretation rather than certainty.',
  'stillPrompt describes one destination image. imageDescription describes its visible setup.',
  'creativeDecision is the explicit artistic decision layer: choose one visualEvent, one personAction, one main transformation, one residue that must survive, one dramaturgicalClue for the visible clue or its payoff (empty only in middle scenes that merely carry it), one concrete nextWord, a short nextWordReason, and one cameraMove.',
  'The final scene nextWord must be a concrete visual concept inferred from its visible consequence, must differ from the current topic, and must not be copied from raw cue wording. Earlier scenes may leave nextWord empty.',
  'motionCue describes physical subject movement; cameraCue describes one camera movement.',
  'videoPrompt and singleImagePrompt are production-ready prompts of 2-3 short sentences containing the actor action, visible consequence, and one camera move. Never include schema or meta instructions.',
  'realityIntrusion is false by default. Set it true only when a source cue deliberately cuts from the generated scene to the live exhibition camera after this scene. It is a hard signal cut, never an interpolated camera move.',
  'frameSource is lastFrame or newImage. videoMode is firstLast or singleImage. durationSeconds is the exact requested duration.',
  'freshImage and useCameraShot must truthfully match the selected mode.',
].join(' ');

const SCENE_PLAN_SCHEMA = {
  name: 'scene_plan',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['scenes'],
    properties: {
      scenes: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'title',
            'beat',
            'stillPrompt',
            'imageDescription',
            'storyBeat',
            'eventType',
            'actorAction',
            'actorsInteraction',
            'locationAction',
            'storyEvent',
            'castSelection',
            'castUse',
            'motionCue',
            'cameraCue',
            'captureSource',
            'frameSource',
            'videoMode',
            'durationSeconds',
            'videoPrompt',
            'singleImagePrompt',
            'freshImage',
            'useCameraShot',
            'realityIntrusion',
            'creativeDecision',
          ],
          properties: {
            title: { type: 'string' },
            beat: { type: 'string' },
            stillPrompt: { type: 'string' },
            imageDescription: { type: 'string' },
            storyBeat: { type: 'string' },
            eventType: {
              type: 'string',
              enum: ['actorToLocation', 'locationToActor', 'actorToActor', 'actorOnly'],
            },
            actorAction: { type: 'string' },
            actorsInteraction: { type: 'string' },
            locationAction: { type: 'string' },
            storyEvent: { type: 'string' },
            castSelection: {
              type: 'array',
              items: { type: 'string' },
              maxItems: 9,
            },
            castUse: { type: 'string' },
            motionCue: { type: 'string' },
            cameraCue: { type: 'string' },
            captureSource: {
              type: 'string',
              enum: ['pocketPhone', 'cheapCCTV', 'firstPersonDrone'],
            },
            frameSource: {
              type: 'string',
              enum: ['lastFrame', 'newImage'],
            },
            videoMode: {
              type: 'string',
              enum: ['firstLast', 'singleImage'],
            },
            durationSeconds: { type: 'number' },
            videoPrompt: { type: 'string' },
            singleImagePrompt: { type: 'string' },
            freshImage: { type: 'boolean' },
            useCameraShot: { type: 'boolean' },
            realityIntrusion: { type: 'boolean' },
            creativeDecision: {
              type: 'object',
              additionalProperties: false,
              required: ['visualEvent', 'personAction', 'transformation', 'residue', 'dramaturgicalClue', 'nextWord', 'nextWordReason', 'cameraMove'],
              properties: {
                visualEvent: { type: 'string' },
                personAction: { type: 'string' },
                transformation: { type: 'string' },
                dramaturgicalClue: { type: 'string' },
                residue: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['description', 'mustSurvive'],
                  properties: {
                    description: { type: 'string' },
                    mustSurvive: { type: 'boolean' },
                  },
                },
                nextWord: { type: 'string' },
                nextWordReason: { type: 'string' },
                cameraMove: { type: 'string' },
              },
            },
          },
        },
      },
    },
  },
  strict: true,
};

export const resolveSceneCountFromConfig = ({
  sceneLengths = [],
  sceneCount,
  defaultSceneCount = 1,
} = {}) => {
  const explicitCount = Number(sceneCount);
  if (Number.isFinite(explicitCount) && explicitCount > 0) {
    return Math.floor(explicitCount);
  }

  if (typeof sceneLengths === 'function') {
    return clampSceneCount(defaultSceneCount);
  }

  const derivedCount = Array.isArray(sceneLengths)
    ? sceneLengths.filter((value) => Number.isFinite(Number(value)) && Number(value) > 0).length
    : 0;

  if (derivedCount > 0) {
    return derivedCount;
  }

  return clampSceneCount(defaultSceneCount);
};

export const resolveSceneLengthsInput = async (sceneLengths, sceneCount, fallbackLength = 3) => {
  const count = clampSceneCount(sceneCount);

  if (typeof sceneLengths === 'function') {
    const resolved = [];
    for (let index = 0; index < count; index += 1) {
      resolved.push(normalizeSceneLengthValue(await sceneLengths({ index, count }), fallbackLength));
    }
    return resolved;
  }

  if (Array.isArray(sceneLengths)) {
    const normalized = sceneLengths
      .map((value) => normalizeSceneLengthValue(value, fallbackLength))
      .filter((value) => Number.isFinite(value) && value > 0);

    if (normalized.length >= count) {
      return normalized.slice(0, count);
    }

    while (normalized.length < count) {
      normalized.push(fallbackLength);
    }
    return normalized;
  }

  return Array.from({ length: count }, () => fallbackLength);
};

const EMPTY_SCENE_ACTION_PATTERN = /^(?:none|null|n\/?a|not applicable|no action|no interaction)[.!]?$/i;
const SEMANTIC_CITATION_PATTERN = /\b(?:PMID|PMCID|PMC|S2CID|Bibcode|DOI|ISBN|identifier)\b/i;
const VISIBLE_SCENE_FIELDS = [
  'title', 'beat', 'storyBeat', 'storyEvent', 'actorAction', 'actorsInteraction',
  'locationAction', 'stillPrompt', 'imageDescription', 'motionCue', 'cameraCue',
  'videoPrompt', 'singleImagePrompt',
];

export const normalizeSceneAction = (value) => {
  const normalized = normalizeString(value, '');
  return EMPTY_SCENE_ACTION_PATTERN.test(normalized) ? '' : normalized;
};

export const validateReferenceImageActorScenePlan = (
  scenePlan = [],
  {
    forceImageToVideoOnly = false,
  } = {}
) => {
  const issues = [];

  if (scenePlan.length === 1 && !normalizeString(scenePlan[0]?.creativeDecision?.dramaturgicalClue)) {
    issues.push('iteration: single scene must show a visible clue and its payoff');
  }

  if (scenePlan.length > 1) {
    const earlyScenes = scenePlan.slice(0, Math.min(2, scenePlan.length - 1));
    const plantedClue = earlyScenes
      .map((scene) => normalizeString(scene?.creativeDecision?.dramaturgicalClue))
      .find(Boolean);
    const finalPayoff = normalizeString(scenePlan.at(-1)?.creativeDecision?.dramaturgicalClue);
    if (!plantedClue) {
      issues.push('iteration: scene 1 or 2 must plant a visible dramaturgical clue');
    }
    if (!finalPayoff) {
      issues.push('iteration: final scene must show the clue payoff');
    } else if (plantedClue && plantedClue.toLowerCase() === finalPayoff.toLowerCase()) {
      issues.push('iteration: final clue payoff must change or reveal the earlier clue');
    }
  }

  scenePlan.forEach((scene, index) => {
    const label = `scene ${index + 1}`;
    for (const field of VISIBLE_SCENE_FIELDS) {
      if (SEMANTIC_CITATION_PATTERN.test(normalizeString(scene?.[field]))) {
        issues.push(`${label}: ${field} must describe the visible scene without source citations`);
      }
    }
    for (const field of ['visualEvent', 'transformation', 'dramaturgicalClue']) {
      if (SEMANTIC_CITATION_PATTERN.test(normalizeString(scene?.creativeDecision?.[field]))) {
        issues.push(`${label}: creativeDecision.${field} must describe the visible scene without source citations`);
      }
    }
    const frameSource = normalizeString(scene?.frameSource);
    const videoMode = normalizeString(scene?.videoMode);
    const freshImage = scene?.freshImage === true;
    const useCameraShot = scene?.useCameraShot === true;

    if (index === 0) {
      if (videoMode !== 'singleImage' || frameSource !== 'newImage' || !freshImage || !useCameraShot) {
        issues.push(`${label}: opening mode must be newImage/singleImage/freshImage=true/useCameraShot=true`);
      }
    } else if (forceImageToVideoOnly) {
      if (videoMode !== 'singleImage' || frameSource !== 'lastFrame' || freshImage || useCameraShot) {
        issues.push(`${label}: continuation mode must be lastFrame/singleImage/freshImage=false/useCameraShot=false`);
      }
    } else if (videoMode === 'firstLast') {
      if (frameSource !== 'lastFrame' || freshImage || !useCameraShot) {
        issues.push(`${label}: firstLast destination must be lastFrame/firstLast/freshImage=false/useCameraShot=true`);
      }
    } else if (videoMode === 'singleImage') {
      if (frameSource !== 'lastFrame' || freshImage || useCameraShot) {
        issues.push(`${label}: continuation mode must be lastFrame/singleImage/freshImage=false/useCameraShot=false`);
      }
    } else {
      issues.push(`${label}: later mode must be singleImage or firstLast`);
    }
  });

  return issues;
};

export const parseScenePlan = (value, sceneCount = 3, resolvedSceneLengths = []) => {
  const count = clampSceneCount(sceneCount);
  const parsed = JSON.parse(stripCodeFences(value));
  if (!Array.isArray(parsed?.scenes)) {
    throw new Error('Scene plan response must be an object with a scenes array');
  }

  return parsed.scenes.slice(0, count).map((item, index) => {
    const actorAction = normalizeSceneAction(item?.actorAction);
    const actorsInteraction = normalizeSceneAction(item?.actorsInteraction);
    const locationAction = normalizeSceneAction(item?.locationAction);
    const storyEvent = normalizeString(item?.storyEvent, '');
    const castSelection = [...new Set(
      (Array.isArray(item?.castSelection) ? item.castSelection : [])
        .map((castId) => normalizeString(castId))
        .filter(Boolean)
    )].slice(0, 9);
    const rawDecision = item?.creativeDecision || {};
    const rawResidue = rawDecision.residue || item?.residue || {};
    const creativeDecision = {
      visualEvent: normalizeString(rawDecision.visualEvent, normalizeString(item?.storyEvent, '')),
      personAction: normalizeString(rawDecision.personAction, actorAction),
      transformation: normalizeString(rawDecision.transformation, normalizeString(item?.locationAction, '')),
      dramaturgicalClue: normalizeString(rawDecision.dramaturgicalClue),
      residue: {
        description: normalizeString(rawResidue.description, normalizeString(item?.storyBeat || item?.beat, '')),
        mustSurvive: rawResidue.mustSurvive !== false,
      },
      nextWord: normalizeString(rawDecision.nextWord, normalizeString(item?.nextWord, '')),
      nextWordReason: normalizeString(rawDecision.nextWordReason, normalizeString(item?.nextWordReason, '')),
      cameraMove: normalizeString(rawDecision.cameraMove, normalizeString(item?.cameraCue, '')),
    };
    return {
      index: index + 1,
      title: normalizeString(item?.title, `Scene ${index + 1}`),
      beat: normalizeString(item?.beat, ''),
      stillPrompt: normalizeString(item?.stillPrompt, ''),
      imageDescription: normalizeString(item?.imageDescription, ''),
      storyBeat: normalizeString(item?.storyBeat, ''),
      eventType: normalizeString(item?.eventType, 'actorOnly'),
      actorAction,
      actorsInteraction,
      locationAction,
      storyEvent,
      castSelection,
      castUse: normalizeString(item?.castUse, ''),
      motionCue: normalizeString(item?.motionCue, ''),
      cameraCue: normalizeString(item?.cameraCue, ''),
      captureSource: normalizeCaptureSource(item?.captureSource, index % 5 === 4 ? 'cheapCCTV' : 'pocketPhone'),
      frameSource: normalizeFrameSource(item?.frameSource, item?.freshImage === true ? 'newImage' : 'lastFrame'),
      videoMode: normalizeVideoMode(item?.videoMode, 'singleImage'),
      durationSeconds: normalizeSceneLengthValue(
        resolvedSceneLengths[index],
        normalizeSceneLengthValue(item?.durationSeconds, 3)
      ),
      videoPrompt: normalizeString(item?.videoPrompt, ''),
      singleImagePrompt: normalizeString(item?.singleImagePrompt, ''),
      freshImage: item?.freshImage === true,
      useCameraShot: item?.useCameraShot === true,
      realityIntrusion: item?.realityIntrusion === true,
      creativeDecision,
    };
  });
};

export const parseScenePlanLengthMismatch = (error) => {
  const message = String(error?.message || error || '');
  const match = message.match(/Scene plan length mismatch: expected (\d+), received (\d+)/i);
  if (!match) {
    return null;
  }

  return {
    expected: Number(match[1]),
    received: Number(match[2]),
  };
};

export const generateScenePlanWithFallback = async ({
  generateScenes,
  sceneCount,
  sceneLengths,
  configMode,
  sceneFlavor,
  visualDirection,
  visionStoryContext,
  sourceCues,
  sourceCueCount,
  sourceCueBatches,
  sourceCueStreamTraceBatches,
  sceneAspectCues,
  sceneAspectTrace,
  realityRatio,
  storyTransport,
  forceImageToVideoOnly = false,
  realityIntrusionMode = 'off',
  onFallback,
} = {}) => {
  if (typeof generateScenes !== 'function') {
    throw new Error('generateScenePlanWithFallback requires a generateScenes function');
  }

  let targetSceneCount = clampSceneCount(sceneCount);

  while (targetSceneCount >= 1) {
    let activeSceneLengths;
    try {
      activeSceneLengths = Array.isArray(sceneLengths)
        ? sceneLengths.slice(0, targetSceneCount)
        : await resolveSceneLengthsInput(sceneLengths, targetSceneCount, 3);
      const scenePlan = await generateScenes({
        sceneCount: targetSceneCount,
        sceneLengths: activeSceneLengths,
        configMode,
        sceneFlavor,
        visualDirection,
        visionStoryContext,
        sourceCues,
        sourceCueCount,
        sourceCueBatches,
        sourceCueStreamTraceBatches,
        sceneAspectCues,
        sceneAspectTrace,
        realityRatio,
        storyTransport,
        forceImageToVideoOnly,
        realityIntrusionMode,
      });

      return {
        scenePlan,
        effectiveSceneCount: targetSceneCount,
        effectiveSceneLengths: activeSceneLengths,
      };
    } catch (error) {
      const mismatch = parseScenePlanLengthMismatch(error);
      if (!mismatch) {
        throw error;
      }

      const nextSceneCount = Math.max(1, Math.min(targetSceneCount - 1, mismatch.received));
      if (nextSceneCount >= targetSceneCount) {
        throw error;
      }

      if (typeof onFallback === 'function') {
        await onFallback({
          requestedSceneCount: targetSceneCount,
          receivedSceneCount: mismatch.received,
          nextSceneCount,
          mismatch,
          error,
        });
      }

      targetSceneCount = nextSceneCount;
    }
  }

  throw new Error('Unable to generate a valid scene plan.');
};

export const createSceneGenerator = ({
  openai,
  fallbackOpenai,
  model,
  fallbackModel = '',
  systemPrompt = '',
  temperature = 0.4,
  top_p = 0.9,
  onRequest,
  onResponse,
} = {}) => {
  if (!openai?.chat?.completions?.create) {
    throw new Error('createSceneGenerator requires an OpenAI-compatible client');
  }

  const resolvedSystemPrompt = normalizeString(systemPrompt, DEFAULT_SCENE_SYSTEM_PROMPT);

  return async ({
    sourceCues = [],
    sourceCueCount = sourceCues.length,
    sourceCueBatches = [],
    sourceCueStreamTraceBatches = [],
    sceneAspectCues = [],
    sceneAspectTrace = [],
    realityRatio = 0.9,
    sceneLengths = [],
    sceneCount = 3,
    visualDirection = '',
    visionStoryContext = '',
    storyTransport = '',
    configMode = 'generated',
    sceneFlavor = 'default',
    forceImageToVideoOnly = false,
    realityIntrusionMode = 'off',
  } = {}) => {
    const count = clampSceneCount(sceneCount);
    const resolvedSceneLengths = await resolveSceneLengthsInput(sceneLengths, count, 3);
    const trimmedCues = sourceCues
      .map((cue) => compactPlannerText(cue, 320))
      .filter(Boolean);
    const normalizedVisionStoryContext = compactPlannerText(visionStoryContext, 900);
    const compactVisualDirection = compactPlannerText(visualDirection, 900);
    const compactStoryTransport = compactPlannerText(storyTransport, 1_800);
    const compactSemanticStreamContext = compactSemanticStreamTrace(sourceCueStreamTraceBatches);
    const compactSceneAspectCues = (Array.isArray(sceneAspectCues) ? sceneAspectCues : [])
      .map((cue) => compactPlannerText(cue, 180))
      .filter(Boolean);

    const referenceImageActorMode = isReferenceImageActorMode(configMode);
    const trippyMode = normalizeString(sceneFlavor, 'default').toLowerCase() === 'ltxtrippy';
    const requestRules = [
      'Keep Current topic word as the stable subject. Source cues transform it but never replace it.',
      'Use cues in order as a causal chain. Each scene inherits one visible consequence from the previous scene.',
      'CLUE: Use Vision and semantic cues for an early visible clue; pay it off visibly in the final high point. One scene: show both. Record it in dramaturgicalClue and storyEvent.',
      'PRIVATE SEMANTIC MATERIAL: Source cues are internal brainstorming fragments only. Infer their meaning, but never quote or copy raw cue text, citation markers, identifiers, PMID, PMC, Bibcode, DOI, ISBN, or research metadata into title, beat, storyBeat, stillPrompt, imageDescription, motionCue, cameraCue, videoPrompt, or singleImagePrompt. Every visible field must describe an observable physical or visual event.',
      'Use detected actors, positions, orientations, and room geometry as source material, not hard creative limits.',
      'Make eventType explicit as descriptive metadata. Actor fields may remain empty when transformation, atmosphere, abstraction, or room behavior carries the scene.',
      'locationAction and storyEvent may be physical, atmospheric, abstract, typographic, or surreal when the source cues support it.',
      'SCENE ASPECT CUES: One extra stream item per scene may change setting or atmosphere. Do not copy raw wording or change the cast through aspect cues.',
      'CAST MEMORY: Optionally choose up to nine listed ids in castSelection. Explain their use in castUse; otherwise use an empty array.',
      'Vary the dominant visual event and camera behavior across adjacent scenes.',
      ...(referenceImageActorMode
        ? [
            forceImageToVideoOnly
              ? 'Reference-image-actor state machine: scene 1 = newImage/singleImage/freshImage true/useCameraShot true; every later scene = lastFrame/singleImage/false/false. firstLast is disabled for this run.'
              : 'Reference-image-actor state machine: scene 1 = newImage/singleImage/freshImage true/useCameraShot true; later continuation = lastFrame/singleImage/false/false; later destination = lastFrame/firstLast/false/true.',
            'Use actor identity and room continuity only when they strengthen the chosen scene; surreal changes are allowed.',
          ]
        : []),
      ...(normalizeString(realityIntrusionMode).toLowerCase() === 'semantic'
        ? ['A scene may set realityIntrusion=true only when an ordered source cue motivates a deliberate cut from the fictional Kaufhaus CCTV world into the live exhibition camera. Keep it false for ordinary story movement.']
        : ['Set realityIntrusion=false for every scene.']),
      ...(trippyMode
        ? [
            'LTX-trippy adds a strong surreal consequence to the actor action in at least half the scenes, while retaining the actor or room anchor.',
          ]
        : []),
      ...(normalizedVisionStoryContext
        ? [`Vision context: ${normalizedVisionStoryContext}`]
        : []),
    ];

    const messages = [
      {
        role: 'system',
        content: resolvedSystemPrompt,
      },
      {
        role: 'user',
        content: [
          `Scene count: ${count}`,
          `Source cue count: ${Number(sourceCueCount) || trimmedCues.length}`,
          `Reality ratio: ${Number(realityRatio) || 0.9}`,
          `Scene lengths (seconds): ${resolvedSceneLengths.join(', ') || '3'}`,
          `Total film duration (seconds): ${resolvedSceneLengths.reduce((sum, value) => sum + Number(value || 0), 0) || 3}`,
          `Config mode: ${normalizeString(configMode, 'generated')}`,
          `Scene flavor: ${normalizeString(sceneFlavor, 'default')}`,
          `Visual direction: ${compactVisualDirection || 'documentary, realistic, concise'}`,
          `Source cues (ordered semantic story anchors): ${JSON.stringify(trimmedCues)} (PRIVATE meaning only; never visible wording)`,
          `Semantic cue takt batches by scene: ${JSON.stringify(sourceCueBatches)} (PRIVATE meaning only; use as scene-weighting, never quote raw cue text)`,
          `Semantic stream context by scene: ${JSON.stringify(compactSemanticStreamContext)} (PRIVATE meaning only; prev/next are provider source-text snippets for local context, title is the current stream item, explicit linkWord is the only allowed semantic continuation candidate, cnt is a counter only; never use cnt as emphasis or weighting; never copy source sentences verbatim into visible prompts)`,
          `Scene aspect cues by scene (one extra semanticStream.getNext per scene): ${JSON.stringify(compactSceneAspectCues)} (PRIVATE meaning only; use for room/location/object/light/atmosphere transformation, never cast)`,
          `Story transport context: ${compactStoryTransport || 'none'}`,
          ...requestRules,
        ].join('\n'),
      },
    ];

    const requestScenePlan = async (client, activeModel, activeMessages = messages) => {
      const samplingOptions = supportsCustomScenePlanSampling(activeModel)
        ? { temperature, top_p }
        : {};
      const payload = {
        model: activeModel,
        messages: activeMessages,
        response_format: { type: 'json_schema', json_schema: SCENE_PLAN_SCHEMA },
        ...samplingOptions,
      };
      onRequest?.({
        model: activeModel,
        payload,
      });
      logger.payload('scene-plan-request', payload, { maxLength: 20000 });
      const result = await client.chat.completions.create(payload);
      onResponse?.({
        model: activeModel,
        id: result?.id || '',
        usage: result?.usage || null,
        content: result?.choices?.[0]?.message?.content || '',
      });
      logger.payload('scene-plan-response', {
        model: activeModel,
        id: result?.id || '',
        usage: result?.usage || null,
        content: result?.choices?.[0]?.message?.content || '',
      }, { maxLength: 20000 });
      return result;
    };

    let response;
    let activeClient = openai;
    let activeModel = model;
    try {
      response = await requestScenePlan(openai, model);
    } catch (primaryError) {
      if (!fallbackOpenai?.chat?.completions?.create) {
        throw primaryError;
      }

      try {
        activeClient = fallbackOpenai;
        activeModel = fallbackModel || model;
        response = await requestScenePlan(activeClient, activeModel);
      } catch (fallbackError) {
        throw new Error(
          `Scene plan request failed with primary model "${model}": ${primaryError.message}; fallback model "${fallbackModel || model}": ${fallbackError.message}`
        );
      }
    }

    const assertLength = (scenePlan) => {
      if (scenePlan.length === count) {
        return;
      }
      const error = new Error(`Scene plan length mismatch: expected ${count}, received ${scenePlan.length}`);
      error.scenePlan = scenePlan;
      error.resolvedSceneLengths = resolvedSceneLengths.slice(0, scenePlan.length);
      throw error;
    };
    const parseResponse = (result) => {
      const content = result?.choices?.[0]?.message?.content;
      const scenePlan = parseScenePlan(content, count, resolvedSceneLengths);
      assertLength(scenePlan);
      return { content, scenePlan };
    };

    let { content, scenePlan } = parseResponse(response);
    if (!referenceImageActorMode) {
      return scenePlan;
    }

    const validationOptions = { forceImageToVideoOnly };
    const initialIssues = validateReferenceImageActorScenePlan(scenePlan, validationOptions);
    if (initialIssues.length === 0) {
      return scenePlan;
    }

    const repairMessages = [
      ...messages,
      { role: 'assistant', content },
      {
        role: 'user',
        content: [
          'Repair the complete JSON scene plan using your own scene reasoning.',
          'Return the complete plan as JSON matching the schema, not a patch and not an explanation.',
          'Keep valid story fields. Change fields implicated by the listed validation errors, including story fields when the clue or payoff is missing. Derive any revised clue from the supplied vision and semantic material. Do not insert stock or fallback actions.',
          'Keep scene count, exact durations, and every mode tuple that is already correct.',
          'Validation errors:',
          ...initialIssues.map((issue) => `- ${issue}`),
        ].join('\n'),
      },
    ];
    logger.payload('scene-plan-validation-repair', {
      model: activeModel,
      issues: initialIssues,
    }, { maxLength: 12000 });
    const repairedResponse = await requestScenePlan(activeClient, activeModel, repairMessages);
    ({ scenePlan } = parseResponse(repairedResponse));

    const remainingIssues = validateReferenceImageActorScenePlan(scenePlan, validationOptions);
    if (remainingIssues.length > 0) {
      const error = new Error(`Scene plan validation failed after model repair: ${remainingIssues.join('; ')}`);
      error.validationIssues = remainingIssues;
      error.scenePlan = scenePlan;
      throw error;
    }

    return scenePlan;
  };
};

export const getScenePlanEntry = (scenePlan, sceneContext = {}) => {
  if (!Array.isArray(scenePlan) || scenePlan.length === 0) {
    return null;
  }
  const index = Math.max(0, Number(sceneContext?.index || 1) - 1);
  return scenePlan[index] || null;
};

export const compactScenePrompt = (value, maxSentences = 3, maxWords = 55) => {
  const normalized = normalizeString(value).replace(/\s*[\r\n]+\s*/g, ' ').trim();
  if (!normalized) {
    return normalized;
  }

  const sentenceParts = normalized
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, maxSentences);

  const compact = sentenceParts.join(' ');
  const truncatedWords = compact.split(' ').filter(Boolean).slice(0, maxWords).join(' ').trim();
  if (!truncatedWords) {
    return truncatedWords;
  }
  if (/[.!?]$/.test(truncatedWords)) {
    return truncatedWords;
  }

  const lastSentenceStart = Math.max(
    truncatedWords.lastIndexOf('. '),
    truncatedWords.lastIndexOf('! '),
    truncatedWords.lastIndexOf('? ')
  );
  if (lastSentenceStart > 0) {
    return `${truncatedWords.slice(0, lastSentenceStart + 1).trim()}`;
  }
  return `${truncatedWords}.`;
};

export const buildFallbackStillPrompt = (sourcePrompt) => {
  const cue = normalizeString(sourcePrompt, 'a simple real-world subject');
  if (/freshweb documentary still of/i.test(cue) || /\bdocumentary still\b/i.test(cue)) {
    return cue;
  }
  return `freshweb documentary still of ${cue}, natural light, candid framing, realistic detail`;
};

export const buildFallbackVideoPrompt = (scenePlanEntry, fallbackText) => compactScenePrompt(
  [
    normalizeString(scenePlanEntry?.storyBeat || scenePlanEntry?.beat, fallbackText),
    normalizeString(scenePlanEntry?.actorAction),
    normalizeString(scenePlanEntry?.actorsInteraction),
    normalizeString(scenePlanEntry?.motionCue),
    normalizeString(scenePlanEntry?.cameraCue),
  ].filter(Boolean).join(' ')
);
