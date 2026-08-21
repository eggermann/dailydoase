import { expect, jest, test } from '@jest/globals';

import {
  createSceneGenerator,
  generateScenePlanWithFallback,
  getScenePlanEntry,
  parseScenePlanLengthMismatch,
  parseScenePlan,
  normalizeSceneAction,
  resolveSceneCountFromConfig,
  resolveSceneLengthsInput,
  supportsCustomScenePlanSampling,
  validateReferenceImageActorScenePlan,
} from './scene-generator.js';

test('normalizeSceneAction treats model placeholders as empty', () => {
  expect(normalizeSceneAction('None')).toBe('');
  expect(normalizeSceneAction('N/A')).toBe('');
  expect(normalizeSceneAction('No interaction')).toBe('');
  expect(normalizeSceneAction('The artist lowers one hand.')).toBe('The artist lowers one hand.');
});

test('GPT-5 scene planners omit unsupported custom sampling parameters', () => {
  expect(supportsCustomScenePlanSampling('gpt-5-mini-2025-08-07')).toBe(false);
  expect(supportsCustomScenePlanSampling('gpt-5')).toBe(false);
  expect(supportsCustomScenePlanSampling('gpt-4.1-mini-2025-04-14')).toBe(true);
});

test('reference-image-actor validation ignores creative actor and typography choices', () => {
  const baseScene = {
    eventType: 'actorToLocation',
    actorAction: 'The artist presses both palms against the existing canvas.',
    actorsInteraction: '',
    locationAction: 'The existing canvas bends toward the artist.',
    storyEvent: 'The cue wort folds the artist posture into the canvas.',
    beat: 'The artist and canvas compress into one physical gesture.',
    stillPrompt: 'The artist presses into the bending canvas.',
    imageDescription: 'The same artist and studio at the end of the push.',
    storyBeat: 'Pressure changes the relation between body and room.',
    motionCue: 'The artist presses both palms against the existing canvas.',
    cameraCue: 'Track toward the canvas.',
    videoPrompt: 'The artist pushes and the canvas bends.',
    singleImagePrompt: 'The artist presses both palms against the existing canvas. The canvas bends.',
    frameSource: 'newImage',
    videoMode: 'singleImage',
    freshImage: true,
    useCameraShot: true,
  };
  const options = {
    visionStoryContext: 'Location: studio. People: 1. Actors: [{"reference":"artist","description":"foreground left"}].',
    topicWord: 'wort',
  };

  expect(validateReferenceImageActorScenePlan([baseScene], options)).toEqual([]);
  expect(validateReferenceImageActorScenePlan([{
    ...baseScene,
    actorAction: 'None',
    actorsInteraction: 'Three impossible versions of the artist exchange shadows.',
    stillPrompt: "A glowing word 'wort' appears above the artist.",
  }], options)).toEqual([]);
});

