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
  sceneFocus: 'objects',
  event: 'A visible physical event changes the room.',
  consequence: 'A visible result remains.',
  stillPrompt: 'A decisive realistic cinematic photograph.',
  videoPrompt: 'The event moves until the visible result remains.',
});

test('rejects monster wording in a monster-free focus', () => {
  expect(validateScenePlan({
    scenePlan: [{
      ...scene('exhibition', 'hunger'),
      sceneFocus: 'trace',
      stillPrompt: 'The Green Monster leaves wet leaves on the floor.',
    }, scene('hunger', 'elevator')],
    sourceCueRecords: cueRecords,
  }).errors).toContain('Scene 1: monster-free stillPrompt mentions the monster.');
});

test('allows an explicit monster exclusion in a monster-free prompt', () => {
  expect(validateScenePlan({
    scenePlan: [{
      ...scene('exhibition', 'hunger'),
      sceneFocus: 'people',
      monsterPresence: 'absent',
      stillPrompt: 'Shoppers form a barrier around the crate, no monster visible.',
    }, scene('hunger', 'elevator')],
    sourceCueRecords: cueRecords,
  })).toMatchObject({ valid: true, errors: [] });
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
    sceneFocus: 'monster',
    event: 'The monster folds lamps into its ribs.',
    consequence: 'The aisle stays dark.',
    videoPrompt: 'The lamps dim while the camera holds.',
  });
});
