import { expect, jest, test } from '@jest/globals';

import {
  createSceneGenerator,
  generateScenePlanWithFallback,
  getScenePlanEntry,
  parseScenePlanLengthMismatch,
  parseScenePlan,
  repairSemanticScenePlanEntry,
  resolveSceneCountFromConfig,
  resolveSceneLengthsInput,
  supportsCustomScenePlanSampling,
} from './scene-generator.js';

test('repairSemanticScenePlanEntry preserves immutable cue identity without a stream', async () => {
  const client = {
    chat: {
      completions: {
        create: jest.fn(async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                semanticAnchor: 'invented anchor',
                semanticCollision: 'invented collision',
                durationSeconds: 2,
              }),
            },
          }],
        })),
      },
    },
  };
  const cueRecord = {
    anchor: { term: 'exhibition' },
    collision: { term: 'hunger' },
  };

  const repaired = await repairSemanticScenePlanEntry({
    client,
    model: 'gpt-4.1-mini',
    cueRecord,
    invalidScene: { index: 3, durationSeconds: 2 },
    validationErrors: ['semanticDerivation is missing'],
  });

  expect(repaired.semanticAnchor).toBe('exhibition');
  expect(repaired.semanticCollision).toBe('hunger');
  expect(repaired.index).toBe(3);
  expect(client.chat.completions.create).toHaveBeenCalledTimes(1);
  expect(client.chat.completions.create.mock.calls[0][0].messages[1].content)
    .toContain('Do not consume or invent another Semantic Stream term.');
});

test('supportsCustomScenePlanSampling protects GPT-5 A/B runs from unsupported sampling options', () => {
  expect(supportsCustomScenePlanSampling('gpt-4.1-mini-2025-04-14')).toBe(true);
  expect(supportsCustomScenePlanSampling('gpt-5-mini-2025-08-07')).toBe(false);
});

test('parseScenePlan parses JSON scene objects with scenes arrays', () => {
  const scenePlan = parseScenePlan(JSON.stringify({
    scenes: [
      {
        title: 'Opening',
        beat: 'setup',
        stillPrompt: 'a hand holding a seedling',
        imageDescription: 'close-up hand holding a seedling in warm light',
        storyBeat: 'introduce the seedling',
        motionCue: 'slow pull back',
        cameraCue: 'gentle rise',
        frameSource: 'lastFrame',
        videoMode: 'singleImage',
        durationSeconds: 1,
        videoPrompt: 'Move from the opening frame into a brighter workshop reveal.',
        singleImagePrompt: 'Subtle motion from the current frame with a gentle rise.',
        freshImage: false,
        useCameraShot: false,
      },
      {
        title: 'Middle',
        beat: 'development',
        stillPrompt: 'a classroom with sketches',
        imageDescription: 'students in a bright classroom examining sketches',
        storyBeat: 'move into a classroom',
        motionCue: 'glide forward',
        cameraCue: 'stable handheld',
        frameSource: 'newImage',
        videoMode: 'firstLast',
        durationSeconds: 2,
        videoPrompt: 'Move from the classroom into a clear destination reveal.',
        singleImagePrompt: 'Begin in the classroom and add restrained forward motion.',
        freshImage: true,
        useCameraShot: false,
      },
    ],
  }), 2);

  expect(scenePlan).toHaveLength(2);
  expect(scenePlan[0].index).toBe(1);
  expect(scenePlan[1].title).toBe('Middle');
  expect(scenePlan[1].freshImage).toBe(true);
  expect(scenePlan[1].frameSource).toBe('newImage');
  expect(scenePlan[1].videoMode).toBe('firstLast');
  expect(scenePlan[1].durationSeconds).toBe(2);
  expect(scenePlan[1].videoPrompt.length).toBeGreaterThan(0);
  expect(scenePlan[1].singleImagePrompt.length).toBeGreaterThan(0);
});

test('parseScenePlan preserves source terms and their English prompt translations', () => {
  const [scene] = parseScenePlan(JSON.stringify({
    scenes: [{
      semanticAnchor: 'Kaufhaus',
      semanticAnchorEnglish: 'department store',
      semanticCollision: 'Rolltreppe',
      semanticCollisionEnglish: 'escalator',
    }],
  }), 1);

  expect(scene).toMatchObject({
    semanticAnchor: 'Kaufhaus',
    semanticAnchorEnglish: 'department store',
    semanticCollision: 'Rolltreppe',
    semanticCollisionEnglish: 'escalator',
  });
});

test('getScenePlanEntry selects by sceneContext index', () => {
  const scenePlan = [
    { index: 1, title: 'Opening' },
    { index: 2, title: 'Middle' },
    { index: 3, title: 'Payoff' },
  ];

  expect(getScenePlanEntry(scenePlan, { index: 2 })).toEqual(scenePlan[1]);
});

test('resolveSceneCountFromConfig uses sceneLengths length when no explicit scene count is set', () => {
  expect(resolveSceneCountFromConfig({
    sceneLengths: [3, 3, 3],
    defaultSceneCount: 6,
  })).toBe(3);
});

