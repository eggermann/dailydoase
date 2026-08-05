import { expect, test } from '@jest/globals';
import {
  normalizeLegacyScene,
  validateScenePlan,
} from './compact-scene-plan.js';

const cueRecords = [
  { anchor: { term: 'exhibition' }, collision: { term: 'hunger' } },
  { anchor: { term: 'hunger' }, collision: { term: 'elevator' } },
];

const scene = (anchor, collision) => ({
  semanticAnchor: anchor,
  semanticCollision: collision,
  event: 'A visible physical event changes the room.',
  consequence: 'A visible result remains.',
  stillPrompt: 'A decisive realistic cinematic photograph.',
  videoPrompt: 'The event moves until the visible result remains.',
});

test('validates compact cue identity without judging creative quality', () => {
  expect(validateScenePlan({
    scenePlan: [scene('exhibition', 'hunger'), scene('hunger', 'elevator')],
    sourceCueRecords: cueRecords,
  })).toMatchObject({ valid: true, errors: [] });
});

test('rejects changed semantic cue identity', () => {
  expect(validateScenePlan({
    scenePlan: [scene('exhibition', 'archive'), scene('hunger', 'elevator')],
    sourceCueRecords: cueRecords,
  }).errors).toContain('Scene 1: semanticCollision changed.');
});

test('normalizes legacy fields only at the loading boundary', () => {
  expect(normalizeLegacyScene({
    semanticAction: 'The monster folds lamps into its ribs.',
    localConsequence: 'The aisle stays dark.',
    singleImagePrompt: 'The lamps dim while the camera holds.',
  })).toMatchObject({
    event: 'The monster folds lamps into its ribs.',
    consequence: 'The aisle stays dark.',
    videoPrompt: 'The lamps dim while the camera holds.',
  });
});
