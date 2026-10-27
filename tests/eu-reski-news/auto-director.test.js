import { describe, expect, test } from '@jest/globals';
import {
  autoDirectorPromptVersion,
  autoDirectorSchema,
  buildAutoDirectorRequest,
  resolveAutoModeSetting,
  resolveEffectiveAutoFlags,
  resolveSavedAutoDecision,
  validateAutoDirectorResponse,
} from '../../eu-reski-news/news-scene/auto-director.mjs';

const flags = (overrides = {}) => ({
  storyClou: 'off',
  legacyGuernicaStyleReferencePrompt: false,
  preserveCubistVideoStyle: true,
  sceneVisualControls: 'scene-specific',
  articleImageReference: true,
  landscapePrompt: false,
  videoDirection: 'on',
  videoVision: 'off',
  videoAudioDirection: 'off',
  videoMaxZoom: 0.08,
  ...overrides,
});

const decision = (selected = flags(), { iteration = 1, articleId = 'article-1', constraints = {} } = {}) => {
  const resolved = resolveEffectiveAutoFlags(selected, constraints);
  return {
    autoMode: true,
    iteration,
    articleId,
    model: 'gpt-4.1-mini',
    promptVersion: autoDirectorPromptVersion,
    dramaturgicalConcept: 'An open, fragmentary progression.',
    visualConcept: 'A shallow charcoal mural with one layered scene.',
    motionConcept: 'Slow pan and minimal zoom.',
    audioConcept: 'Sparse sound and intentional silence.',
    selectedFlags: selected,
    effectiveFlags: resolved.effectiveFlags,
    constraints: { noDialogueNarration: false, styleReferenceAvailable: false, guernicaLocationReference: false, articleImageAvailable: false, ...constraints },
    reason: 'The article benefits from restrained visual continuity.',
    constraintsApplied: resolved.constraintsApplied,
  };
};

const response = (value) => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(value) } }] });

describe('EU RESKI auto director', () => {
  test('defaults to off and accepts configuration and CLI activation', () => {
    expect(resolveAutoModeSetting()).toBe(false);
    expect(resolveAutoModeSetting(true)).toBe(true);
    expect(resolveAutoModeSetting(false, ['--auto-mode'])).toBe(true);
    expect(resolveAutoModeSetting(true, ['--no-auto-mode'])).toBe(false);
    expect(() => resolveAutoModeSetting(false, ['--auto-mode', '--no-auto-mode'])).toThrow(/Choose either/);
  });

  test('builds a structured request with the configured Story model and bounded article input', () => {
    const request = buildAutoDirectorRequest({
      article: { id: 'a1', title: 'Headline', text: 'x'.repeat(19000) },
      model: 'gpt-4.1-mini',
      constraints: { noDialogueNarration: true, styleReferenceAvailable: true },
    });
    expect(request.model).toBe('gpt-4.1-mini');
    expect(request.response_format.json_schema.schema).toEqual(autoDirectorSchema);
    expect(JSON.parse(request.messages[1].content).article.text).toHaveLength(18000);
    expect(JSON.parse(request.messages[1].content).fixedConstraints.noDialogueNarration).toBe(true);
    expect(request.max_completion_tokens).toBe(3000);
  });

  test('accepts a complete decision and rejects unknown or unsupported flags', () => {
    const value = {
      dramaturgicalConcept: 'A cycle.', visualConcept: 'Cubist planes.', motionConcept: 'Slow pan.',
      audioConcept: 'Silence.', flags: flags(), reason: 'A quiet treatment suits the story.',
    };
    expect(validateAutoDirectorResponse(response(value)).flags).toEqual(flags());
    expect(() => validateAutoDirectorResponse(response({ ...value, flags: { ...flags(), surprise: true } })))
      .toThrow(/unknown settings/);
    expect(() => validateAutoDirectorResponse(response({ ...value, flags: flags({ videoMaxZoom: 0.31 }) })))
      .toThrow(/videoMaxZoom/);
    expect(() => validateAutoDirectorResponse(response({ ...value, flags: flags({ videoVision: 'on', videoDirection: 'off' }) })))
      .toThrow(/without videoDirection/);
  });

  test('records selected and effective legacy behavior separately', () => {
    const selected = flags({ legacyGuernicaStyleReferencePrompt: true });
    const { effectiveFlags, constraintsApplied } = resolveEffectiveAutoFlags(selected, { styleReferenceAvailable: true });
    expect(selected.preserveCubistVideoStyle).toBe(true);
    expect(selected.sceneVisualControls).toBe('scene-specific');
    expect(effectiveFlags.preserveCubistVideoStyle).toBe(false);
    expect(effectiveFlags.sceneVisualControls).toBe('fixed');
    expect(constraintsApplied).toContain('Legacy Guernica director suppresses the additional Cubist Video Lock.');
    expect(resolveEffectiveAutoFlags(selected, { styleReferenceAvailable: true, guernicaLocationReference: true })
      .effectiveFlags.legacyGuernicaStyleReferencePrompt).toBe(false);
  });

  test('keeps per-iteration decisions independent and fixes the executable video mode', () => {
    const first = flags({ videoMaxZoom: 0.2, articleImageReference: true });
    const second = flags({ videoMaxZoom: 0, articleImageReference: false, storyClou: 'on' });
    const effectiveFirst = resolveEffectiveAutoFlags(first).effectiveFlags;
    const effectiveSecond = resolveEffectiveAutoFlags(second).effectiveFlags;
    expect(effectiveFirst.videoMaxZoom).toBe(0.2);
    expect(effectiveSecond.videoMaxZoom).toBe(0);
    expect(effectiveFirst.articleImageReference).toBe(true);
    expect(effectiveSecond.articleImageReference).toBe(false);
    expect(effectiveFirst.videoMode).toBe('image_to_video');
    expect(effectiveSecond.videoMode).toBe('image_to_video');
    expect(first).not.toBe(second);
  });

  test('reuses only a matching saved decision and refuses missing or mismatched resume state', () => {
    const saved = decision(flags(), { constraints: {} });
    expect(resolveSavedAutoDecision(saved, {
      iteration: 1, articleId: 'article-1', model: 'gpt-4.1-mini',
      promptVersion: autoDirectorPromptVersion, hasDependentWork: true, constraints: saved.constraints,
    })).toBe(saved);
    expect(() => resolveSavedAutoDecision(null, {
      iteration: 1, articleId: 'article-1', model: 'gpt-4.1-mini',
      promptVersion: autoDirectorPromptVersion, hasDependentWork: true,
    })).toThrow(/refusing to choose new settings/);
    expect(resolveSavedAutoDecision(null, {
      iteration: 1, articleId: 'article-1', model: 'gpt-4.1-mini',
      promptVersion: autoDirectorPromptVersion, hasDependentWork: false,
    })).toBeNull();
    expect(() => resolveSavedAutoDecision(saved, {
      iteration: 2, articleId: 'article-1', model: 'gpt-4.1-mini',
      promptVersion: autoDirectorPromptVersion, hasDependentWork: true, constraints: saved.constraints,
    })).toThrow(/does not match/);
    expect(() => resolveSavedAutoDecision(saved, {
      iteration: 1, articleId: 'article-1', model: 'gpt-4.1-mini',
      promptVersion: autoDirectorPromptVersion, hasDependentWork: true,
      constraints: { noDialogueNarration: true, styleReferenceAvailable: false, guernicaLocationReference: false, articleImageAvailable: false },
    })).toThrow(/fixed constraints changed/);
  });
});
