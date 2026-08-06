import { expect, test } from '@jest/globals';

import {
  CLEAN_SCENE_PLAN_REPAIR_INSTRUCTION,
  COMPACT_SCENE_PLAN_SYSTEM_PROMPT,
  containsLikelyGermanPlannerText,
  containsPlannerRefusalOrMetaText,
  normalizeLegacyScene,
  parseCompactScenePlan,
  SCENE_FIELD_LIMITS,
  validateEnglishScenePlanContent,
  validateScenePlan,
} from './compact-scene-plan.js';

const createValidScene = (overrides = {}) => ({
  title: 'Shifted Passage',
  semanticAnchor: 'Kaufhaus',
  semanticAnchorEnglish: 'department store',
  semanticCollision: 'Licht',
  semanticCollisionEnglish: 'light',
  sceneFocus: 'location',
  event: 'Temporary partitions slowly change the visible route through the hall.',
  monsterPresence: 'absent',
  consequence: 'The former straight passage ends at a mirrored column.',
  nextHook: 'A reflected line remains beside the column.',
  stillPrompt: 'The real department-store hall with temporary partitions already forming a changed route.',
  videoPrompt: 'The nearest partition shifts slightly and redirects the open passage.',
  cameraCue: 'Mostly held handheld phone shot with one small reframe.',
  startFrameStrategy: 'locationReanchor',
  startFrameReason: 'Establish the real department-store location.',
  ...overrides,
});

test('German planner refusal prose fails complete scene validation', () => {
  const refusal = 'Die Ablehnung passt zum Sicherheitsinhalt der geplanten Szene.';
  expect(containsLikelyGermanPlannerText(refusal)).toBe(true);
  expect(validateEnglishScenePlanContent([createValidScene({ event: refusal })]).valid).toBe(false);
  expect(() => parseCompactScenePlan(JSON.stringify({
    scenes: [createValidScene({ event: refusal })],
  }), 1, [2])).toThrow('Planner response contains refusal');
});

test('valid concise English scene passes language validation', () => {
  const scene = createValidScene();
  expect(containsLikelyGermanPlannerText(scene.event)).toBe(false);
  expect(containsPlannerRefusalOrMetaText(scene.event)).toBe(false);
  expect(validateEnglishScenePlanContent([scene])).toEqual({ valid: true, errors: [] });
});

test('provider fields allow original Semantic Stream terms inside English prose', () => {
  const validation = validateEnglishScenePlanContent([createValidScene({
    title: 'Kaufhaus Passage',
  })]);
  expect(validation.valid).toBe(true);
  expect(validation.errors).not.toContain('Scene 1: title contains an untranslated Semantic Stream term.');
});

test('clean repair instruction contains no raw refusal content', () => {
  const rawRefusal = 'Terrorism Rauchkanister Kinderschuh';
  expect(CLEAN_SCENE_PLAN_REPAIR_INSTRUCTION).toMatch(/previous response was not a valid scene plan/i);
  expect(CLEAN_SCENE_PLAN_REPAIR_INSTRUCTION).toMatch(/new complete JSON scene plan/i);
  expect(CLEAN_SCENE_PLAN_REPAIR_INSTRUCTION).toMatch(/concise English/i);
  expect(CLEAN_SCENE_PLAN_REPAIR_INSTRUCTION).toMatch(/Do not mention the rejected response/i);
  expect(CLEAN_SCENE_PLAN_REPAIR_INSTRUCTION).not.toContain(rawRefusal);
  expect(CLEAN_SCENE_PLAN_REPAIR_INSTRUCTION).not.toMatch(/Terrorism|Rauchkanister|Kinderschuh/i);
});

test('scene fields are compacted only after valid JSON parsing', () => {
  const longText = Array.from({ length: 100 }, () => 'physical event').join(' ');
  const [scene] = parseCompactScenePlan(JSON.stringify({
    scenes: [createValidScene({
      title: longText,
      event: longText,
      stillPrompt: longText,
      videoPrompt: longText,
      cameraCue: longText,
    })],
  }), 1, [2]);

  expect(scene.title.length).toBeLessThanOrEqual(SCENE_FIELD_LIMITS.title);
  expect(scene.event.length).toBeLessThanOrEqual(SCENE_FIELD_LIMITS.event);
  expect(scene.stillPrompt.length).toBeLessThanOrEqual(SCENE_FIELD_LIMITS.stillPrompt);
  expect(scene.videoPrompt.length).toBeLessThanOrEqual(SCENE_FIELD_LIMITS.videoPrompt);
  expect(scene.cameraCue.length).toBeLessThanOrEqual(SCENE_FIELD_LIMITS.cameraCue);
});

test('compact planner contract requires English fields and excludes a camera manual', () => {
  expect(COMPACT_SCENE_PLAN_SYSTEM_PROMPT).toMatch(/Write every generated scene field in concise English/);
  expect(COMPACT_SCENE_PLAN_SYSTEM_PROMPT).toMatch(/Do not answer in German/);
  expect(COMPACT_SCENE_PLAN_SYSTEM_PROMPT).not.toMatch(/natural inertia|autofocus|operator position|camera physics/i);
});

const cueRecords = [
  { anchor: { term: 'exhibition' }, collision: { term: 'hunger' } },
  { anchor: { term: 'hunger' }, collision: { term: 'elevator' } },
];

const compactScene = (anchor, collision) => ({
  title: 'Visible Change',
  semanticAnchor: anchor,
  semanticAnchorEnglish: anchor,
  semanticCollision: collision,
  semanticCollisionEnglish: collision,
  sceneFocus: 'objects',
  event: 'A visible physical event changes the room.',
  monsterPresence: 'absent',
  consequence: 'A visible result remains.',
  nextHook: 'The visible result remains for the next scene.',
  stillPrompt: 'A decisive realistic cinematic photograph.',
  videoPrompt: 'The event moves until the visible result remains.',
  cameraCue: 'Mostly held handheld phone shot.',
  startFrameReason: 'Continue the visible object change.',
});

test('allows monster wording when a non-monster focus still composes the protagonist', () => {
  expect(validateScenePlan({
    scenePlan: [{
      ...compactScene('exhibition', 'hunger'),
      sceneFocus: 'trace',
      monsterPresence: 'visible at the edge of the frame',
      stillPrompt: 'The Green Monster leaves wet leaves on the floor.',
    }, compactScene('hunger', 'elevator')],
    sourceCueRecords: cueRecords,
  })).toMatchObject({ valid: true, errors: [] });
});

test('allows an explicit monster exclusion in a monster-free prompt', () => {
  expect(validateScenePlan({
    scenePlan: [{
      ...compactScene('exhibition', 'hunger'),
      sceneFocus: 'people',
      monsterPresence: 'absent',
      stillPrompt: 'Shoppers form a barrier around the crate, no monster visible.',
    }, compactScene('hunger', 'elevator')],
    sourceCueRecords: cueRecords,
  })).toMatchObject({ valid: true, errors: [] });
});

test('validates compact cue identity without judging creative quality', () => {
  expect(validateScenePlan({
    scenePlan: [compactScene('exhibition', 'hunger'), compactScene('hunger', 'elevator')],
    sourceCueRecords: cueRecords,
  })).toMatchObject({ valid: true, errors: [] });
});

test('rejects changed semantic cue identity', () => {
  expect(validateScenePlan({
    scenePlan: [compactScene('exhibition', 'archive'), compactScene('hunger', 'elevator')],
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