test('createSceneGenerator asks GPT-5 to repair only technical transport errors', async () => {
  const invalidScene = {
    title: 'Word appears',
    beat: "A glowing word 'wort' appears in the room.",
    stillPrompt: "The word 'wort' floats above the floor.",
    imageDescription: 'The same studio.',
    storyBeat: 'The topic enters.',
    eventType: 'actorOnly',
    actorAction: 'None',
    actorsInteraction: 'A hand touches the word.',
    locationAction: '',
    storyEvent: 'The glowing word becomes visible.',
    motionCue: 'None',
    cameraCue: 'Push toward the word.',
    frameSource: 'lastFrame',
    videoMode: 'firstLast',
    durationSeconds: 3,
    videoPrompt: 'The glowing word appears.',
    singleImagePrompt: 'The glowing word appears.',
    freshImage: false,
    useCameraShot: false,
  };
  const repairedScene = {
    ...invalidScene,
    frameSource: 'newImage',
    videoMode: 'singleImage',
    freshImage: true,
    useCameraShot: true,
  };
  const create = jest.fn()
    .mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({ scenes: [invalidScene] }) } }],
    })
    .mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({ scenes: [repairedScene] }) } }],
    });
  const generateScenes = createSceneGenerator({
    openai: { chat: { completions: { create } } },
    model: 'gpt-5-mini-2025-08-07',
  });

  const plan = await generateScenes({
    sceneCount: 1,
    sceneLengths: [3],
    sourceCues: ['body', 'pressure', 'shop floor'],
    visionStoryContext: 'Location: art studio. People: 1. Actors: [{"reference":"artist","description":"foreground left, side-facing"}].',
    storyTransport: 'Current topic word: wort. Previous final beat: the table blocks the exit.',
    configMode: 'camera',
  });

  expect(create).toHaveBeenCalledTimes(2);
  const repairRequest = create.mock.calls[1][0];
  expect(repairRequest.messages.at(-1).content).toContain('opening mode must be');
  expect(repairRequest.messages.at(-1).content).not.toContain('actorAction');
  expect(repairRequest.messages.at(-1).content).not.toContain('typography');
  expect(repairRequest.messages.at(-1).content).toContain('Do not insert stock or fallback actions.');
  expect(plan[0].actorAction).toBe('');
  expect(plan[0].actorsInteraction).toBe(invalidScene.actorsInteraction);
  expect(plan[0].stillPrompt).toBe(invalidScene.stillPrompt);
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
        actorAction: 'The gardener raises the seedling',
        actorsInteraction: '',
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
        actorAction: '',
        actorsInteraction: 'One student hands the sketch to another',
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
  expect(scenePlan[0].motionCue).toBe('slow pull back');
  expect(scenePlan[1].videoPrompt).toBe('Move from the classroom into a clear destination reveal.');
  expect(scenePlan[1].singleImagePrompt).toBe('Begin in the classroom and add restrained forward motion.');
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
                eventType: 'actorOnly',
                actorAction: 'The actor freezes and raises both shoulders.',
                actorsInteraction: '',
                locationAction: '',
                storyEvent: 'The actor freezes, interrupting the movement through the room.',
                motionCue: 'The actor freezes and raises both shoulders.',
                cameraCue: 'slow uneasy push-in',
                frameSource: 'newImage',
                videoMode: 'singleImage',
                durationSeconds: 4,
                videoPrompt: 'The subject stiffens as dread fills the room and the camera edges closer.',
                singleImagePrompt: 'The actor freezes and raises both shoulders. Fear becomes visible in the face.',
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
    sourceCues: ['Hostel (Film)', 'Body-Horror'],
    visualDirection: 'camera horror',
    visionStoryContext: 'Location: an industrial room. Actors: [{"reference":"the actor","description":"one frightened person"}]. Description: tight close-up with hard side light.',
    storyTransport: 'Current topic word: Kaufhaus. Current people: 2 visible people: person 1, position=foreground left, orientation=front-facing; person 2, position=background right, orientation=side-facing. Previous final beat: the alarm closes the old floor.',
    configMode: 'camera',
    forceImageToVideoOnly: true,
  });

  expect(create).toHaveBeenCalledTimes(1);
  const request = create.mock.calls[0][0];
  const userMessage = request.messages[1].content;

  expect(userMessage).toContain('Source cues (ordered semantic story anchors)');
  expect(userMessage).toContain('Story transport context: Current topic word: Kaufhaus.');
  expect(userMessage).toContain('Scene flavor: default');
  expect(userMessage).toContain('Keep Current topic word as the stable subject.');
  expect(userMessage).toContain('Use cues in order as a causal chain.');
  expect(userMessage).toContain('source material, not hard creative limits.');
  expect(userMessage).toContain('Actor fields may remain empty');
  expect(userMessage).toContain('typographic, or surreal');
  expect(userMessage).not.toContain('fill actorAction or actorsInteraction');
  expect(userMessage).not.toContain('must also appear literally');
  expect(userMessage).toContain('every later scene = lastFrame/singleImage/false/false. firstLast is disabled for this run.');
  expect(userMessage).toContain('Vision context: Location: an industrial room.');
  expect(userMessage.length).toBeLessThan(3500);
  expect(request.response_format.json_schema.schema.properties.scenes.items.required).toEqual(
    expect.arrayContaining([
      'eventType',
      'actorAction',
      'actorsInteraction',
      'locationAction',
      'storyEvent',
      'castSelection',
      'castUse',
    ])
  );
});

