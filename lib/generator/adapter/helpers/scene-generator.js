import {
  clampSceneCount,
  normalizeFrameSource,
  normalizeSceneLengthValue,
  normalizeString,
  normalizeVideoMode,
  stripCodeFences,
} from './scene-generator-helpers.js';

export const DEFAULT_SCENE_SYSTEM_PROMPT = [
  'You create short visual scene plans for image-to-video generation.',
  'Return only valid JSON.',
  'Build one simple story arc, but make every scene visibly different from the previous scene.',
  'Source cues are the semantic story anchors for the plan. They must drive the story, not sit in the background as optional inspiration.',
  'Treat source cues as an ordered wordstream. The sequence and adjacency of cue words should visibly shift scene state over time.',
  'Every scene must clearly reflect the source cues through title, beat, storyBeat, stillPrompt, imageDescription, and prompt wording.',
  'When source cues are genres, titles, keywords, or fragments rather than a full synopsis, infer a coherent micro-story from them and make that inferred story visible across the sequence.',
  'Turn the source cues into embodied, visible scene events rather than commentary, taxonomy, explanation, or topic-summary.',
  'Do not default to a generic presenter, explainer, interview, or host-discussion structure unless the source cues explicitly describe that format.',
  'Prefer titles, beats, and storyBeat text built from concrete visible action, emotional pressure, framing change, and physical behavior.',
  'Avoid generic scene labels like "Initial Setup", "Engaging with the Audience", "Reflective Moment", or "Concluding Thoughts" unless the source cues clearly justify them.',
  'Adjacent scenes must not reuse the same dominant beat skeleton, motion skeleton, or camera skeleton unless the cue progression itself clearly repeats.',
  'For scenes after the first, stillPrompt must describe the next destination image the shot should arrive at, not a paraphrase of the previous frame.',
  'Change at least the setting, primary action, or framing emphasis in every next scene.',
  'Each scene object must explicitly describe how the scene is set up.',
  'stillPrompt must describe one still image.',
  'imageDescription must describe the visible image setup for the scene in plain terms.',
  'frameSource must be either "lastFrame" or "newImage". Use "lastFrame" when the scene should continue from the previous video last frame. Use "newImage" when the scene should start from a newly generated image.',
  'videoMode must be either "firstLast" or "singleImage".',
  'durationSeconds must be the real clip duration for that scene in seconds.',
  'The sum of all durationSeconds values should match the total requested film duration as closely as possible.',
  'videoPrompt must be a final ready-to-use prompt for first-last image-to-video mode, not notes or instructions.',
  'singleImagePrompt must be a final ready-to-use prompt for single-image video mode, not notes or instructions.',
  'Both videoPrompt and singleImagePrompt must be short, concrete, and production-ready.',
  'Each of those prompt fields should usually be 2 to 3 short sentences.',
  'Each video prompt must focus on visible action, scene change, and one camera move.',
  'Do not write meta instructions, labels, bullet points, or explanations inside the prompt fields.',
  'Do not mention JSON, schema, scene object, first sentence, second sentence, or any prompt-writing instructions inside the prompt fields.',
  'If videoMode is "firstLast", videoPrompt must clearly move from the current frame toward the destination scene.',
  'If videoMode is "singleImage", singleImagePrompt must animate the current frame with believable motion without requiring a generated end frame.',
  'storyBeat must explain what new moment this scene adds.',
  'motionCue and cameraCue must be short and concrete.',
  'freshImage must match the setup choice: true when a new image is needed, false when the previous last frame should be reused.',
  'useCameraShot must be a boolean. Only set it true when configMode is "camera" and the scene should use the webcam-shot flow. Otherwise set it false.',
  'When configMode is "camera", derive the scene location, actor identity, and visible setup from the vision story context.',
  'When configMode is "camera", let each wordstream step visibly alter either location emphasis, actor movement, or sensory atmosphere while staying inside the same real shot.',
  'When configMode is "camera", use the location description and actor descriptions from the vision story context as the grounding basis for every scene.',
  'When configMode is "camera", do not introduce new visible scene elements that are not supported by the vision story context.',
  'When configMode is "camera", each cue must shape beat and storyBeat, and must visibly affect at least one of motionCue, cameraCue, stillPrompt, or imageDescription.',
  'When configMode is "camera", if the source cues imply unseen objects or events, express them through reaction, posture, gaze, facial change, framing, or lighting emphasis instead of inserting the unseen object into the shot.',
  'When configMode is "camera", make every scene feel physically readable and cinematically charged; avoid abstract or essay-like beats when a bodily or framing-based change can carry the same idea.',
  'When cue text is fragmentary, infer a concrete visible consequence for the current shot instead of defaulting to generic emotional placeholders or repeated scene templates.',
  'When configMode is "camera" and videoMode is "firstLast", the destination may only change pose, gaze, expression, crop, framing emphasis, or lighting inside the same visible room; do not invent a new prop-driven setup.',
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
            'motionCue',
            'cameraCue',
            'frameSource',
            'videoMode',
            'durationSeconds',
            'videoPrompt',
            'singleImagePrompt',
            'freshImage',
            'useCameraShot',
          ],
          properties: {
            title: { type: 'string' },
            beat: { type: 'string' },
            stillPrompt: { type: 'string' },
            imageDescription: { type: 'string' },
            storyBeat: { type: 'string' },
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

export const parseScenePlan = (value, sceneCount = 3, resolvedSceneLengths = []) => {
  const count = clampSceneCount(sceneCount);
  const parsed = JSON.parse(stripCodeFences(value));
  if (!Array.isArray(parsed?.scenes)) {
    throw new Error('Scene plan response must be an object with a scenes array');
  }

  return parsed.scenes.slice(0, count).map((item, index) => ({
    index: index + 1,
    title: normalizeString(item?.title, `Scene ${index + 1}`),
    beat: normalizeString(item?.beat, ''),
    stillPrompt: normalizeString(item?.stillPrompt, ''),
    imageDescription: normalizeString(item?.imageDescription, ''),
    storyBeat: normalizeString(item?.storyBeat, ''),
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
  }));
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
  visualDirection,
  visionStoryContext,
  sourceCues,
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
        visualDirection,
        visionStoryContext,
        sourceCues,
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
  model,
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
    configMode = 'generated',
  } = {}) => {
    const count = clampSceneCount(sceneCount);
    const resolvedSceneLengths = await resolveSceneLengthsInput(sceneLengths, count, 3);
    const trimmedCues = sourceCues
      .map((cue) => normalizeString(cue))
      .filter(Boolean)
      .slice(0, count);
    const normalizedVisionStoryContext = normalizeString(visionStoryContext);

    const response = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: resolvedSystemPrompt,
        },
        {
          role: 'user',
          content: [
            `Scene count: ${count}`,
            `Scene lengths (seconds): ${resolvedSceneLengths.join(', ') || '3'}`,
            `Total film duration (seconds): ${resolvedSceneLengths.reduce((sum, value) => sum + Number(value || 0), 0) || 3}`,
            `Config mode: ${normalizeString(configMode, 'generated')}`,
            `Visual direction: ${normalizeString(visualDirection, 'documentary, realistic, concise')}`,
            `Source cues (ordered semantic story anchors): ${JSON.stringify(trimmedCues)}`,
            'Wordstream rule: treat source cues as an ordered wordstream and map each next cue into a visible scene-state shift.',
            'Story requirement: treat the source cues as the story spine. Build a coherent micro-story that starts from the early cues and develops, escalates, or transforms through the later cues.',
            'If the source cues are genres, titles, or keywords, infer concrete visual story beats from them instead of falling back to a generic host, explainer, or discussion format.',
            'Prefer embodied scene beats with visible stakes, gesture, posture, expression, framing pressure, or environmental tension over abstract explanation or topic-summary wording.',
            'Adjacent scenes must not repeat the same dominant beat skeleton, motion pattern, or camera pattern unless the cue progression itself repeats.',
            'Wordstream visual mapping: express cue changes through location emphasis (which part of the room/background dominates), actor movement/body language, and sensory visual description (light, texture, atmosphere, tension).',
            'Cue consequence rule: each cue must change beat and storyBeat, and must also change at least one of motionCue, cameraCue, stillPrompt, or imageDescription in a visible way.',
            'If cue text is fragmentary, infer a concrete visible consequence in the shot instead of falling back to generic placeholders like reflection, discussion, or vague tension.',
            normalizedVisionStoryContext
              ? `Vision story context from the source shot: ${normalizedVisionStoryContext}`
              : 'Vision story context from the source shot: n/a',
            normalizedVisionStoryContext
              ? 'If vision story context is provided, use it as continuity for each scene, especially location, actors, and visible-shot description.'
              : 'If vision story context is provided, use it as continuity for each scene.',
            `Camera-mode reminder: ${
              normalizeString(configMode, 'generated') === 'camera'
                ? 'keep the story inside the real visible shot, but still let the source cues control the emotional arc, tension, and implied events.'
                : 'n/a'
            }`,
            `Camera-mode visible-anchor rule: ${
              normalizeString(configMode, 'generated') === 'camera'
                ? 'use the vision story context as the source of truth for location, actor identity, and visible scene setup. Build stillPrompt, imageDescription, motionCue, cameraCue, videoPrompt, and singleImagePrompt from that visible basis instead of inventing unsupported elements.'
                : 'n/a'
            }`,
            `Camera-mode firstLast rule: ${
              normalizeString(configMode, 'generated') === 'camera'
                ? 'use firstLast only for small believable changes between start and destination inside the same visible room, such as pose, gaze, expression, crop, or lighting emphasis. Do not use firstLast to reveal new objects or widen into a new setup.'
                : 'n/a'
            }`,
          ].join('\n'),
        },
      ],
      response_format: { type: 'json_schema', json_schema: SCENE_PLAN_SCHEMA },
      temperature,
      top_p,
    });

    const content = response?.choices?.[0]?.message?.content;
    const scenePlan = parseScenePlan(content, count, resolvedSceneLengths);

    if (scenePlan.length !== count) {
      const error = new Error(`Scene plan length mismatch: expected ${count}, received ${scenePlan.length}`);
      error.scenePlan = scenePlan;
      error.resolvedSceneLengths = resolvedSceneLengths.slice(0, scenePlan.length);
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
  `${normalizeString(scenePlanEntry?.storyBeat || scenePlanEntry?.beat, fallbackText)} ${normalizeString(scenePlanEntry?.motionCue)} ${normalizeString(scenePlanEntry?.cameraCue)}`
);
