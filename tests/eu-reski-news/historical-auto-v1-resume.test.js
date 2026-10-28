import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, test } from '@jest/globals';
import {
  autoDirectorPromptVersion,
  resolveAutoDecisionAction,
  resolveSavedAutoDecision,
} from '../../eu-reski-news/news-scene/auto-director.mjs';

const fixturePath = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'historical-auto-v1-run-001.json');
const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));

describe('historical Auto Director V1 resume', () => {
  test('reuses actual run-001 decision, count, technical settings, provider tasks, and concept-free requests', () => {
    const saved = structuredClone(fixture.autoDecision);
    const record = structuredClone(fixture.record);
    const decision = resolveSavedAutoDecision(saved, {
      iteration: saved.iteration,
      articleId: saved.articleId,
      model: saved.model,
      promptVersion: autoDirectorPromptVersion,
      hasDependentWork: true,
      constraints: saved.constraints,
    });

    expect(resolveAutoDecisionAction({
      autoMode: true,
      savedDecisionExists: true,
      hasDependentWork: true,
      isResume: true,
      savedAutoMode: true,
    })).toBe('reuse');
    expect(decision.promptVersion).toBe('eu-reski-auto-director-v1');
    expect(record.sceneCount).toBe(5);
    expect(record.sceneDurations).toEqual([8, 5, 7, 5, 8]);
    expect(record.sceneCountSelection).toMatchObject({
      count: 5,
      settings: { mode: 'taktmuster', numerator: 4, denominator: 4, bias: 1 },
    });
    expect(record.videoTaskIds).toHaveLength(5);
    expect(record.videoTaskIds).toContain('be2b51cc-c457-4f46-b481-329ba4dc94a0');
    expect(record.generationSettings.videoModel).toBe('prunaai:p-video@2-pro');
    expect(record.generationSettings.videoResolution).toBe('480p');
    expect(record.generationSettings.videoSettingsMode).toBe('cost');
    expect(record.generationSettings.imageProvider).toBe('hf-flux-klein');
    expect(record.featureSettings.videoVision).toBe('on');
    expect(record.featureSettings.videoAudioDirection).toBe('on');
    expect(Object.values(fixture.promptChecks).every(({ hasAutoConceptHandoff }) => !hasAutoConceptHandoff)).toBe(true);
    expect(fixture.requestHashes).toEqual({
      'gpt-request.json': '898241721e8e0e6eb3fb3c3548cbf8dd8e4b03a3f21995fb180a146f60192c9b',
      'timing-request.json': '0ef8bde7b551361324931dcf07446af02face4ae2aaedb1ddc335bf52d238057',
      'video-direction-request.json': '27dafb97235acd46cb27075072b3f6fc473637fdb54212b49ad26674f464b2eb',
      'audio-direction-request.json': '15cff4abef913f7b47b699d1369e9fce6256e1a261a13b9f1ddcd3a36b7ea300',
      'film-plan.json': 'ae3901dcd7893a95e6976466fb68123498286487760305fd26cf256719c04d70',
    });
    expect(saved).toEqual(fixture.autoDecision);
  });
});
