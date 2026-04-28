import {
  isReferenceImageActorMode,
  normalizeStoryMode,
  STORY_MODE_REFERENCE_IMAGE_ACTOR,
} from './LiveContextOrchestrator-config.js';

test('normalizeStoryMode maps camera aliases to reference-image-actor', () => {
  expect(normalizeStoryMode('camera')).toBe(STORY_MODE_REFERENCE_IMAGE_ACTOR);
  expect(normalizeStoryMode('cameraShot')).toBe(STORY_MODE_REFERENCE_IMAGE_ACTOR);
  expect(normalizeStoryMode('reference-image-actor')).toBe(STORY_MODE_REFERENCE_IMAGE_ACTOR);
});

test('isReferenceImageActorMode recognizes both canonical and aliased inputs', () => {
  expect(isReferenceImageActorMode('camera')).toBe(true);
  expect(isReferenceImageActorMode('reference-image-actor')).toBe(true);
  expect(isReferenceImageActorMode('generated')).toBe(false);
});
