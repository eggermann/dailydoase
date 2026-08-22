const TRANSPORT_SCHEMA = {
  name: 'scene_boundary_transport',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['command', 'reason', 'storyBridge', 'transitionPrompt'],
    properties: {
      command: { type: 'string', enum: ['continue', 'locationReturn', 'cameraReset'] },
      reason: { type: 'string' },
      storyBridge: { type: 'string' },
      transitionPrompt: { type: 'string' },
    },
  },
};

const normalizeText = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

export const applySceneBoundaryTransport = (scene = {}, decision = {}) => {
  const command = normalizeText(decision.command) || 'continue';
  const transitionPrompt = normalizeText(decision.transitionPrompt);
  const storyBridge = normalizeText(decision.storyBridge);
  const promptSuffix = [storyBridge, transitionPrompt].filter(Boolean).join(' ');
  const next = {
    ...scene,
    boundaryTransport: {
      ...decision,
      command,
    },
    ...(promptSuffix ? {
      videoPrompt: [normalizeText(scene.videoPrompt), promptSuffix].filter(Boolean).join(' '),
      singleImagePrompt: [normalizeText(scene.singleImagePrompt), promptSuffix].filter(Boolean).join(' '),
    } : {}),
  };

  if (command === 'locationReturn') {
    return { ...next, frameSource: 'lastFrame', videoMode: 'firstLast', freshImage: false, useCameraShot: true };
  }
  if (command === 'cameraReset') {
    return { ...next, frameSource: 'newImage', videoMode: 'singleImage', freshImage: true, useCameraShot: true };
  }
  return { ...next, frameSource: 'lastFrame', videoMode: 'singleImage', freshImage: false, useCameraShot: false };
};

export const createSceneBoundaryTransportDecider = ({
  openai,
  model,
  fallbackOpenai,
  fallbackModel = '',
} = {}) => {
  if (!openai?.chat?.completions?.create) {
    throw new Error('createSceneBoundaryTransportDecider requires an OpenAI-compatible client');
  }

  return async ({ completedScene = {}, nextScene = {}, generatedLastFramePath = '', cameraShot = {}, roomMemory = '', storyTransport = '' } = {}) => {
    const messages = [{
      role: 'system',
      content: [
        'You direct transport between two already ordered video scenes in an endless exhibition film.',
        'Choose continue to animate from the generated last frame without inserting the camera shot.',
        'Choose locationReturn to interpolate from the generated last frame into the fresh real camera room shot.',
        'Choose cameraReset to cut and start the next scene directly from the fresh camera room shot.',
        'A new visible visitor may enter through locationReturn or cameraReset only when it advances the story. It is optional.',
        'Use visible room assets as possible action partners and destinations. Preserve causal story residue.',
        'Never claim a person exists when fresh camera vision reports none. Never require a return on a timer.',
        'transitionPrompt must describe visible motion and camera behavior for selected transport, not schema instructions.',
        'Return only valid JSON.',
      ].join(' '),
    }, {
      role: 'user',
      content: [
        `Completed scene: ${JSON.stringify(completedScene)}`,
        `Next planned scene: ${JSON.stringify(nextScene)}`,
        `Generated last frame available: ${Boolean(generatedLastFramePath)}.`,
        `Fresh camera vision: ${normalizeText(cameraShot.visionSummary || cameraShot.visionText) || 'unavailable'}`,
        `Fresh camera image available: ${Boolean(cameraShot.imagePath)}.`,
        normalizeText(roomMemory),
        `Story transport: ${normalizeText(storyTransport) || 'none'}`,
      ].join('\n'),
    }];
    const payload = {
      model,
      messages,
      response_format: { type: 'json_schema', json_schema: TRANSPORT_SCHEMA },
    };

    let response;
    let activeModel = model;
    try {
      response = await openai.chat.completions.create(payload);
    } catch (primaryError) {
      if (!fallbackOpenai?.chat?.completions?.create) throw primaryError;
      activeModel = fallbackModel || model;
      response = await fallbackOpenai.chat.completions.create({ ...payload, model: activeModel });
    }
    const content = response?.choices?.[0]?.message?.content || '';
    const parsed = JSON.parse(content);
    return {
      command: parsed.command,
      reason: normalizeText(parsed.reason),
      storyBridge: normalizeText(parsed.storyBridge),
      transitionPrompt: normalizeText(parsed.transitionPrompt),
      request: { ...payload, model: activeModel },
      response: { id: response?.id || '', model: activeModel, usage: response?.usage || null, content },
    };
  };
};

export default createSceneBoundaryTransportDecider;
