import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from '@jest/globals';
import { autoDirectorPromptVersion, buildAutoDirectorRequest, resolveAutoDecisionAction } from '../../eu-reski-news/news-scene/auto-director.mjs';
import {
  addUsageIdempotently,
  buildAutoDirectorCorrectionRequest,
  recoverAutoDirectorDecision,
  recoverSavedAutoDirectorDecision,
} from '../../eu-reski-news/news-scene/auto-director-recovery.mjs';

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
  guernicaStyleReference: true,
  guernicaFigureReference: true,
  preserveCubistVideoStyle: true,
  sceneVisualControls: 'scene-specific',
  articleImageReference: true,
  landscapePrompt: false,
  videoDirection: 'on',
  videoVision: 'on',
  videoAudioDirection: 'on',
  videoMaxZoom: 0.12,
  sceneDurationMode: 'taktmuster',
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
  test('integrates saved response files into decision persistence without provider access', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'auto-director-recovery-'));
    const record = { usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 } };
    let persistCalls = 0;
    try {
      await writeFile(join(directory, 'auto-director-request.json'), JSON.stringify(request));
      await writeFile(join(directory, 'auto-director-response.json'), JSON.stringify(response));
      const recovered = await recoverSavedAutoDirectorDecision({
        directory,
        expectedRequest: request,
        articleId: article.id,
        iteration: 3,
        model: request.model,
        constraints,
        record,
        applyDecision: (target, decision) => { target.recovered = decision.sceneCount; },
        persist: async () => { persistCalls += 1; },
      });

      expect(recovered.sceneCount).toBe(5);
      expect(JSON.parse(await readFile(join(directory, 'auto-decisions.json'), 'utf8'))).toEqual(recovered);
      expect(record.recovered).toBe(5);
      expect(record.usage).toMatchObject({ prompt_tokens: 10, completion_tokens: 2, total_tokens: 135 });
      expect(record.autoDirectorUsage).toEqual(response.usage);
      expect(persistCalls).toBe(1);

      const resumed = await recoverSavedAutoDirectorDecision({
        directory,
        expectedRequest: request,
        articleId: article.id,
        iteration: 3,
        model: request.model,
        constraints,
        record,
        applyDecision: () => { throw new Error('saved decision must be reused'); },
        persist: async () => { persistCalls += 1; },
      });
      expect(resumed).toBeNull();
      expect(persistCalls).toBe(1);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test('saved response without original request fails before persistence', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'auto-director-recovery-'));
    try {
      await writeFile(join(directory, 'auto-director-response.json'), JSON.stringify(response));
      let persistCalls = 0;
      await expect(recoverSavedAutoDirectorDecision({
        directory,
        expectedRequest: request,
        articleId: article.id,
        iteration: 3,
        model: request.model,
        constraints,
        record: {},
        applyDecision: () => {},
        persist: async () => { persistCalls += 1; },
      })).rejects.toThrow(/no original request/);
      expect(persistCalls).toBe(0);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test('integrates saved correction request/response files after interruption', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'auto-director-revision-recovery-'));
    const invalidResponse = structuredClone(response);
    invalidResponse.choices[0].message.content = '{"flags":{}}';
    let validationError;
    try {
      recoverAutoDirectorDecision({
        savedRequest: request,
        expectedRequest: request,
        response: invalidResponse,
        articleId: article.id,
        iteration: 3,
        model: request.model,
        constraints,
      });
    } catch (error) {
      validationError = error.message;
    }
    const revisionRequest = buildAutoDirectorCorrectionRequest(request, invalidResponse, validationError);
    const correctionResponse = { ...structuredClone(response), usage: { total_tokens: 77 } };
    let persistCalls = 0;
    const record = {};
    try {
      await writeFile(join(directory, 'auto-director-request.json'), JSON.stringify(request));
      await writeFile(join(directory, 'auto-director-response.json'), JSON.stringify(invalidResponse));
      await writeFile(join(directory, 'auto-director-revision-request.json'), JSON.stringify(revisionRequest));
      await writeFile(join(directory, 'auto-director-revision-response.json'), JSON.stringify(correctionResponse));
      const recovered = await recoverSavedAutoDirectorDecision({
        directory,
        expectedRequest: request,
        articleId: article.id,
        iteration: 3,
        model: request.model,
        constraints,
        record,
        applyDecision: (target, decision) => { target.sceneCount = decision.sceneCount; },
        persist: async () => { persistCalls += 1; },
      });
      expect(recovered.sceneCount).toBe(5);
      expect(record.autoDirectorUsage).toEqual({ total_tokens: 77 });
      expect(record.sceneCount).toBe(5);
      expect(persistCalls).toBe(1);
      expect(JSON.parse(await readFile(join(directory, 'auto-decisions.json'), 'utf8')).usage).toEqual({ total_tokens: 77 });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test('rebuilds a decision from saved original response without another provider call', () => {
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
    expect(recovered.usage).toEqual(response.usage);
  });

  test('uses saved valid correction response after a crash before decision persistence', () => {
    const invalidResponse = structuredClone(response);
    invalidResponse.choices[0].message.content = '{"flags":{}}';
    let validationError;
    try {
      recoverAutoDirectorDecision({
        savedRequest: request,
        expectedRequest: request,
        response: invalidResponse,
        articleId: article.id,
        iteration: 3,
        model: request.model,
        constraints,
      });
    } catch (error) {
      validationError = error.message;
    }
    expect(validationError).toBeTruthy();

    const revisionRequest = buildAutoDirectorCorrectionRequest(request, invalidResponse, validationError);
    const correctionResponse = { ...structuredClone(response), usage: { total_tokens: 77 } };
    const recovered = recoverAutoDirectorDecision({
      savedRequest: request,
      expectedRequest: request,
      response: invalidResponse,
      revisionRequest,
      revisionResponse: correctionResponse,
      articleId: article.id,
      iteration: 3,
      model: request.model,
      constraints,
    });

    expect(recovered.sceneCount).toBe(5);
    expect(recovered.usage).toEqual({ total_tokens: 77 });
    expect(recovered.recoveredFromSavedResponse).toBe(true);
  });

  test('fails closed when saved correction response is invalid', () => {
    const invalidResponse = structuredClone(response);
    invalidResponse.choices[0].message.content = '{"flags":{}}';
    let validationError;
    try {
      recoverAutoDirectorDecision({
        savedRequest: request,
        expectedRequest: request,
        response: invalidResponse,
        articleId: article.id,
        iteration: 3,
        model: request.model,
        constraints,
      });
    } catch (error) {
      validationError = error.message;
    }
    const revisionRequest = buildAutoDirectorCorrectionRequest(request, invalidResponse, validationError);
    const invalidCorrection = structuredClone(invalidResponse);
    expect(() => recoverAutoDirectorDecision({
      savedRequest: request,
      expectedRequest: request,
      response: invalidResponse,
      revisionRequest,
      revisionResponse: invalidCorrection,
      articleId: article.id,
      iteration: 3,
      model: request.model,
      constraints,
    })).toThrow();
  });

  test('does not retry when correction request exists but its response is missing', () => {
    const invalidResponse = structuredClone(response);
    invalidResponse.choices[0].message.content = '{"flags":{}}';
    expect(() => recoverAutoDirectorDecision({
      savedRequest: request,
      expectedRequest: request,
      response: invalidResponse,
      revisionRequest: request,
      articleId: article.id,
      iteration: 3,
      model: request.model,
      constraints,
    })).toThrow(/no saved response; refusing to issue another paid request/);
  });

  test('fails closed when saved answer has no original request', () => {
    expect(() => recoverAutoDirectorDecision({
      savedRequest: null,
      expectedRequest: request,
      response,
      articleId: article.id,
      iteration: 3,
      model: request.model,
      constraints,
    })).toThrow(/request differs/);
  });

  test('adds token usage only once when decision recovery is repeated', () => {
    const record = { usage: { prompt_tokens: 9, completion_tokens: 4, total_tokens: 13 } };
    const recoveredUsage = { prompt_tokens: 20, completion_tokens: 6, total_tokens: 26 };
    addUsageIdempotently(record, 'autoDirectorUsage', recoveredUsage);
    const firstTotals = structuredClone(record.usage);
    addUsageIdempotently(record, 'autoDirectorUsage', recoveredUsage);
    expect(record.autoDirectorUsage).toEqual(recoveredUsage);
    expect(record.usage).toEqual(firstTotals);
    expect(record.usage).toEqual({ prompt_tokens: 29, completion_tokens: 10, total_tokens: 39 });
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
