import { describe, expect, test } from '@jest/globals';
import { buildAudioDirectionRequest } from '../../eu-reski-news/news-scene/audio-director.mjs';
import { autoDirectorPromptVersion } from '../../eu-reski-news/news-scene/auto-director.mjs';
import {
  addAutoConceptsToAudioRequest,
  addAutoConceptsToStoryRequest,
  addAutoConceptsToTimingRequest,
  addAutoConceptsToVideoRequest,
  autoConceptInputHash,
  createAutoConceptSnapshot,
} from '../../eu-reski-news/news-scene/auto-concepts.mjs';
import { buildPlanRequest } from '../../eu-reski-news/news-scene/planner.mjs';
import { buildTimingRequest } from '../../eu-reski-news/news-scene/scene-timing.mjs';
import { buildVideoDirectionRequest } from '../../eu-reski-news/news-scene/video-director.mjs';

const decision = {
  promptVersion: autoDirectorPromptVersion,
  iteration: 1,
  sceneCount: 4,
  sceneCountReason: 'The article contains four distinct causal turns.',
  dramaturgicalConcept: 'Move from separation through a negotiated crossing to shared responsibility.',
  visualConcept: 'Use a broken bridge motif that gradually becomes a connected mural plane.',
  motionConcept: 'Begin with hesitant lateral movement, build into a measured crossing, then settle.',
  audioConcept: 'Use restrained wind, a recurring metallic pulse, and a quiet final release.',
  selectedFlags: {},
  effectiveFlags: {},
  constraints: { sceneCount: { minimum: 2, maximum: 6 }, noDialogueNarration: true },
  constraintsApplied: [],
};
const snapshot = createAutoConceptSnapshot(decision);
const plan = {
  storyPremise: 'A bridge joins separated routines.',
  protagonist: { name: 'Mira' },
  scenes: [1, 2, 3, 4].map((index) => ({
    index, title: `Scene ${index}`, storyBeat: `Beat ${index}`, protagonistAction: `Mira crosses section ${index}.`,
    durationSeconds: 5, stillPrompt: `A monochrome mural scene ${index}.`, videoPrompt: `Mira crosses section ${index} in a restrained continuous gesture, then settles into stillness.`,
  })),
};
const record = { plan, results: plan.scenes.map((scene) => ({ path: `media/${scene.index}.png`, sha256: `${scene.index}`.repeat(64) })) };

describe('Auto Director concept handoff', () => {
  test('keeps old and manual iterations outside the new concept adapter', async () => {
    expect(createAutoConceptSnapshot({ ...decision, promptVersion: 'eu-reski-auto-director-v1' })).toBeNull();
    const built = await buildPlanRequest({
      article: { id: 'a', title: 'Title', text: 'Article.' }, semantic: { entries: [] }, catalog: [],
      sceneCount: 4, images: [], model: 'gpt-4.1-mini',
    });
    expect(addAutoConceptsToStoryRequest(built, null)).toBe(built);
    expect(autoConceptInputHash('base-hash', null)).toBe('base-hash');
  });

  test('hands dramaturgy and visual direction to the exact saved story count', async () => {
    const built = await buildPlanRequest({
      article: { id: 'a', title: 'Title', text: 'Article.' }, semantic: { entries: [] }, catalog: [],
      sceneCount: decision.sceneCount, images: [], model: 'gpt-4.1-mini',
      styleReferenceProvided: false, figureReferenceProvided: false,
    });
    const adapted = addAutoConceptsToStoryRequest(built, snapshot);
    const data = JSON.parse(adapted.request.messages[1].content[1].text);
    const handoff = adapted.request.messages[1].content.at(-1).text;

    expect(data.sceneCount).toBe(decision.sceneCount);
    expect(adapted.request.response_format.json_schema.schema.properties.scenes.minItems).toBe(decision.sceneCount);
    expect(adapted.request.response_format.json_schema.schema.properties.scenes.maxItems).toBe(decision.sceneCount);
    expect(handoff).toContain(decision.dramaturgicalConcept);
    expect(handoff).toContain(decision.visualConcept);
    expect(adapted.log.messages[1].content.at(-1).text).toContain(snapshot.snapshotHash);
  });

  test('hands motion and sound concepts into their planning stages only', () => {
    const timing = addAutoConceptsToTimingRequest(buildTimingRequest({
      plan, sceneDurations: [5, 5, 5, 5],
      sceneDurationSettings: { minimum: 3, maximum: 8, provider: 'Taktmuster' },
      visualStyleOptions: { symbolic: true, roomDeepness: false, layering: 0 }, model: 'gpt-4.1-mini',
    }), snapshot);
    const video = addAutoConceptsToVideoRequest(buildVideoDirectionRequest({
      record, model: 'gpt-4.1-mini', videoMode: 'image_to_video', noDialogueNarration: true,
    }), snapshot);
    const audio = addAutoConceptsToAudioRequest(buildAudioDirectionRequest({
      record, model: 'gpt-4.1-mini', noDialogueNarration: true,
    }), snapshot);

    expect(timing.messages[1].content).toContain(decision.motionConcept);
    expect(video.messages[1].content).toContain(decision.motionConcept);
    expect(audio.messages[1].content).toContain(decision.audioConcept);
    expect(audio.messages[1].content).not.toContain(decision.visualConcept);
    expect(audio.messages[0].content).toContain('No spoken dialogue, narration, or voices.');
    expect(timing.messages[0].content).toContain('Preserve every saved duration');
    const changedSnapshot = createAutoConceptSnapshot({
      ...decision,
      motionConcept: 'Keep all motion static until the final frame.',
    });
    expect(changedSnapshot.snapshotHash).not.toBe(snapshot.snapshotHash);
    expect(autoConceptInputHash('base-hash', changedSnapshot)).not.toBe(autoConceptInputHash('base-hash', snapshot));
  });
});