test('resolveSceneCountFromConfig prefers explicit scene count over sceneLengths length', () => {
  expect(resolveSceneCountFromConfig({
    sceneLengths: [3, 3, 3],
    sceneCount: 5,
    defaultSceneCount: 6,
  })).toBe(5);
});

test('resolveSceneLengthsInput accepts function results like tm.getNext()', async () => {
  let step = 0;
  const sceneLengths = await resolveSceneLengthsInput(() => {
    const values = [
      { timeoutMillis: 625 },
      { timeoutMillis: 1400 },
      { durationSeconds: 2 },
    ];
    const value = values[step];
    step += 1;
    return value;
  }, 3, 3);

  expect(sceneLengths).toEqual([1, 1, 2]);
});

test('createSceneGenerator tells the model to use source cues as the story spine', async () => {
  const create = jest.fn(async (request) => ({
    choices: [
      {
        message: {
          content: JSON.stringify({
            scenes: [
              {
                title: 'Claustrophobic Opening',
                beat: 'the threat enters the room',
                stillPrompt: 'the subject freezes as dread rises in the tight industrial room',
                imageDescription: 'close-up tension in a cramped room with the subject staring upward',
                storyBeat: 'the horror cue enters the shot as dread',
                motionCue: 'eyes widen and shoulders stiffen',
                cameraCue: 'slow uneasy push-in',
                frameSource: 'newImage',
                videoMode: 'singleImage',
                durationSeconds: 4,
                videoPrompt: 'The subject stiffens as dread fills the room and the camera edges closer.',
                singleImagePrompt: 'The subject holds still, then tenses as fear becomes visible in the face.',
                freshImage: true,
                useCameraShot: true,
              },
            ],
          }),
        },
      },
    ],
  }));
  const generateScenes = createSceneGenerator({
    openai: {
      chat: {
        completions: {
          create,
        },
      },
    },
    model: 'gpt-test',
  });

  await generateScenes({
    sceneCount: 1,
    sceneLengths: [4],
    sourceCueRecords: [{
      sceneIndex: 0,
      anchor: { term: 'Hostel' },
      collision: { term: 'Body-Horror', description: 'body horror' },
      dramaticFunction: 'opening',
    }],
    visualDirection: 'camera horror',
    visionStoryContext: 'Location: an industrial room. Actors: [{"reference":"the actor","description":"one frightened person"}]. Description: tight close-up with hard side light.',
    configMode: 'camera',
  });

  expect(create).toHaveBeenCalledTimes(1);
  const request = create.mock.calls[0][0];
  const userMessage = request.messages[1].content;

  expect(request.messages[0].content).toContain('Each scene receives an inherited Semantic Anchor and a fresh Semantic Collision.');
  expect(request.response_format.json_schema.schema.properties.scenes.items.required)
    .toEqual(expect.arrayContaining(['event', 'consequence', 'stillPrompt', 'videoPrompt']));
  expect(userMessage).toContain('CREATURE\ncamera horror');
  expect(userMessage).toContain('LOCATION\nLocation: an industrial room.');
  expect(userMessage).toContain('SEQUENCE\n1 scenes; durations in seconds: 4');
  expect(userMessage).toContain('SEMANTIC CUES');
  expect(userMessage).toContain('"term":"Hostel"');
  expect(userMessage).toContain('TASK\nCreate complete sequence.');
});

test('createSceneGenerator prepends semantic priority to custom system prompts', async () => {
  const create = jest.fn(async () => ({
    choices: [{
      message: {
        content: JSON.stringify({ scenes: [{ title: 'Legacy custom scene' }] }),
      },
    }],
  }));
  const generateScenes = createSceneGenerator({
    openai: { chat: { completions: { create } } },
    model: 'gpt-test',
    systemPrompt: 'Custom camera planner instructions.',
  });

  await generateScenes({ sceneCount: 1, sceneLengths: [2] });

  const systemMessage = create.mock.calls[0][0].messages[0].content;
  expect(systemMessage).toContain('Create a coherent sequence of short cinematic monster scenes.');
  expect(systemMessage).toContain('Custom camera planner instructions.');
});

