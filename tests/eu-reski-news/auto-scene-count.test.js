import { describe, expect, test } from '@jest/globals';
import {
  createAutoSceneCountSelection,
  createSceneCountStream,
  isNewAutoSingleScene,
  replaySavedSceneCount,
  resolveAutoSceneCountLimits,
  resolveSceneCountSettings,
} from '../../eu-reski-news/news-scene/scene-count.mjs';
import { autoDirectorPromptVersion, validateAutoDirectorResponse } from '../../eu-reski-news/news-scene/auto-director.mjs';
import { buildVideoDirectionRequest } from '../../eu-reski-news/news-scene/video-director.mjs';

class MockTaktmuster {
  static lastInstance;
  constructor() {
    this.calls = 0;
    MockTaktmuster.lastInstance = this;
  }
  calls = 0;
  setTakt() {}
  setType() {}
  getNext() {
    this.calls += 1;
    return { patternValue: this.calls + 3 };
  }
}

const response = (sceneCount, sceneCountReason) => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({
  dramaturgicalConcept: 'A causal arc.', visualConcept: 'An evolving mural.', motionConcept: 'A restrained crossing.', audioConcept: 'Wind and silence.',
  sceneCount, sceneCountReason,
  flags: {
    storyClou: 'off', legacyGuernicaStyleReferencePrompt: false, preserveCubistVideoStyle: false,
    sceneVisualControls: 'fixed', articleImageReference: false, landscapePrompt: false,
    videoDirection: 'off', videoVision: 'off', videoAudioDirection: 'off', videoMaxZoom: 0,
  },
  reason: 'The choices fit the supplied article.',
}) } }] });

describe('Auto Director scene count selection', () => {
  test('mocked articles can select different counts, both bounded by configuration', () => {
    const limits = resolveAutoSceneCountLimits({ minimum: 2, maximum: 6 });
    const simpleArticle = validateAutoDirectorResponse(response(2, 'The short report supports a compact two-beat arc.'), { sceneCount: limits });
    const complexArticle = validateAutoDirectorResponse(response(5, 'The report contains several distinct turns that need five beats.'), { sceneCount: limits });

    expect(simpleArticle.sceneCount).toBe(2);
    expect(complexArticle.sceneCount).toBe(5);
    expect(() => validateAutoDirectorResponse(response(7, 'Too many.'), { sceneCount: limits }))
      .toThrow(/sceneCount must be an integer/);
  });

  test('manual fixed and Taktmuster modes keep their existing count selection', () => {
    const fixed = createSceneCountStream(resolveSceneCountSettings({ 'scene-count-mode': 'fixed', scenes: 4 }));
    expect(fixed.next().count).toBe(4);
    expect(fixed.next().count).toBe(4);

    const stream = createSceneCountStream(resolveSceneCountSettings({
      'scene-count-mode': 'taktmuster', 'scene-count-takt': 2, 'scene-count-numerator': 3,
      'scene-count-denominator': 4, 'scene-count-type': 'balanced', 'scene-count-bias': 2,
      'min-scenes': 1, 'max-scenes': 12,
    }), MockTaktmuster);
    expect(stream.next().count).toBe(6);
    expect(stream.next().count).toBe(7);
    expect(MockTaktmuster.lastInstance.calls).toBe(2);
  });

  test('new Auto selections are saved with limits and do not consume a Taktmuster step on replay', () => {
    const bounds = { minimum: 2, maximum: 6 };
    const selection = createAutoSceneCountSelection({
      promptVersion: autoDirectorPromptVersion, sceneCount: 4,
      sceneCountReason: 'Four causal changes form the clearest arc.',
    }, 0, bounds);
    const stream = createSceneCountStream(resolveSceneCountSettings({
      'scene-count-mode': 'taktmuster', 'scene-count-takt': 2, 'scene-count-numerator': 3,
      'scene-count-denominator': 4, 'scene-count-type': 'balanced', 'scene-count-bias': 2,
      'min-scenes': 1, 'max-scenes': 12,
    }), MockTaktmuster);
    const saved = { sceneCount: 4, autoDecision: { promptVersion: autoDirectorPromptVersion, sceneCount: 4 } };
    const replayed = replaySavedSceneCount(saved, stream);

    expect(selection).toMatchObject({ count: 4, reason: 'Four causal changes form the clearest arc.', settings: bounds });
    expect(replayed.count).toBe(4);
    expect(replayed.replayed).toBe(false);
    expect(MockTaktmuster.lastInstance.calls).toBe(0);
  });

  test('historical Auto V1 replay still consumes its saved rhythm step and retains its count', () => {
    const stream = createSceneCountStream(resolveSceneCountSettings({
      'scene-count-mode': 'taktmuster', 'scene-count-takt': 2, 'scene-count-numerator': 3,
      'scene-count-denominator': 4, 'scene-count-type': 'balanced', 'scene-count-bias': 2,
      'min-scenes': 1, 'max-scenes': 12,
    }), MockTaktmuster);
    const selection = replaySavedSceneCount({ sceneCount: 6, autoDecision: { promptVersion: 'eu-reski-auto-director-v1' } }, stream);

    expect(selection.count).toBe(6);
    expect(selection.replayed).toBe(true);
    expect(MockTaktmuster.lastInstance.calls).toBe(1);
  });

  test('interrupted fixed-count iterations retain their existing count validation', () => {
    const stream = createSceneCountStream(resolveSceneCountSettings({ 'scene-count-mode': 'fixed', scenes: 4 }));
    expect(() => replaySavedSceneCount({ sceneCount: 5 }, stream, { validateFixed: true }))
      .toThrow(/Saved scene-count rhythm differs/);
  });

  test('one-scene video direction requests require no adjacent transitions', () => {
    const record = {
      plan: { storyPremise: 'A single held image.', protagonist: { name: 'Mira' }, scenes: [{
        index: 1, title: 'Stillness', storyBeat: 'A single reveal.', protagonistAction: 'Mira holds a lantern.',
        durationSeconds: 5, videoPrompt: 'Mira holds the lantern steady and its small painted flame settles into stillness.',
      }] },
      results: [{ path: 'scene-1.png', sha256: 'a'.repeat(64) }],
    };
    const request = buildVideoDirectionRequest({ record, model: 'gpt-4.1-mini', videoMode: 'image_to_video' });
    const transitions = request.response_format.json_schema.schema.properties.sceneTransitions;

    expect(transitions.minItems).toBe(0);
    expect(transitions.maxItems).toBe(0);
    expect(request.response_format.json_schema.schema.properties.scenes.minItems).toBe(1);
    expect(isNewAutoSingleScene({
      autoMode: true,
      sceneCount: 1,
      autoDecision: { promptVersion: autoDirectorPromptVersion },
      plan: { scenes: [{ index: 1 }] },
    })).toBe(true);
    expect(isNewAutoSingleScene({
      sceneCount: 1,
      autoDecision: { promptVersion: 'eu-reski-auto-director-v1' },
      plan: { scenes: [{ index: 1 }] },
    })).toBe(false);
  });
});
