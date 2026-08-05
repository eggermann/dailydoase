import { expect, test } from '@jest/globals';

import {
  applyStructuralConsequenceInheritance,
  overlapRatio,
  validateSemanticDrivenScenePlan,
} from './semantic-scene-validation.js';

test('meaning overlap normalizes singular and plural physical nouns', () => {
  expect(overlapRatio('tentacles multiply', 'one tentacle bends a lamp')).toBeGreaterThan(0);
});

const cue = {
  sceneIndex: 0,
  sceneCount: 1,
  anchor: { term: 'exhibition', role: 'initialConfiguredTerm' },
  collision: { term: 'archive', streamLabel: '1983', description: 'archive stores history' },
};

const validScene = (overrides = {}) => ({
  semanticAnchor: 'exhibition',
  semanticCollision: 'archive',
  semanticCollisionDescription: 'archive stores history',
  semanticCollisionPhysicalization: 'The monster stores moving reflections in layered elevator doors.',
  semanticConflict: 'An exhibition meant for one present moment accumulates every reflected past.',
  storyCause: 'Stored reflections expose earlier visitors inside the elevator doors.',
  monsterInterpretation: 'The monster treats each moving reflection as history that must be stored.',
  monsterIntent: 'It wants to preserve every movement before it disappears.',
  monsterTactic: 'It catches each moving reflection and presses it into layered elevator doors.',
  semanticAction: 'The monster pulls moving reflections from the floor and stores them in the elevator doors.',
  inheritedConsequence: '',
  localConsequence: 'Layered moving reflections remain trapped across the elevator doors.',
  consequenceFamily: 'perceptual',
  clue: 'One trapped reflection moves before its visitor does.',
  clueStatus: 'seeded',
  clueSource: 'physicalization',
  viewerInference: 'The archive may contain movements from the future.',
  unresolvedQuestion: 'Why does one stored reflection move before its visitor?',
  nextSceneHook: 'The premature reflection reaches toward the next closed door.',
  monsterPresenceMode: 'revealed',
  monsterPresence: 'The monster is visible beside the elevator, pulling reflections from the floor.',
  offscreenMonsterAction: '',
  visibleEvidenceOfAgency: '',
  tensionLevel: 62,
  tensionCause: 'A trapped moving reflection acts before the visitor who cast it.',
  viewpoint: 'A low floor-level view catches reflection and elevator door together.',
  motionCue: 'Reflections peel upward from the floor.',
  cameraCue: 'Track from the floor reflection to the elevator layer it enters.',
  consequenceId: 'scene-01-layered-reflections',
  inheritsConsequenceId: '',
  stillPrompt: 'Moving reflections peel from the floor while the monster stores them inside layered elevator doors.',
  singleImagePrompt: 'Start with moving reflections on the floor. The monster stores them in layered elevator doors, where trapped reflections remain visible.',
  endFrameContinuity: 'Layered moving reflections remain visible in the closed elevator doors.',
  semanticDerivation: {
    anchorContribution: 'The exhibition presents objects in one controlled present.',
    collisionContribution: 'An archive stores history for later retrieval.',
    contradiction: 'The present exhibition survives by accumulating its visitors past movements.',
    physicalization: 'Moving reflections are stored as layers inside elevator doors.',
    causalResult: 'The doors retain earlier versions of every movement.',
  },
  ...overrides,
});

test('accepts a collision physically implemented across action, consequence, and prompts', () => {
  const result = validateSemanticDrivenScenePlan({
    scenePlan: [validScene()],
    sourceCueRecords: [cue],
  });

  expect(result.valid).toBe(true);
  expect(result.reports[0]).toMatchObject({
    cueIdentityValid: true,
    mandatoryFieldsValid: true,
    derivationValid: true,
    collisionPhysicalizationValid: true,
    consequenceInheritanceValid: true,
    clueDerivationValid: true,
    monsterAgencyValid: true,
    tensionDerivationValid: true,
    promptPropagationValid: true,
  });
  expect(result.scenePlan).toEqual([validScene()]);
  expect(result.errors).toEqual([]);
});

test('rejects a missing semantic derivation', () => {
  const result = validateSemanticDrivenScenePlan({
    scenePlan: [validScene({ semanticDerivation: undefined })],
    sourceCueRecords: [cue],
  });

  expect(result.valid).toBe(false);
  expect(result.reports[0].derivationValid).toBe(false);
});

test('rejects generic atmosphere as the sole tension cause', () => {
  const result = validateSemanticDrivenScenePlan({
    scenePlan: [validScene({ tensionCause: 'The room becomes darker and scarier.' })],
    sourceCueRecords: [cue],
  });

  expect(result.reports[0].tensionDerivationValid).toBe(false);
});

test('rejects decorative collision use', () => {
  const result = validateSemanticDrivenScenePlan({
    scenePlan: [validScene({
      semanticCollisionPhysicalization: '',
      semanticAction: 'The room has an archival mood.',
    })],
    sourceCueRecords: [cue],
  });

  expect(result.valid).toBe(false);
  expect(result.reports[0].errors.join(' ')).toMatch(/physicalization|semantic action core/i);
});

