import { expect, test } from '@jest/globals';

import {
  evaluateVisualContinuityComparison,
  normalizeVisualPreparation,
  shouldPrepareVisualStateWithFlux,
} from './visual-continuity-guard.js';
import Generator from './generator.js';

test('visual preparation defaults to direct WAN frame continuation', () => {
  expect(normalizeVisualPreparation()).toBe('continueFrame');
  expect(shouldPrepareVisualStateWithFlux({})).toBe(false);
  expect(shouldPrepareVisualStateWithFlux({ visualPreparation: 'continueFrame' })).toBe(false);
});

test('FLUX visual preparation requires an explicit planner command', () => {
  expect(shouldPrepareVisualStateWithFlux({ visualPreparation: 'fluxEdit' })).toBe(true);
  expect(shouldPrepareVisualStateWithFlux({ visualPreparation: 'anythingElse' })).toBe(false);
});

test('generator applies technical drift correction to single-image continuations', () => {
  const generator = Object.create(Generator.prototype);
  generator.config = {
    driftCorrection: {
      enabled: true,
      applyToSingleImage: true,
    },
  };
  generator.driftCorrectionModel = {};

  expect(generator.shouldApplyDriftCorrection({
    nextScenePlanEntry: {
      videoMode: 'singleImage',
      frameSource: 'lastFrame',
    },
  })).toBe(true);
  expect(generator.shouldApplyDriftCorrection({
    nextScenePlanEntry: {
      videoMode: 'singleImage',
      frameSource: 'lastFrame',
      visualPreparation: 'fluxEdit',
    },
  })).toBe(true);
  expect(generator.shouldApplyDriftCorrection({ nextScenePlanEntry: null })).toBe(false);
});

test('continuity guard rejects the measured full-frame collapse from run 839', () => {
  expect(evaluateVisualContinuityComparison({
    comparable: true,
    meanDifference: 0.3798,
    changedPixelRatio: 0.9495,
  })).toEqual(expect.objectContaining({
    rejected: true,
    reason: 'composition-drift',
  }));
});

test('continuity guard accepts a local visual edit', () => {
  expect(evaluateVisualContinuityComparison({
    comparable: true,
    meanDifference: 0.08,
    changedPixelRatio: 0.22,
  })).toEqual(expect.objectContaining({
    rejected: false,
    reason: 'within-limits',
  }));
});
