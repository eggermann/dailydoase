import {
  clampSceneCount,
  normalizeFrameSource,
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

export const supportsCustomScenePlanSampling = (model = '') => (
  !String(model).trim().toLowerCase().startsWith('gpt-5')
);

export const DEFAULT_SCENE_SYSTEM_PROMPT = [
  'You create short visual scene plans for image-to-video generation.',
  'Return only valid JSON.',
  'Build one causal visual story from the ordered source cues. Every next scene must visibly follow from the previous scene and retain a readable residue of it.',
  'Translate abstract or fragmentary cues into embodied events, not commentary, explanation, or topic summaries.',
  'castSelection is an optional list of cast ids from CAST MEMORY that a scene may recall, reintroduce, transform, or ignore. castUse says how that optional memory enters the scene.',
  'actorAction and actorsInteraction may describe body action or exchange when useful; leave either string empty when the scene works through room, atmosphere, transformation, or abstraction instead.',
  'Choose one eventType per scene: actorToLocation, locationToActor, actorToActor, or actorOnly. locationAction names a physical relation between an actor and an existing room feature. storyEvent names the visible cause and consequence that advances the story.',
  'Treat eventType as descriptive metadata, not a constraint on surreal scene invention.',
  'Vary dominant action and camera behavior across adjacent scenes.',
  'stillPrompt describes one destination image. imageDescription describes its visible setup.',
  'motionCue describes physical subject movement; cameraCue describes one camera movement.',
  'videoPrompt and singleImagePrompt are production-ready prompts of 2-3 short sentences containing the actor action, visible consequence, and one camera move. Never include schema or meta instructions.',
  'realityIntrusion is false by default. Set it true only when a source cue deliberately breaks the fictional CCTV world into the live exhibition camera after this scene. It is a hard signal cut, never an interpolated camera move.',
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
            'frameSource',
            'videoMode',
            'durationSeconds',
            'videoPrompt',
            'singleImagePrompt',
            'freshImage',
            'useCameraShot',
            'realityIntrusion',
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

const normalizeSceneRhythm = (rhythm = {}) => {
  if (!rhythm?.enabled) {
    return { enabled: false };
  }

  const minSceneCount = Math.max(1, Math.floor(Number(rhythm.minSceneCount) || 2));
  const maxSceneCount = Math.max(minSceneCount, Math.floor(Number(rhythm.maxSceneCount) || 7));
  const minDurationSeconds = Math.max(1, Number(rhythm.minDurationSeconds) || 2);
  const maxDurationSeconds = Math.max(minDurationSeconds, Number(rhythm.maxDurationSeconds) || 6);

  return {
    enabled: true,
    minSceneCount,
    maxSceneCount,
    minDurationSeconds,
    maxDurationSeconds,
  };
};

export const validateScenePlanRhythm = (scenePlan = [], rhythm = {}) => {
  const normalized = normalizeSceneRhythm(rhythm);
  if (!normalized.enabled) {
    return [];
  }

  const issues = [];
  if (scenePlan.length < normalized.minSceneCount || scenePlan.length > normalized.maxSceneCount) {
    issues.push(
      `scene count must be between ${normalized.minSceneCount} and ${normalized.maxSceneCount}; received ${scenePlan.length}`
    );
  }

  scenePlan.forEach((scene, index) => {
    const duration = Number(scene?.durationSeconds);
    if (!Number.isFinite(duration)
      || duration < normalized.minDurationSeconds
      || duration > normalized.maxDurationSeconds) {
      issues.push(
        `scene ${index + 1}: durationSeconds must be between ${normalized.minDurationSeconds} and ${normalized.maxDurationSeconds}; received ${scene?.durationSeconds}`
      );
    }
  });

  return issues;
};

const EMPTY_SCENE_ACTION_PATTERN = /^(?:none|null|n\/?a|not applicable|no action|no interaction)[.!]?$/i;

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

  scenePlan.forEach((scene, index) => {
    const label = `scene ${index + 1}`;
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
  storyTransport,
  forceImageToVideoOnly = false,
  realityIntrusionMode = 'off',
  rhythm = null,
  onFallback,
} = {}) => {
  if (typeof generateScenes !== 'function') {
    throw new Error('generateScenePlanWithFallback requires a generateScenes function');
  }

  let targetSceneCount = clampSceneCount(sceneCount);

  while (targetSceneCount >= 1) {
    try {
      const activeSceneLengths = Array.isArray(sceneLengths)
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
        storyTransport,
        forceImageToVideoOnly,
        realityIntrusionMode,
        rhythm,
      });

      return {
        scenePlan,
        effectiveSceneCount: scenePlan.length,
        effectiveSceneLengths: rhythm?.enabled
          ? scenePlan.map((scene) => Number(scene?.durationSeconds))
          : activeSceneLengths,
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
} = {}) => {
  if (!openai?.chat?.completions?.create) {
    throw new Error('createSceneGenerator requires an OpenAI-compatible client');
  }

  const resolvedSystemPrompt = normalizeString(systemPrompt, DEFAULT_SCENE_SYSTEM_PROMPT);

  return async ({
    sourceCues = [],
    sceneLengths = [],
    sceneCount = 3,
    visualDirection = '',
    visionStoryContext = '',
    storyTransport = '',
    configMode = 'generated',
    sceneFlavor = 'default',
    forceImageToVideoOnly = false,
    realityIntrusionMode = 'off',
    rhythm = null,
  } = {}) => {
    const normalizedRhythm = normalizeSceneRhythm(rhythm);
    const count = normalizedRhythm.enabled
      ? normalizedRhythm.maxSceneCount
      : clampSceneCount(sceneCount);
    const resolvedSceneLengths = normalizedRhythm.enabled
      ? []
      : await resolveSceneLengthsInput(sceneLengths, count, 3);
    const trimmedCues = sourceCues
      .map((cue) => normalizeString(cue))
      .filter(Boolean)
      .slice(0, count);
    const normalizedVisionStoryContext = normalizeString(visionStoryContext);

    const referenceImageActorMode = isReferenceImageActorMode(configMode);
    const trippyMode = normalizeString(sceneFlavor, 'default').toLowerCase() === 'ltxtrippy';
    const requestRules = [
      'Keep Current topic word as the stable subject. Source cues transform it but never replace it.',
      'Use cues in order as a causal chain. Each scene inherits one visible consequence from the previous scene.',
      'Use detected actors, positions, orientations, and room geometry as source material, not hard creative limits.',
      'Make eventType explicit as descriptive metadata. Actor fields may remain empty when transformation, atmosphere, abstraction, or room behavior carries the scene.',
      'locationAction and storyEvent may be physical, atmospheric, abstract, typographic, or surreal when the source cues support it.',
      'CAST MEMORY is optional. For each scene, choose up to nine listed cast ids in castSelection when a past person or frame helps the story; otherwise return an empty array. castUse explains the selected use without imposing identity continuity.',
      'Vary the dominant visual event and camera behavior across adjacent scenes.',
      ...(normalizedRhythm.enabled
        ? [
            `You own the rhythm: return ${normalizedRhythm.minSceneCount} to ${normalizedRhythm.maxSceneCount} scenes, not a fixed count.`,
            `Each durationSeconds must be a whole number from ${normalizedRhythm.minDurationSeconds} to ${normalizedRhythm.maxDurationSeconds}. Choose durations from the visible action and transition weight.`,
          ]
        : []),
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
          ...(normalizedRhythm.enabled
            ? [
                `Scene count: choose ${normalizedRhythm.minSceneCount}-${normalizedRhythm.maxSceneCount}.`,
                `Scene durations: choose whole seconds ${normalizedRhythm.minDurationSeconds}-${normalizedRhythm.maxDurationSeconds} per scene.`,
              ]
            : [
                `Scene count: ${count}`,
                `Scene lengths (seconds): ${resolvedSceneLengths.join(', ') || '3'}`,
                `Total film duration (seconds): ${resolvedSceneLengths.reduce((sum, value) => sum + Number(value || 0), 0) || 3}`,
              ]),
          `Config mode: ${normalizeString(configMode, 'generated')}`,
          `Scene flavor: ${normalizeString(sceneFlavor, 'default')}`,
          `Visual direction: ${normalizeString(visualDirection, 'documentary, realistic, concise')}`,
          `Source cues (ordered semantic story anchors): ${JSON.stringify(trimmedCues)}`,
          `Story transport context: ${normalizeString(storyTransport, 'none')}`,
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
      logger.payload('scene-plan-request', payload, { maxLength: 20000 });
      const result = await client.chat.completions.create(payload);
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
      if (normalizedRhythm.enabled) {
        return;
      }
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
      const scenePlan = parseScenePlan(
        content,
        count,
        normalizedRhythm.enabled ? [] : resolvedSceneLengths
      );
      assertLength(scenePlan);
      return { content, scenePlan };
    };

    let { content, scenePlan } = parseResponse(response);
    const validationOptions = { forceImageToVideoOnly };
    const initialIssues = [
      ...validateScenePlanRhythm(scenePlan, normalizedRhythm),
      ...(referenceImageActorMode
        ? validateReferenceImageActorScenePlan(scenePlan, validationOptions)
        : []),
    ];
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
          'Keep all creative story fields unless a listed technical error requires changing them. Do not insert stock or fallback actions.',
          normalizedRhythm.enabled
            ? `Keep scene count within ${normalizedRhythm.minSceneCount}-${normalizedRhythm.maxSceneCount}; keep every durationSeconds within ${normalizedRhythm.minDurationSeconds}-${normalizedRhythm.maxDurationSeconds}; preserve valid rhythm choices and mode tuples.`
            : 'Keep scene count, exact durations, and every mode tuple that is already correct.',
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

    const remainingIssues = [
      ...validateScenePlanRhythm(scenePlan, normalizedRhythm),
      ...(referenceImageActorMode
        ? validateReferenceImageActorScenePlan(scenePlan, validationOptions)
        : []),
    ];
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