test('requires offscreen agency when monster is absent', () => {
  const result = validateSemanticDrivenScenePlan({
    scenePlan: [validScene({
      monsterPresenceMode: 'absent',
      offscreenMonsterAction: '',
      visibleEvidenceOfAgency: '',
    })],
    sourceCueRecords: [cue],
  });

  expect(result.valid).toBe(false);
  expect(result.reports[0].errors).toContain(
    'offscreenMonsterAction is required when monster is absent or trace'
  );
});

test('accepts absent monster agency when its action leaves matching visible evidence', () => {
  const result = validateSemanticDrivenScenePlan({
    scenePlan: [validScene({
      monsterPresenceMode: 'absent',
      monsterPresence: 'The monster remains outside the camera frame.',
      offscreenMonsterAction: 'The monster moves trapped reflections whenever the camera looks away.',
      visibleEvidenceOfAgency: 'Trapped reflections slide into new door layers outside direct focus.',
    })],
    sourceCueRecords: [cue],
  });

  expect(result.reports[0].monsterAgencyValid).toBe(true);
});

test('rejects broken consequence inheritance', () => {
  const secondCue = {
    ...cue,
    sceneIndex: 1,
    sceneCount: 2,
    anchor: { term: 'archive', role: 'carriedSemanticInheritance' },
    collision: { term: 'hunger', streamLabel: '1983', description: 'hunger consumes' },
  };
  const secondScene = validScene({
    semanticAnchor: 'archive',
    semanticCollision: 'hunger',
    semanticCollisionDescription: 'hunger consumes',
    inheritsConsequenceId: 'unrelated-id',
    inheritedConsequence: 'A new clock appears without connection to reflections.',
    semanticDerivation: {
      ...validScene().semanticDerivation,
      collisionContribution: 'Hunger consumes available material.',
    },
  });

  const result = validateSemanticDrivenScenePlan({
    scenePlan: [validScene(), secondScene],
    sourceCueRecords: [{ ...cue, sceneCount: 2 }, secondCue],
  });

  expect(result.valid).toBe(false);
  expect(result.reports[1].errors.join(' ')).toMatch(/inheritsConsequenceId|unrelated/i);
});

test('rejects clue unrelated to its declared collision-chain source', () => {
  const result = validateSemanticDrivenScenePlan({
    scenePlan: [validScene({ clue: 'A broken clock shows midnight.' })],
    sourceCueRecords: [cue],
  });

  expect(result.valid).toBe(false);
  expect(result.reports[0].clueDerivationValid).toBe(false);
});

test('requires clue and clueSource to be empty and none together', () => {
  const validNone = validateSemanticDrivenScenePlan({
    scenePlan: [validScene({ clueStatus: 'none', clue: '', clueSource: 'none' })],
    sourceCueRecords: [cue],
  });
  const invalidNone = validateSemanticDrivenScenePlan({
    scenePlan: [validScene({ clueStatus: 'none', clue: 'A red key appears.', clueSource: 'none' })],
    sourceCueRecords: [cue],
  });

  expect(validNone.reports[0].clueDerivationValid).toBe(true);
  expect(invalidNone.reports[0].clueDerivationValid).toBe(false);
});

test('rejects duplicate consequence IDs', () => {
  const secondCue = {
    ...cue,
    sceneIndex: 1,
    sceneCount: 2,
    anchor: { term: 'archive', role: 'carriedSemanticInheritance' },
    collision: { term: 'hunger', streamLabel: '1983', description: 'hunger consumes' },
  };
  const secondScene = validScene({
    semanticAnchor: 'archive',
    semanticCollision: 'hunger',
    consequenceId: validScene().consequenceId,
    inheritsConsequenceId: validScene().consequenceId,
    inheritedConsequence: validScene().endFrameContinuity,
  });
  const result = validateSemanticDrivenScenePlan({
    scenePlan: [validScene(), secondScene],
    sourceCueRecords: [{ ...cue, sceneCount: 2 }, secondCue],
  });

  expect(result.reports.some((report) => (
    report.errors.includes('consequenceId must be unique')
  ))).toBe(true);
});

test('structural inheritance carries previous visible end state and stable ID', () => {
  const firstScene = validScene();
  const secondScene = validScene({
    inheritedConsequence: 'archive',
    inheritsConsequenceId: 'wrong-id',
  });

  const repaired = applyStructuralConsequenceInheritance([firstScene, secondScene]);

  expect(repaired[1].inheritsConsequenceId).toBe(firstScene.consequenceId);
  expect(repaired[1].inheritedConsequence).toBe(firstScene.endFrameContinuity);
});

test('tension validation accepts normal morphological variants', () => {
  const result = validateSemanticDrivenScenePlan({
    scenePlan: [validScene({
      semanticCollisionPhysicalization: 'Columns animate and pulse green beside breathing fixtures.',
      semanticAction: 'The monster animates columns until they pulse green.',
      localConsequence: 'Animated columns pulse green beside breathing fixtures.',
      stillPrompt: 'Animated columns pulse green beside breathing fixtures.',
      singleImagePrompt: 'Columns animate, pulse green, and leave breathing fixtures behind.',
      tensionCause: 'Surreal material animation makes the columns feel deliberate.',
      semanticDerivation: {
        ...validScene().semanticDerivation,
        physicalization: 'Columns animate and pulse green beside breathing fixtures.',
      },
    })],
    sourceCueRecords: [cue],
  });

  expect(result.reports[0].errors).not.toContain(
    'tensionCause is unrelated to the semantic consequence'
  );
});