test('createSceneGenerator sends GPT-5 a structured scene plan without temperature or top_p', async () => {
  const create = jest.fn(async () => ({
    choices: [{
      message: {
        content: JSON.stringify({
          scenes: [{
            title: 'Room answers',
            beat: 'The shelf shifts and the artist steps back.',
            stillPrompt: 'The artist beside the existing shelf.',
            imageDescription: 'The same room and artist after a shelf movement.',
            storyBeat: 'The location forces the next action.',
            eventType: 'locationToActor',
            actorAction: 'The artist steps back and raises one arm.',
            actorsInteraction: '',
            locationAction: 'The existing shelf shifts toward the artist.',
            storyEvent: 'The shelf movement interrupts the artist and changes the route through the room.',
            motionCue: 'The artist steps back and raises one arm.',
            cameraCue: 'Track sideways with the artist.',
            frameSource: 'newImage',
            videoMode: 'singleImage',
            durationSeconds: 3,
            videoPrompt: 'The shelf shifts and the artist steps back as the camera tracks sideways.',
            singleImagePrompt: 'The artist steps back and raises one arm. The shelf shifts toward the artist.',
            freshImage: true,
            useCameraShot: true,
          }],
        }),
      },
    }],
  }));
  const generateScenes = createSceneGenerator({
    openai: { chat: { completions: { create } } },
    model: 'gpt-5-mini-2025-08-07',
    temperature: 0.65,
    top_p: 0.95,
  });

  const plan = await generateScenes({
    sceneCount: 1,
    sceneLengths: [3],
    configMode: 'camera',
    visionStoryContext: 'Location: studio. Actors: artist in foreground left.',
  });

  const request = create.mock.calls[0][0];
  expect(request.model).toBe('gpt-5-mini-2025-08-07');
  expect(request).not.toHaveProperty('temperature');
  expect(request).not.toHaveProperty('top_p');
  expect(plan[0]).toMatchObject({
    eventType: 'locationToActor',
    locationAction: 'The existing shelf shifts toward the artist.',
  });
  expect(plan[0].videoPrompt).toBe('The shelf shifts and the artist steps back as the camera tracks sideways.');
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
                eventType: 'locationToActor',
                actorAction: 'The actor recoils and braces against the floor.',
                actorsInteraction: '',
                locationAction: 'The existing walls bend inward around the actor.',
                storyEvent: 'The bending room forces the actor to retreat.',
                motionCue: 'The actor recoils and braces against the floor.',
                cameraCue: 'the camera drifts sideways as the room warps',
                frameSource: 'newImage',
                videoMode: 'singleImage',
                durationSeconds: 4,
                videoPrompt: 'Colored shadows swallow the room as the actor recoils and the camera drifts.',
                singleImagePrompt: 'The actor recoils and braces against the floor. The room bends and floods with color.',
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

  expect(userMessage).toContain('Scene flavor: ltxTrippy');
  expect(userMessage).toContain('LTX-trippy adds a strong surreal consequence to the actor action in at least half the scenes');
});

test('parseScenePlanLengthMismatch reads expected and received counts from errors', () => {
  expect(
    parseScenePlanLengthMismatch(new Error('Scene plan length mismatch: expected 6, received 5'))
  ).toEqual({
    expected: 6,
    received: 5,
  });
});

test('generateScenePlanWithFallback retries with the returned smaller scene count', async () => {
  const generateScenes = jest.fn(async ({ sceneCount, sceneLengths }) => {
    if (sceneCount === 6) {
      const error = new Error('Scene plan length mismatch: expected 6, received 5');
      error.scenePlan = Array.from({ length: 5 }, (_, index) => ({
        index: index + 1,
        title: `Scene ${index + 1}`,
      }));
      error.resolvedSceneLengths = sceneLengths.slice(0, 5);
      throw error;
    }

    return Array.from({ length: sceneCount }, (_, index) => ({
      index: index + 1,
      title: `Scene ${index + 1}`,
    }));
  });
  const onFallback = jest.fn();

  const result = await generateScenePlanWithFallback({
    generateScenes,
    sceneCount: 6,
    sceneLengths: [6.4, 1.6, 3.2, 1.6, 4.8, 1.6],
    configMode: 'camera',
    visualDirection: 'documentary',
    visionStoryContext: 'office',
    sourceCues: ['horror', 'fries'],
    onFallback,
  });

  expect(generateScenes).toHaveBeenCalledTimes(2);
  expect(generateScenes.mock.calls[0][0].sceneCount).toBe(6);
  expect(generateScenes.mock.calls[1][0].sceneCount).toBe(5);
  expect(result.effectiveSceneCount).toBe(5);
  expect(result.effectiveSceneLengths).toEqual([6.4, 1.6, 3.2, 1.6, 4.8]);
  expect(result.scenePlan).toHaveLength(5);
  expect(onFallback).toHaveBeenCalledWith(expect.objectContaining({
    requestedSceneCount: 6,
    receivedSceneCount: 5,
    nextSceneCount: 5,
  }));
});
