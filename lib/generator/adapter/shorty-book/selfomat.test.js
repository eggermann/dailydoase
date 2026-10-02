import { describe, expect, test } from '@jest/globals';

import { attachCastReferencesToScenePlan, createStoryTransportController } from './story-transport.js';
import { adaptSelfomatScenePlan } from './selfomat.js';

const plan = (actorsInteraction = '') => [{
  title: 'A brief encounter',
  actorsInteraction,
  stillPrompt: 'An old department store scene.',
  videoPrompt: 'Surveillance view of the room.',
  videoMode: 'singleImage',
  cameraCue: 'The camera pans toward the raised hand.',
}];

describe('Selfomat first approach', () => {
  test('keeps the new visitor primary and recalls exactly one earlier visitor', () => {
    const story = createStoryTransportController();
    const firstDraft = story.beginIteration({
      iteration: 1,
      referenceImagePath: '/camera/alex.jpg',
      visionStoryContext: {
        actors: [{ reference: 'Alex', description: 'blue jacket' }],
      },
    });
    story.completeIteration({ draft: firstDraft, scenePlan: [] });

    const secondDraft = story.beginIteration({
      iteration: 2,
      referenceImagePath: '/camera/sam.jpg',
      sourceCues: ['the old birthday song returns'],
      visionStoryContext: {
        actors: [{ reference: 'Sam', description: 'red shirt' }],
      },
    });
    const adaptedPlan = adaptSelfomatScenePlan({
      scenePlan: plan(),
      transport: secondDraft,
    });
    const [scene] = attachCastReferencesToScenePlan({
      scenePlan: adaptedPlan,
      cast: secondDraft.cast,
    });

    expect(scene.selfomat).toBe(true);
    expect(scene.castSelection).toEqual([firstDraft.people.actors[0].personaId]);
    expect(scene.castReferences).toEqual([
      expect.objectContaining({ referenceImage: '/camera/alex.jpg' }),
    ]);
    expect(scene.castUse).toContain(secondDraft.people.actors[0].personaId);
    expect(scene.videoPrompt).toContain('red shirt');
    expect(scene.videoPrompt).toContain('blue jacket');
    expect(scene.videoPrompt).not.toContain('the old birthday song returns');
    expect(scene.videoPrompt).toContain('brief, visible shared gesture');
    expect(scene.videoPrompt).toContain('motion blur');
    expect(scene.cameraCue).toBe('The camera pans toward the raised hand.');
    expect(scene.videoPrompt).toContain('Reactive phone behavior: The camera pans toward the raised hand.');
    expect(scene.captureSource).toBe('pocketPhone');
    expect(scene.videoPrompt).toContain('Accidental consumer-phone capture');
    expect(scene.videoPrompt).not.toContain('Surveillance');
    expect(scene.imageDescription).not.toContain('Camera movement:');
    expect(scene.stillPrompt).not.toBe(scene.videoPrompt);
    expect(scene.singleImagePrompt).toBe(scene.stillPrompt);
    expect(scene.videoMode).toBe('singleImage');
  });

  test('uses the newest earlier person first, then lets the oldest person close the chain', () => {
    const story = createStoryTransportController();
    for (const [iteration, name] of [[1, 'Alex'], [2, 'Billie']]) {
      const draft = story.beginIteration({
        iteration,
        referenceImagePath: `/camera/${name}.jpg`,
        visionStoryContext: { actors: [{ reference: name }] },
      });
      story.completeIteration({ draft, scenePlan: [] });
    }
    const currentDraft = story.beginIteration({
      iteration: 3,
      referenceImagePath: '/camera/Casey.jpg',
      sourceCues: ['shared victory', 'reunion'],
      visionStoryContext: { actors: [{ reference: 'Casey' }] },
    });

    const scenes = adaptSelfomatScenePlan({
      scenePlan: [plan()[0], plan('They clink glasses in the doorway.')[0]],
      transport: currentDraft,
    });

    expect(scenes.map((scene) => scene.castSelection)).toEqual([
      ['cast-002'],
      ['cast-001'],
    ]);
    expect(scenes[0].videoPrompt).not.toContain('shared victory');
    expect(scenes[0].videoPrompt).toContain('brief, visible shared gesture');
    expect(scenes[1].videoPrompt).not.toContain('reunion');
    expect(scenes[1].actorsInteraction).toBe('They clink glasses in the doorway.');
  });

  test('keeps GPT concrete story beat and actor action instead of replacing them with cue template', () => {
    const [scene] = adaptSelfomatScenePlan({
      scenePlan: [{
        storyBeat: 'The hand offers a small paper animal.',
        actorAction: 'The current visitor accepts it with both hands.',
      }],
      transport: {
        topic: 'love',
        semanticCues: ['animal'],
        people: {
          actors: [{ personaId: 'current', referenceImage: '/current.jpg', description: 'blue shirt' }],
        },
        cast: { actorReferences: [] },
      },
    });

    expect(scene.storyBeat).toBe('The hand offers a small paper animal.');
    expect(scene.actorsInteraction).toBe('The current visitor accepts it with both hands.');
    expect(scene.semanticCue).toBe('animal');
  });

  test('keeps raw semantic fragments out of renderer prompt fallback', () => {
    const rawFragment = 'Philia Philautia Storge Agape PMID identifier';
    const [scene] = adaptSelfomatScenePlan({
      scenePlan: [{}],
      transport: {
        topic: 'love',
        semanticCues: [rawFragment],
        people: {
          actors: [{ personaId: 'current', referenceImage: '/current.jpg', description: 'blue shirt' }],
        },
        cast: { actorReferences: [] },
      },
    });

    expect(scene.semanticCue).toBe(rawFragment);
    expect(scene.singleImagePrompt).not.toContain(rawFragment);
    expect(scene.singleImagePrompt).toContain('brief, visible physical gesture');
  });

  test('keeps destination still and WAN movement prompts separate per scene', () => {
    const [scene] = adaptSelfomatScenePlan({
      scenePlan: [{
        actorAction: 'The visitor opens both hands around a folded paper animal.',
        motionCue: 'The hands slowly open and the paper animal turns toward the camera.',
        cameraCue: 'The phone tilts down with the hands.',
      }],
      transport: {
        topic: 'love',
        people: {
          actors: [{ personaId: 'current', referenceImage: '/current.jpg', description: 'blue shirt' }],
        },
        cast: { actorReferences: [] },
      },
    });

    expect(scene.imageDescription).toContain('opens both hands');
    expect(scene.imageDescription).not.toContain('Camera movement:');
    expect(scene.stillPrompt).toContain('Accidental consumer-phone capture');
    expect(scene.stillPrompt).toContain('No centered hero object');
    expect(scene.videoPrompt).toContain('Continue from the next frame.');
    expect(scene.videoPrompt).toContain('hands slowly open');
    expect(scene.videoPrompt).toContain('Reactive phone behavior: The phone tilts down');
    expect(scene.videoPrompt).not.toBe(scene.stillPrompt);
  });

  test('uses a fixed cheap CCTV source without mixing it with phone behavior', () => {
    const [scene] = adaptSelfomatScenePlan({
      scenePlan: [{
        captureSource: 'cheapCCTV',
        cameraCue: 'A slow handheld push-in follows the spill.',
        actorAction: 'The visitor wipes blue water from the floor.',
      }],
      transport: {
        topic: 'love',
        people: {
          actors: [{ personaId: 'current', referenceImage: '/current.jpg', description: 'blue sweater' }],
        },
        cast: { actorReferences: [] },
      },
    });

    expect(scene.captureSource).toBe('cheapCCTV');
    expect(scene.stillPrompt).toContain('Cheap 4:3 security-camera capture');
    expect(scene.videoPrompt).toContain('Fixed high-corner 4:3 security-camera view');
    expect(scene.videoPrompt).toContain('Camera stays fixed');
    expect(scene.videoPrompt).not.toContain('phone is lifted too late');
    expect(scene.videoPrompt).not.toContain('slow handheld push-in');
  });

  test('uses a first-person drone source without mixing it with phone or CCTV behavior', () => {
    const [scene] = adaptSelfomatScenePlan({
      scenePlan: [{
        captureSource: 'firstPersonDrone',
        cameraCue: 'A slow handheld push-in follows the spill.',
        actorAction: 'The visitor turns toward the fallen cards.',
      }],
      transport: {
        topic: 'love',
        people: {
          actors: [{ personaId: 'current', referenceImage: '/current.jpg', description: 'blue sweater' }],
        },
        cast: { actorReferences: [] },
      },
    });

    expect(scene.captureSource).toBe('firstPersonDrone');
    expect(scene.stillPrompt).toContain('Cheap first-person FPV drone capture');
    expect(scene.videoPrompt).toContain('small first-person drone catches the event');
    expect(scene.videoPrompt).toContain('no phone framing and no fixed CCTV view');
    expect(scene.videoPrompt).not.toContain('phone is lifted too late');
    expect(scene.videoPrompt).not.toContain('Fixed high-corner 4:3');
  });

  test('replaces choreographed pocket-phone language with late reactive framing', () => {
    const [scene] = adaptSelfomatScenePlan({
      scenePlan: [{
        captureSource: 'pocketPhone',
        cameraCue: 'A slow handheld push-in follows the spill.',
        actorAction: 'The visitor catches the falling cup.',
      }],
      transport: {
        topic: 'love',
        people: {
          actors: [{ personaId: 'current', referenceImage: '/current.jpg', description: 'blue sweater' }],
        },
        cast: { actorReferences: [] },
      },
    });

    expect(scene.captureSource).toBe('pocketPhone');
    expect(scene.videoPrompt).toContain('The phone is lifted too late');
    expect(scene.videoPrompt).toContain('subject partly cut off');
    expect(scene.videoPrompt).not.toContain('slow handheld push-in');
  });

  test('separates visible scene fragments into readable sentences', () => {
    const [scene] = adaptSelfomatScenePlan({
      scenePlan: [{
        creativeDecision: {
          visualEvent: 'The slide becomes the visual focus',
          transformation: 'Scattered cards cohere into a cluster',
        },
        actorAction: 'She pins a new card to the board',
      }],
      transport: {
        topic: 'love',
        people: {
          actors: [{ personaId: 'current', referenceImage: '/current.jpg', description: 'white sweater' }],
        },
        cast: { actorReferences: [] },
      },
    });

    expect(scene.imageDescription).toContain('The slide becomes the visual focus.');
    expect(scene.imageDescription).toContain('Scattered cards cohere into a cluster.');
    expect(scene.imageDescription).toContain('She pins a new card to the board.');
  });

  test('uses active FIFO order for one or two returning people and never recalls the archive', () => {
    const current = {
      iteration: 5,
      topic: 'celebration',
      semanticCues: ['blue coat', 'golden clock', 'music confetti and blue coat'],
      people: {
        actors: [{ personaId: 'current', reference: 'current visitor', referenceImage: '/current.jpg' }],
      },
      cast: {
        actorReferences: [
          {
            personaId: 'middle', reference: 'musician', referenceImage: '/middle.jpg',
            description: 'music confetti', firstSeenIteration: 2, lastSeenIteration: 2,
          },
          {
            personaId: 'recent', reference: 'blue visitor', referenceImage: '/recent.jpg',
            description: 'blue coat', firstSeenIteration: 4, lastSeenIteration: 4,
          },
        ],
        archivedActorReferences: [{
          personaId: 'old', reference: 'clock visitor', referenceImage: '/old.jpg',
          description: 'golden clock', firstSeenIteration: 1, lastSeenIteration: 1,
        }],
      },
    };
    const scenes = adaptSelfomatScenePlan({
      scenePlan: [{}, {}, {}],
      transport: current,
    });

    expect(scenes.map((scene) => scene.castSelection)).toEqual([
      ['recent'],
      ['middle'],
      ['middle', 'recent'],
    ]);
    expect(scenes[1].peopleChain[0]).toMatchObject({
      personaId: 'middle', fifoPosition: 1, selectionReason: 'older-fifo-visitor',
    });
    expect(scenes[2].peopleChain).toHaveLength(2);
    expect(scenes.flatMap((scene) => scene.castSelection)).not.toContain('old');
    expect(scenes[0].actorsInteraction).toContain('blue coat');
    expect(scenes[0].actorsInteraction).toContain('visible shared gesture');

    const differentSemanticCues = adaptSelfomatScenePlan({
      scenePlan: [{}, {}, {}],
      transport: { ...current, semanticCues: ['dance', 'toast', 'hug'] },
    });
    expect(differentSemanticCues.map((scene) => scene.castSelection)).toEqual(
      scenes.map((scene) => scene.castSelection)
    );
    expect(differentSemanticCues[0].actorsInteraction).not.toContain('dance');
    expect(differentSemanticCues[0].actorsInteraction).toContain('brief, visible shared gesture');
  });

  test('lets film two recall film one when both iterations use the same selfie file', () => {
    const story = createStoryTransportController();
    const firstDraft = story.beginIteration({
      iteration: 1,
      referenceImagePath: '/camera/repeated-selfie.jpg',
      visionStoryContext: { actors: [{ reference: 'visitor', description: 'black shirt' }] },
    });
    story.completeIteration({ draft: firstDraft, scenePlan: [] });

    const secondDraft = story.beginIteration({
      iteration: 2,
      referenceImagePath: '/camera/repeated-selfie.jpg',
      visionStoryContext: { actors: [{ reference: 'visitor', description: 'black shirt' }] },
    });
    const [scene] = adaptSelfomatScenePlan({ scenePlan: plan('They smile at each other.'), transport: secondDraft });

    expect(scene.castSelection).toEqual([firstDraft.people.actors[0].personaId]);
    expect(scene.castReferences).toBeUndefined();
  });

  test('films the current visitor alone when no earlier person exists', () => {
    const story = createStoryTransportController();
    const currentDraft = story.beginIteration({
      iteration: 1,
      referenceImagePath: '/camera/current.jpg',
      sourceCues: ['first celebration'],
      visionStoryContext: { actors: [{ reference: 'current visitor' }] },
    });
    const [scene] = adaptSelfomatScenePlan({
      scenePlan: plan(),
      transport: currentDraft,
    });

    expect(scene.castSelection).toEqual([]);
    expect(scene.eventType).toBe('actorOnly');
    expect(scene.videoPrompt).not.toContain('first celebration');
    expect(scene.videoPrompt).toContain('brief, visible physical gesture');
    expect(scene.videoPrompt).toContain('main person');
  });

  test('leaves plan alone only when no visitor is visible, and picks a lead from a group', () => {
    const originalPlan = plan();
    const noVisitor = { people: { actors: [] } };
    const twoVisitors = {
      people: {
        actors: [
          { personaId: 'a', description: 'lead a', referenceImage: '/camera/a.jpg' },
          { personaId: 'b', description: 'secondary b', referenceImage: '/camera/b.jpg' },
        ],
      },
    };

    expect(adaptSelfomatScenePlan({ scenePlan: originalPlan, transport: noVisitor })).toBe(originalPlan);
    expect(adaptSelfomatScenePlan({ scenePlan: originalPlan, transport: twoVisitors })[0]).toMatchObject({
      selfomat: true,
      castSelection: [],
    });
    expect(adaptSelfomatScenePlan({ scenePlan: originalPlan, transport: twoVisitors })[0].videoPrompt)
      .toContain('lead a');
    expect(originalPlan[0]).not.toHaveProperty('selfomat');
  });
});