test('createSceneGenerator asks for surreal visible events in ltxTrippy mode', async () => {
  const create = jest.fn(async () => ({
    choices: [
      {
        message: {
          content: JSON.stringify({
            scenes: [
              {
                title: 'Room Overtaken',
                beat: 'a wave of colored shadow overtakes the room',
                stillPrompt: 'the room bends as colored shadows spread across the walls',
                imageDescription: 'surreal room with bent geometry and the actor caught in a color surge',
                storyBeat: 'the cue takes over the visible room',
                motionCue: 'shadows spread across the walls and the actor recoils',
                cameraCue: 'the camera drifts sideways as the room warps',
                frameSource: 'newImage',
                videoMode: 'singleImage',
                durationSeconds: 4,
                videoPrompt: 'Colored shadows swallow the room as the actor recoils and the camera drifts.',
                singleImagePrompt: 'The room bends and floods with color while the actor tries to hold position.',
                freshImage: true,
                useCameraShot: true,
              },
            ],
          }),
        },
      },
    ],
  }));
  const generateScenes = createSceneGenerator({
    openai: {
      chat: {
        completions: {
          create,
        },
      },
    },
    model: 'gpt-test',
  });

  await generateScenes({
    sceneCount: 1,
    sceneLengths: [4],
    sourceCues: ['Dark romanticism', 'fried dough'],
    visualDirection: 'camera surreal',
    visionStoryContext: 'Location: studio. Actors: [{"reference":"the actor","description":"one seated person"}]. Description: medium shot in a dim room.',
    configMode: 'camera',
    sceneFlavor: 'ltxTrippy',
  });

  const request = create.mock.calls[0][0];
  const userMessage = request.messages[1].content;

  expect(userMessage).toContain('CREATURE\ncamera surreal');
  expect(userMessage).toContain('LOCATION\nLocation: studio.');
});

test('parseScenePlanLengthMismatch reads expected and received counts from errors', () => {
  expect(
    parseScenePlanLengthMismatch(new Error('Scene plan length mismatch: expected 6, received 5'))
  ).toEqual({
    expected: 6,
    received: 5,
  });
});

test('generateScenePlanWithFallback keeps requested count in one complete plan', async () => {
  const generateScenes = jest.fn(async ({ sceneCount }) => Array.from({ length: sceneCount }, (_, index) => ({
    semanticAnchor: `anchor-${index + 1}`,
    semanticCollision: `collision-${index + 1}`,
    event: 'A physical event.',
    consequence: 'A visible result.',
    stillPrompt: 'A decisive still.',
    videoPrompt: 'The event moves.',
  })));

  const result = await generateScenePlanWithFallback({
    generateScenes,
    sceneCount: 6,
    sceneLengths: [6.4, 1.6, 3.2, 1.6, 4.8, 1.6],
    configMode: 'camera',
    visualDirection: 'documentary',
    visionStoryContext: 'office',
    sourceCues: ['horror', 'fries'],
    strictSemanticValidation: false,
  });

  expect(generateScenes).toHaveBeenCalledTimes(1);
  expect(generateScenes.mock.calls[0][0].sceneCount).toBe(6);
  expect(result.effectiveSceneCount).toBe(6);
  expect(result.effectiveSceneLengths).toEqual([6.4, 1.6, 3.2, 1.6, 4.8, 1.6]);
  expect(result.scenePlan).toHaveLength(6);
});

test('generateScenePlanWithFallback repairs semantic failures before strict abort', async () => {
  const generateScenes = jest.fn(async () => [{
    semanticAnchor: 'exhibition',
    semanticCollision: 'archive',
  }]);
  const sourceCueRecords = [{
    sceneIndex: 0,
    sceneCount: 1,
    anchor: { term: 'exhibition', role: 'initialConfiguredTerm' },
    collision: { term: 'archive', streamLabel: '1983', description: 'archive stores history' },
  }];

  await expect(generateScenePlanWithFallback({
    generateScenes,
    sceneCount: 1,
    sceneLengths: [2],
    sourceCues: ['legacy serialized cue'],
    sourceCueRecords,
    maxSemanticRepairAttempts: 2,
  })).rejects.toMatchObject({
    name: 'SemanticSceneValidationError',
  });

  expect(generateScenes).toHaveBeenCalledTimes(2);
  expect(generateScenes.mock.calls[1][0].repairContext).toMatchObject({
    invalidScenePlan: expect.any(Array),
  });
  expect(generateScenes.mock.calls[1][0].repairContext.validationErrors).toContain(
    'Scene 1: missing event.'
  );
});

test('generateScenePlanWithFallback repairs malformed JSON once with saved cue records', async () => {
  const sourceCueRecords = [{
    anchor: { term: 'exhibition' },
    collision: { term: 'archive' },
  }];
  const generateScenes = jest.fn(async ({ repairContext }) => {
    if (!repairContext) {
      const error = new Error('Unexpected token');
      error.rawScenePlan = '{not json';
      throw error;
    }
    return [{
      semanticAnchor: 'exhibition',
      semanticCollision: 'archive',
      event: 'The archive closes around one light.',
      consequence: 'One sealed light remains.',
      stillPrompt: 'A sealed light inside the archive.',
      videoPrompt: 'The light closes into the archive.',
    }];
  });

  const result = await generateScenePlanWithFallback({
    generateScenes,
    sceneCount: 1,
    sceneLengths: [2],
    sourceCueRecords,
  });

  expect(result.semanticValidation.valid).toBe(true);
  expect(generateScenes).toHaveBeenCalledTimes(2);
  expect(generateScenes.mock.calls[1][0].sourceCueRecords).toEqual(sourceCueRecords);
  expect(generateScenes.mock.calls[1][0].repairContext).toMatchObject({
    invalidScenePlan: '{not json',
  });
});
