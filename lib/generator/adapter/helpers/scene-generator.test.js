import { expect, jest, test } from '@jest/globals';

import {
  createSceneGenerator,
  generateScenePlanWithFallback,
  getScenePlanEntry,
  parseScenePlanLengthMismatch,
  parseScenePlan,
  resolveSceneCountFromConfig,
  resolveSceneLengthsInput,
} from './scene-generator.js';

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
    sourceCues: ['Hostel (Film)', 'Body-Horror'],
    visualDirection: 'camera horror',
    visionStoryContext: 'Location: an industrial room. Actors: [{"reference":"the actor","description":"one frightened person"}]. Description: tight close-up with hard side light.',
    configMode: 'camera',
  });

  expect(create).toHaveBeenCalledTimes(1);
  const request = create.mock.calls[0][0];
  const userMessage = request.messages[1].content;

  expect(userMessage).toContain('Source cues (ordered semantic story anchors)');
  expect(userMessage).toContain('Scene flavor: default');
  expect(userMessage).toContain('Wordstream rule: treat source cues as an ordered wordstream and map each next cue into a visible scene-state shift.');
  expect(userMessage).toContain('Story requirement: treat the source cues as the story spine.');
  expect(userMessage).toContain('Story progression rule: scenes must feel causally linked; each next scene should happen because of the previous one, not as a disconnected new label.');
  expect(userMessage).toContain('falling back to a generic host, explainer, or discussion format');
  expect(userMessage).toContain('Prefer embodied scene beats with visible stakes, gesture, posture, expression, framing pressure, or environmental tension');
  expect(userMessage).toContain('Action rule: every beat and storyBeat must contain a decisive visible change or action, not just a mood label or static description.');
  expect(userMessage).toContain('Motion rule: motionCue must describe what physically changes in the shot. Do not use framing descriptions or static close-up wording as a motionCue.');
  expect(userMessage).toContain('Camera rule: cameraCue must describe one readable camera behavior that intensifies the scene event rather than merely restating framing.');
  expect(userMessage).toContain('Interaction rule: each cue must visibly act on the subject, the room, or both together; make that relationship explicit instead of leaving the cue unattached to the shot.');
  expect(userMessage).toContain('Interaction variety rule: across the sequence, vary whether the cue mainly changes the body, the room emphasis, or both at once.');
  expect(userMessage).toContain('Curious spectacle rule: use the screenshot and the cue words to stage something visibly strange, charged, or inquisitive inside the same shot');
  expect(userMessage).toContain('Adjacent scenes must not repeat the same dominant beat skeleton, motion pattern, or camera pattern unless the cue progression itself repeats.');
  expect(userMessage).toContain('Wordstream visual mapping: express cue changes through location emphasis');
  expect(userMessage).toContain('Cue consequence rule: each cue must change beat and storyBeat');
  expect(userMessage).toContain('If cue text is fragmentary, infer a concrete visible consequence in the shot instead of falling back to generic placeholders');
  expect(userMessage).toContain('Trippy flavor rule: n/a');
  expect(userMessage).toContain('Trippy action rule: n/a');
  expect(userMessage).toContain('Vision story context from the source shot: Location: an industrial room. Actors: [{"reference":"the actor","description":"one frightened person"}]. Description: tight close-up with hard side light.');
  expect(userMessage).toContain('use it as continuity for each scene, especially location, actors, and visible-shot description');
  expect(userMessage).toContain('Camera-mode reminder: keep the story inside the real visible shot');
  expect(userMessage).toContain('Camera-mode visible-anchor rule: use the vision story context as the source of truth for location, actor identity, and visible scene setup.');
  expect(userMessage).toContain('Build stillPrompt, imageDescription, motionCue, cameraCue, videoPrompt, and singleImagePrompt from that visible basis instead of inventing unsupported elements.');
  expect(userMessage).toContain('Camera-mode firstLast rule: use firstLast only for small believable changes between start and destination inside the same visible room');
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

  expect(userMessage).toContain('Scene flavor: ltxTrippy');
  expect(userMessage).toContain('Trippy flavor rule: allow the cue words to create surreal visible events, hallucinated objects, warped room geometry, transformed light, symbolic props, and uncanny action inside the shot.');
  expect(userMessage).toContain('At least half of the scenes should contain a strong visible transformation or event.');
  expect(userMessage).toContain('Trippy action rule: for ltxTrippy, beats should read like scene events: something appears, spreads, bends, bursts, swallows, floods, circles, melts, multiplies, or overtakes the room or subject.');
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
