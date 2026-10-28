import { describe, expect, test } from '@jest/globals';
import { autoDirectorPromptVersion, buildAutoDirectorRequest, resolveAutoDecisionAction } from '../../eu-reski-news/news-scene/auto-director.mjs';
import { recoverAutoDirectorDecision } from '../../eu-reski-news/news-scene/auto-director-recovery.mjs';

const constraints = {
  noDialogueNarration: false,
  styleReferenceAvailable: true,
  guernicaLocationReference: false,
  articleImageAvailable: true,
  fixedVisualStyleOptions: { symbolic: true, roomDeepness: false, layering: 3 },
  sceneCount: { minimum: 2, maximum: 8 },
};
const article = { id: 'article-7', title: 'A saved article', text: 'Saved story input.' };
const request = buildAutoDirectorRequest({ article, model: 'gpt-4.1-mini', constraints });
const flags = {
  storyClou: 'on',
  legacyGuernicaStyleReferencePrompt: false,
  preserveCubistVideoStyle: true,
  sceneVisualControls: 'scene-specific',
  articleImageReference: true,
  landscapePrompt: false,
  videoDirection: 'on',
  videoVision: 'on',
  videoAudioDirection: 'on',
  videoMaxZoom: 0.12,
};
const response = {
  choices: [{
    finish_reason: 'stop',
    message: { content: JSON.stringify({
      dramaturgicalConcept: 'Open with a quiet rupture and return to its cause.',
      visualConcept: 'Charcoal planes gather around one changing focal shape.',
      motionConcept: 'Slow lateral drift; no new camera grammar.',
      audioConcept: 'Low mechanical pulse with deliberate silence.',
      sceneCount: 5,
      sceneCountReason: 'Five causal turns keep the article legible without flattening its conflict.',
      flags,
      reason: 'A restrained visual progression supports the article.',
    }) },
  }],
  usage: { total_tokens: 123 },
};

describe('Auto Director response crash recovery', () => {
  test('rebuilds a decision from saved request/response without another provider call', () => {
    let paidRequests = 0;
    const recovered = recoverAutoDirectorDecision({
      savedRequest: structuredClone(request),
      expectedRequest: request,
      response,
      articleId: article.id,
      iteration: 3,
      model: request.model,
      constraints,
    });

    expect(recovered.promptVersion).toBe(autoDirectorPromptVersion);
    expect(recovered.sceneCount).toBe(5);
    expect(recovered.audioConcept).toContain('silence');
    expect(recovered.recoveredFromSavedResponse).toBe(true);
    expect(recovered.conceptSnapshotHash).toMatch(/^[a-f0-9]{64}$/);
    expect(paidRequests).toBe(0);
  });

  test('rejects a response when original saved request differs from resume inputs', () => {
    expect(() => recoverAutoDirectorDecision({
      savedRequest: { ...request, model: 'changed-model' },
      expectedRequest: request,
      response,
      articleId: article.id,
      iteration: 3,
      model: request.model,
      constraints,
    })).toThrow(/request differs/);
  });

  test('unknown provider outcome stays fail-closed while pending marker can be preserved', () => {
    expect(() => resolveAutoDecisionAction({
      autoMode: true,
      savedDecisionExists: false,
      hasDependentWork: true,
      isResume: true,
      savedAutoMode: true,
    })).toThrow(/refusing to issue a new paid request/);
  });
});
