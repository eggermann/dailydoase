import { expect, jest, test } from '@jest/globals';

import { createRoomMemory } from './room-memory.js';
import {
  applySceneBoundaryTransport,
  createSceneBoundaryTransportDecider,
  resolveSceneBoundaryTransportPolicy,
} from './scene-boundary-transport.js';

test('room memory is separate FIFO with room assets and empty-room observations', () => {
  const memory = createRoomMemory({ maxSize: 2 });
  memory.remember({ imagePath: '/camera/one.jpg', location: 'shop floor', assets: [{ reference: 'counter' }], actors: [] });
  memory.remember({ imagePath: '/camera/two.jpg', location: 'shop floor', assets: [{ reference: 'painting' }], actors: [{ reference: 'visitor' }] });
  memory.remember({ imagePath: '/camera/three.jpg', location: 'shop floor', assets: [{ reference: 'window' }], actors: [] });

  expect(memory.values().map((entry) => entry.imagePath)).toEqual(['/camera/two.jpg', '/camera/three.jpg']);
  expect(memory.formatForPrompt()).toContain('assets=window');
  expect(memory.latest().actors).toEqual([]);
});

test.each([
  ['continue', 'lastFrame', 'singleImage', false, false],
  ['locationReturn', 'lastFrame', 'firstLast', false, true],
  ['cameraReset', 'newImage', 'singleImage', true, true],
])('applies %s boundary tuple', (command, frameSource, videoMode, freshImage, useCameraShot) => {
  const result = applySceneBoundaryTransport({ videoPrompt: 'Next action.' }, {
    command,
    storyBridge: 'Previous consequence remains visible.',
    transitionPrompt: 'Camera tracks toward the counter.',
    cameraImagePath: '/camera/fresh.jpg',
  });

  expect(result).toMatchObject({ frameSource, videoMode, freshImage, useCameraShot });
  expect(result.videoPrompt).toContain('Previous consequence remains visible.');
});

test('keeps planner single-image continuation when fresh camera only shows same people count', () => {
  expect(resolveSceneBoundaryTransportPolicy({
    nextScene: {
      videoMode: 'singleImage',
      frameSource: 'lastFrame',
      useCameraShot: false,
    },
    currentPeopleCount: 2,
    cameraPeopleCount: 2,
    cameraImageAvailable: true,
  })).toMatchObject({
    shouldAskModel: false,
    plannedCameraTransport: false,
    peopleChanged: false,
  });
});

test.each([
  [{ videoMode: 'firstLast', frameSource: 'lastFrame', useCameraShot: true }, 2, 2, 'next scene already requests camera transport'],
  [{ videoMode: 'singleImage', frameSource: 'lastFrame', useCameraShot: false }, 2, 3, 'fresh camera person count changed'],
])('allows boundary decision for planned camera transport or changed cast', (nextScene, currentPeopleCount, cameraPeopleCount, reason) => {
  expect(resolveSceneBoundaryTransportPolicy({
    nextScene,
    currentPeopleCount,
    cameraPeopleCount,
    cameraImageAvailable: true,
  })).toMatchObject({ shouldAskModel: true, reason });
});

test('GPT boundary decider sends room, camera, and story state and returns exact request log', async () => {
  const create = jest.fn().mockResolvedValue({
    id: 'boundary-1',
    usage: { total_tokens: 42 },
    choices: [{ message: { content: JSON.stringify({
      command: 'locationReturn',
      reason: 'Counter reconnects generated action to room.',
      storyBridge: 'Moving shadow reaches existing counter.',
      transitionPrompt: 'Shadow crosses floor and resolves at real counter.',
    }) } }],
  });
  const decide = createSceneBoundaryTransportDecider({
    openai: { chat: { completions: { create } } },
    model: 'gpt-5',
  });

  const result = await decide({
    completedScene: { storyBeat: 'Shadow leaves actor.' },
    nextScene: { storyBeat: 'Counter receives shadow.' },
    generatedLastFramePath: '/generated/last.png',
    cameraShot: { imagePath: '/camera/fresh.jpg', visionSummary: 'Assets: counter.' },
    roomMemory: 'ROOM MEMORY: counter.',
    storyTransport: 'Current topic word: Einkaufszentrum.',
  });

  expect(result.command).toBe('locationReturn');
  expect(result.request.messages[1].content).toContain('ROOM MEMORY: counter.');
  expect(result.response.id).toBe('boundary-1');
});
