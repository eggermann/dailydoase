import { describe, expect, jest, test } from '@jest/globals';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';

import { createSceneGenerator } from '../helpers/scene-generator.js';
import {
  attachCastReferencesToScenePlan,
  createActorReferenceFifo,
  createStoryTransportController,
  extractTopicWords,
  formatStoryTransportForPrompt,
  saveStoryTransportArtifact,
} from './story-transport.js';

describe('story transport', () => {
  test('keeps at most ten actor image references in FIFO order', () => {
    const cache = createActorReferenceFifo({ maxSize: 10 });
    cache.touchMany(Array.from({ length: 11 }, (_, index) => ({
      personaId: `persona-${index + 1}`,
      referenceImage: `/cast/persona-${index + 1}.jpg`,
    })));

    expect(cache.values()).toHaveLength(10);
    expect(cache.values()[0].personaId).toBe('persona-2');
    expect(cache.values().at(-1).personaId).toBe('persona-11');

    cache.touch({
      personaId: 'persona-2',
      referenceImage: '/cast/persona-2-new.jpg',
    });
    expect(cache.values()[0]).toEqual(expect.objectContaining({
      personaId: 'persona-2',
      referenceImage: '/cast/persona-2-new.jpg',
    }));
  });

  test('keeps old persona references when the person is offscreen next iteration', () => {
    const controller = createStoryTransportController({ actorReferenceLimit: 10 });
    controller.beginIteration({
      iteration: 1,
      visionStoryContext: {
        actors: [{
          personaId: 'persona-1',
          referenceImage: '/cast/persona-1.jpg',
          position: 'foreground left',
        }],
      },
    });

    const secondDraft = controller.beginIteration({
      iteration: 2,
      visionStoryContext: { actors: [] },
    });

    expect(secondDraft.people.count).toBe(0);
    expect(secondDraft.cast.actorReferences).toEqual([
      expect.objectContaining({
        personaId: 'persona-1',
        referenceImage: '/cast/persona-1.jpg',
      }),
    ]);
  });

  test('turns one camera frame into optional cast cards and transports GPT cast choices', () => {
    const controller = createStoryTransportController({ actorReferenceLimit: 10 });
    const draft = controller.beginIteration({
      iteration: 1,
      referenceImagePath: '/camera/iteration-1.jpg',
      visionStoryContext: {
        actors: [
          {
            reference: 'visitor left',
            description: 'dark coat, foreground left',
            position: 'foreground left',
          },
          {
            reference: 'visitor right',
            description: 'red bag, background right',
            position: 'background right',
          },
        ],
      },
    });

    expect(draft.people.actors).toEqual([
      expect.objectContaining({ personaId: 'cast-001', referenceImage: '/camera/iteration-1.jpg' }),
      expect.objectContaining({ personaId: 'cast-002', referenceImage: '/camera/iteration-1.jpg' }),
    ]);
    expect(draft.cast.actorReferences).toHaveLength(2);
    expect(formatStoryTransportForPrompt(draft)).toContain('CAST MEMORY — optional FIFO library');
    expect(formatStoryTransportForPrompt(draft)).toContain('cast-001');

    const completed = controller.completeIteration({
      draft,
      scenePlan: [{
        castSelection: ['cast-002'],
        castUse: 'returns as a red echo behind the display',
        storyBeat: 'The display repeats the visitor in red.',
      }],
    });

    expect(completed.cast.actorReferences).toEqual(expect.arrayContaining([
      expect.objectContaining({
        personaId: 'cast-002',
        lastSelectedIteration: 1,
        lastStoryState: 'returns as a red echo behind the display',
        status: 'story-active',
      }),
    ]));

    expect(attachCastReferencesToScenePlan({
      scenePlan: [{ castSelection: ['cast-002'] }],
      cast: completed.cast,
    })[0].castReferences).toEqual([
      expect.objectContaining({
        personaId: 'cast-002',
        referenceImage: '/camera/iteration-1.jpg',
      }),
    ]);
  });

  test('uses configured words as topics instead of semantic responses', () => {
    expect(extractTopicWords([
      ['Kaufhaus', 'de'],
      { startWord: '1989' },
    ])).toEqual(['Kaufhaus', '1989']);
  });

  test('transports story and detected people positions across two iterations', () => {
    const controller = createStoryTransportController();
    const firstDraft = controller.beginIteration({
      iteration: 1,
      words: [['Kaufhaus', 'de']],
      sourceCues: ['Department store', 'Closing time'],
      visionStoryContext: {
        location: 'old department-store floor',
        actors: [
          {
            reference: 'person 1',
            description: 'visitor in a dark coat',
            position: 'foreground left',
            orientation: 'front-facing',
          },
          {
            reference: 'person 2',
            description: 'visitor near the back wall',
            position: 'background right',
            orientation: 'side-facing',
          },
        ],
      },
    });
    const firstTransport = controller.completeIteration({
      draft: firstDraft,
      scenePlan: [
        { storyBeat: 'The visitors enter the abandoned sales floor.' },
        { storyBeat: 'The closing signal traps them between old displays.' },
      ],
    });

    expect(firstTransport.topic).toBe('Kaufhaus');
    expect(firstTransport.semanticCues).toEqual(['Department store', 'Closing time']);
    expect(firstTransport.people).toEqual({
      count: 2,
      actors: [
        expect.objectContaining({
          reference: 'person 1',
          position: 'foreground left',
          orientation: 'front-facing',
        }),
        expect.objectContaining({
          reference: 'person 2',
          position: 'background right',
          orientation: 'side-facing',
        }),
      ],
    });

    const secondDraft = controller.beginIteration({
      iteration: 2,
      words: [['1989', 'de']],
      sourceCues: ['German television ident'],
      visionStoryContext: {
        location: 'old department-store floor',
        actors: [
          {
            reference: 'person 1',
            description: 'visitor now near the display',
            position: 'middle center',
            orientation: 'side-facing',
          },
        ],
      },
    });

    expect(secondDraft.topic).toBe('1989');
    expect(secondDraft.people.count).toBe(1);
    expect(secondDraft.previous).toEqual(expect.objectContaining({
      iteration: 1,
      topic: 'Kaufhaus',
      finalBeat: 'The closing signal traps them between old displays.',
    }));
    expect(secondDraft.previous).not.toHaveProperty('previous');

    const promptContext = formatStoryTransportForPrompt(secondDraft);
    expect(promptContext).toContain('Current topic word: 1989.');
    expect(promptContext).toContain('Current people: 1 visible people: cast-003, person 1, visitor now near the display, position=middle center, orientation=side-facing.');
    expect(promptContext).toContain('Previous iteration topic: Kaufhaus.');
    expect(promptContext).toContain('Previous final beat: The closing signal traps them between old displays.');
    expect(promptContext).toContain('Opening obligation: Continue from this consequence: The closing signal traps them between old displays.');
  });

  test('saves one inspectable artifact per iteration', async () => {
    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'story-transport-'));

    try {
      const targetPath = await saveStoryTransportArtifact({
        outputDir,
        transport: {
          schemaVersion: 1,
          iteration: 2,
          topic: 'Kaufhaus',
        },
      });

      expect(targetPath).toBe(path.join(
        outputDir,
        'story-transport',
        'iteration-0002.json'
      ));
      await expect(fs.readJson(targetPath)).resolves.toEqual({
        schemaVersion: 1,
        iteration: 2,
        topic: 'Kaufhaus',
      });
    } finally {
      await fs.remove(outputDir);
    }
  });

  test('feeds iteration one ending into the second scene-planner request', async () => {
    const create = jest.fn(async () => {
      const iteration = create.mock.calls.length;
      const storyBeat = iteration === 1
        ? 'The visitor follows the Kaufhaus signal toward the dark display.'
        : 'The 1989 television glow answers the previous signal.';

      return {
        choices: [{
          message: {
            content: JSON.stringify({
              scenes: [{
                title: `Iteration ${iteration}`,
                beat: storyBeat,
                storyBeat,
                stillPrompt: 'visitor in the visible department-store floor',
                imageDescription: 'one visitor remains visible in the old sales floor',
                motionCue: 'the visitor turns toward the display',
                cameraCue: 'the camera moves closer',
                frameSource: 'newImage',
                videoMode: 'singleImage',
                durationSeconds: 3,
                videoPrompt: 'The visitor turns as the camera moves closer.',
                singleImagePrompt: 'The visitor turns toward the display.',
                freshImage: true,
                useCameraShot: true,
              }],
            }),
          },
        }],
      };
    });
    const generateScenes = createSceneGenerator({
      openai: {
        chat: {
          completions: { create },
        },
      },
      model: 'mock-story-planner',
    });
    const controller = createStoryTransportController();

    const firstDraft = controller.beginIteration({
      iteration: 1,
      words: [['Kaufhaus', 'de']],
      sourceCues: ['semantic result that must not replace topic'],
      visionStoryContext: {
        actors: [{
          reference: 'person 1',
          position: 'foreground left',
          orientation: 'front-facing',
        }],
      },
    });
    const firstPlan = await generateScenes({
      sceneCount: 1,
      sceneLengths: [3],
      sourceCues: firstDraft.semanticCues,
      storyTransport: formatStoryTransportForPrompt(firstDraft),
      configMode: 'camera',
    });
    controller.completeIteration({ draft: firstDraft, scenePlan: firstPlan });

    const secondDraft = controller.beginIteration({
      iteration: 2,
      words: [['1989', 'de']],
      sourceCues: ['German television trailer'],
      visionStoryContext: {
        actors: [{
          reference: 'person 1',
          position: 'background right',
          orientation: 'side-facing',
        }],
      },
    });
    await generateScenes({
      sceneCount: 1,
      sceneLengths: [3],
      sourceCues: secondDraft.semanticCues,
      storyTransport: formatStoryTransportForPrompt(secondDraft),
      configMode: 'camera',
    });

    expect(create).toHaveBeenCalledTimes(2);
    const secondPlannerPrompt = create.mock.calls[1][0].messages[1].content;
    expect(secondPlannerPrompt).toContain('Current topic word: 1989.');
    expect(secondPlannerPrompt).toContain('position=background right');
    expect(secondPlannerPrompt).toContain('orientation=side-facing');
    expect(secondPlannerPrompt).toContain('Previous iteration topic: Kaufhaus.');
    expect(secondPlannerPrompt).toContain('Previous final beat: The visitor follows the Kaufhaus signal toward the dark display.');
    expect(secondPlannerPrompt).toContain('Opening obligation: Continue from this consequence: The visitor follows the Kaufhaus signal toward the dark display.');
  });
});
