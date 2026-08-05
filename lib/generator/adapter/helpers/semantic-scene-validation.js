const normalizeText = (value) => String(value || '').trim();
const normalizeIdentity = (value) => normalizeText(value).replace(/\s+/g, ' ').toLowerCase();

export const MONSTER_PRESENCE_MODES = [
  'absent',
  'trace',
  'ambiguous',
  'partial',
  'reflected',
  'distant',
  'revealed',
  'dominant',
];

export const CLUE_STATUSES = [
  'none',
  'seeded',
  'repeated',
  'distorted',
  'confirmed',
  'recontextualized',
  'paidOff',
];

export const CLUE_SOURCES = [
  'physicalization',
  'tactic',
  'consequence',
  'endFrame',
];

export const CONSEQUENCE_FAMILIES = [
  'spatial',
  'temporal',
  'behavioral',
  'material',
  'social',
  'acoustic',
  'mechanical',
  'environmental',
  'perceptual',
];

const REQUIRED_TEXT_FIELDS = [
  'semanticConflict',
  'semanticCollisionPhysicalization',
  'storyCause',
  'monsterInterpretation',
  'monsterIntent',
  'monsterTactic',
  'semanticAction',
  'localConsequence',
  'unresolvedQuestion',
  'nextSceneHook',
  'tensionCause',
  'stillPrompt',
  'singleImagePrompt',
  'endFrameContinuity',
];

const DERIVATION_FIELDS = [
  'anchorContribution',
  'collisionContribution',
  'contradiction',
  'physicalization',
  'causalResult',
];

const GENERIC_HORROR_WORDS = new Set([
  'ominous',
  'dark',
  'scary',
  'tense',
  'mysterious',
  'approaches',
  'pushes',
]);

const DECORATIVE_WORDS = new Set([
  'mood',
  'adjective',
  'title',
  'metaphor',
  'background',
  'color',
  'coloured',
  'colored',
]);

const STOP_WORDS = new Set([
  'about', 'after', 'again', 'along', 'also', 'because', 'becomes', 'being',
  'every', 'from', 'inside', 'into', 'itself', 'monster', 'scene', 'specific',
  'their', 'there', 'these', 'this', 'through', 'toward', 'while', 'with',
]);

const normalizeWord = (word) => {
  if (word.length > 7 && word.endsWith('ation')) {
    return word.slice(0, -4);
  }
  if (word.length > 6 && word.endsWith('ing')) {
    return word.slice(0, -3);
  }
  if (word.length > 5 && word.endsWith('ed')) {
    return word.slice(0, -2);
  }
  if (word.length > 5 && word.endsWith('s')) {
    return word.slice(0, -1);
  }
  return word;
};

const words = (value) => normalizeIdentity(value)
  .split(/[^\p{L}\p{N}]+/u)
  .filter((word) => word.length >= 4 && !STOP_WORDS.has(word))
  .map(normalizeWord);

const sharesConcreteLanguage = (source, target) => {
  const sourceWords = new Set(words(source));
  return words(target).some((word) => sourceWords.has(word));
};

export const applyStructuralConsequenceInheritance = (scenePlan = []) => scenePlan.map(
  (scene, sceneIndex) => {
    if (sceneIndex === 0) {
      return {
        ...scene,
        inheritsConsequenceId: '',
      };
    }

    const previousScene = scenePlan[sceneIndex - 1] || {};
    const previousVisibleState = normalizeText(
      previousScene.endFrameContinuity || previousScene.localConsequence
    );
    const inheritedConsequence = sharesConcreteLanguage(
      [previousScene.localConsequence, previousScene.endFrameContinuity].filter(Boolean).join(' '),
      scene.inheritedConsequence
    )
      ? scene.inheritedConsequence
      : previousVisibleState;

    return {
      ...scene,
      inheritsConsequenceId: normalizeText(previousScene.consequenceId),
      inheritedConsequence,
    };
  }
);

const addMissingTextErrors = (scene, errors) => {
  for (const field of REQUIRED_TEXT_FIELDS) {
    if (!normalizeText(scene?.[field])) {
      errors.push(`${field} must not be empty`);
    }
  }

  for (const field of DERIVATION_FIELDS) {
    if (!normalizeText(scene?.semanticDerivation?.[field])) {
      errors.push(`semanticDerivation.${field} must not be empty`);
    }
  }
};

const validateCueIdentity = (scene, cue, errors) => {
  if (normalizeIdentity(scene?.semanticAnchor) !== normalizeIdentity(cue?.anchor?.term)) {
    errors.push('semanticAnchor does not match cue.anchor.term');
  }
  if (normalizeIdentity(scene?.semanticCollision) !== normalizeIdentity(cue?.collision?.term)) {
    errors.push('semanticCollision does not match cue.collision.term');
  }
};

const validatePhysicalization = (scene, errors) => {
  const physicalization = normalizeText(scene?.semanticCollisionPhysicalization);
  const derivationPhysicalization = normalizeText(scene?.semanticDerivation?.physicalization);
  const collisionContribution = normalizeText(scene?.semanticDerivation?.collisionContribution);
  const collision = normalizeText(scene?.semanticCollision);
  const physicalMeaningDeclared = sharesConcreteLanguage(collision, physicalization)
    || sharesConcreteLanguage(collision, collisionContribution)
    || normalizeIdentity(collisionContribution).includes(normalizeIdentity(collision));

  if (physicalization && !physicalMeaningDeclared) {
    errors.push('collision is not explained by its declared physical interpretation');
  }
  if (physicalization && derivationPhysicalization
    && !sharesConcreteLanguage(physicalization, derivationPhysicalization)) {
    errors.push('semanticDerivation.physicalization contradicts the declared physicalization');
  }

  for (const field of ['semanticAction', 'localConsequence', 'stillPrompt', 'singleImagePrompt']) {
    const target = normalizeText(scene?.[field]);
    if (physicalization && target && !sharesConcreteLanguage(physicalization, target)) {
      errors.push(`${field} does not visibly implement semanticCollisionPhysicalization`);
    }
  }

  const physicalWords = words(physicalization);
  const decorativeOnly = physicalWords.length > 0
    && physicalWords.every((word) => DECORATIVE_WORDS.has(word) || GENERIC_HORROR_WORDS.has(word));
  if (decorativeOnly) {
    errors.push('semantic collision is decorative rather than physical');
  }

  return errors.every((error) => !error.includes('physical'));
};

const validatePresence = (scene, errors) => {
  if (!MONSTER_PRESENCE_MODES.includes(scene?.monsterPresenceMode)) {
    errors.push(`monsterPresenceMode must be one of: ${MONSTER_PRESENCE_MODES.join(', ')}`);
    return;
  }
  if (['absent', 'trace'].includes(scene.monsterPresenceMode)) {
    if (!normalizeText(scene.offscreenMonsterAction)) {
      errors.push('offscreenMonsterAction is required when monster is absent or trace');
    }
    if (!normalizeText(scene.visibleEvidenceOfAgency)) {
      errors.push('visibleEvidenceOfAgency is required when monster is absent or trace');
    }
  }
};

const validateClue = (scene, errors) => {
  if (!CLUE_STATUSES.includes(scene?.clueStatus)) {
    errors.push(`clueStatus must be one of: ${CLUE_STATUSES.join(', ')}`);
  }
  if (!CLUE_SOURCES.includes(scene?.clueSource)) {
    errors.push(`clueSource must be one of: ${CLUE_SOURCES.join(', ')}`);
    return false;
  }
  if (scene.clueStatus === 'none' && !normalizeText(scene.clue)) {
    return true;
  }

  const sourceByType = {
    physicalization: scene.semanticCollisionPhysicalization,
    tactic: scene.monsterTactic,
    consequence: scene.localConsequence,
    endFrame: scene.endFrameContinuity,
  };
  if (!normalizeText(scene.clue)) {
    errors.push('clue must not be empty unless clueStatus is none');
    return false;
  }
  if (!sharesConcreteLanguage(sourceByType[scene.clueSource], scene.clue)) {
    errors.push('clue is unrelated to its declared clueSource');
    return false;
  }
  return true;
};

const validateConsequenceInheritance = (scene, previousScene, sceneIndex, errors) => {
  if (sceneIndex === 0) {
    if (normalizeText(scene.inheritsConsequenceId)) {
      errors.push('first scene must not inherit a consequence ID');
    }
    return true;
  }

  if (normalizeText(scene.inheritsConsequenceId) !== normalizeText(previousScene?.consequenceId)) {
    errors.push('inheritsConsequenceId does not match previous consequenceId');
  }
  if (!normalizeText(scene.inheritedConsequence)) {
    errors.push('inheritedConsequence must not be empty after the first scene');
  } else {
    const previousVisibleState = [
      previousScene?.localConsequence,
      previousScene?.endFrameContinuity,
    ].filter(Boolean).join(' ');
    if (!sharesConcreteLanguage(previousVisibleState, scene.inheritedConsequence)) {
      errors.push('inheritedConsequence is unrelated to the previous visible consequence');
    }
  }
  return errors.every((error) => !error.includes('Consequence') && !error.includes('consequenceId'));
};

const validateTension = (scene, errors) => {
  const tension = Number(scene?.tensionLevel);
  if (!Number.isFinite(tension) || tension < 0 || tension > 100) {
    errors.push('tensionLevel must be between 0 and 100');
  }
  const tensionCause = normalizeIdentity(scene?.tensionCause);
  const onlyGenericWords = words(tensionCause).length > 0
    && words(tensionCause).every((word) => GENERIC_HORROR_WORDS.has(word));
  if (onlyGenericWords || /^the atmosphere becomes (darker|scarier)/.test(tensionCause)) {
    errors.push('tensionCause is generic and not caused by the semantic collision');
  }
  if (tensionCause && !sharesConcreteLanguage([
    scene.semanticCollisionPhysicalization,
    scene.monsterTactic,
    scene.localConsequence,
  ].join(' '), tensionCause)) {
    errors.push('tensionCause is unrelated to the semantic consequence');
  }
};

const validatePromptPropagation = (scene, errors) => {
  const semanticCore = [
    scene.semanticCollisionPhysicalization,
    scene.semanticAction || scene.offscreenMonsterAction,
    scene.localConsequence,
  ].filter(Boolean);
  const prompts = [
    ['stillPrompt', scene.stillPrompt],
    ['singleImagePrompt', scene.singleImagePrompt],
  ];

  let valid = true;
  for (const [field, prompt] of prompts) {
    for (const corePart of semanticCore) {
      if (normalizeText(prompt) && !sharesConcreteLanguage(corePart, prompt)) {
        errors.push(`${field} does not contain the complete semantic action core`);
        valid = false;
        break;
      }
    }
  }
  return valid;
};

const validateGenericFallback = (scene, errors) => {
  const causalText = [
    scene.semanticCollisionPhysicalization,
    scene.semanticAction,
    scene.localConsequence,
    scene.tensionCause,
    scene.stillPrompt,
    scene.singleImagePrompt,
  ].filter(Boolean).join(' ');
  const causalWords = words(causalText);
  if (causalWords.length > 0 && causalWords.every((word) => GENERIC_HORROR_WORDS.has(word))) {
    errors.push('scene is a generic horror fallback without a concrete collision event');
  }
};

export const validateSemanticDrivenScenePlan = ({
  scenePlan = [],
  sourceCueRecords = [],
} = {}) => {
  const reports = scenePlan.map((scene, sceneIndex) => {
    const cue = sourceCueRecords[sceneIndex];
    const errors = [];
    const warnings = [];

    if (!cue) {
      errors.push('missing structured source cue record');
    } else {
      validateCueIdentity(scene, cue, errors);
    }
    addMissingTextErrors(scene, errors);
    validatePresence(scene, errors);
    validateTension(scene, errors);
    validateGenericFallback(scene, errors);

    if (!CONSEQUENCE_FAMILIES.includes(scene?.consequenceFamily)) {
      warnings.push(`consequenceFamily should be one of: ${CONSEQUENCE_FAMILIES.join(', ')}`);
    }

    const collisionPhysicalizationValid = validatePhysicalization(scene, errors);
    const clueDerivationValid = validateClue(scene, errors);
    const consequenceInheritanceValid = validateConsequenceInheritance(
      scene,
      scenePlan[sceneIndex - 1],
      sceneIndex,
      errors
    );
    const promptPropagationValid = validatePromptPropagation(scene, errors);

    return {
      sceneIndex,
      anchor: cue?.anchor?.term || '',
      collision: cue?.collision?.term || '',
      valid: errors.length === 0,
      errors,
      warnings,
      consequenceInheritanceValid,
      collisionPhysicalizationValid,
      clueDerivationValid,
      promptPropagationValid,
    };
  });

  if (scenePlan.length !== sourceCueRecords.length) {
    reports.push({
      sceneIndex: -1,
      anchor: '',
      collision: '',
      valid: false,
      errors: [`scene/cue count mismatch: ${scenePlan.length}/${sourceCueRecords.length}`],
      warnings: [],
      consequenceInheritanceValid: false,
      collisionPhysicalizationValid: false,
      clueDerivationValid: false,
      promptPropagationValid: false,
    });
  }

  return {
    valid: reports.length > 0 && reports.every((report) => report.valid),
    reports,
  };
};

export const assertSemanticDrivenScenePlan = (options = {}) => {
  const validation = validateSemanticDrivenScenePlan(options);
  if (!validation.valid) {
    const message = validation.reports
      .filter((report) => !report.valid)
      .map((report) => `scene ${report.sceneIndex + 1}: ${report.errors.join('; ')}`)
      .join(' | ');
    const error = new Error(`Semantic scene validation failed: ${message}`);
    error.name = 'SemanticSceneValidationError';
    error.validation = validation;
    throw error;
  }
  return validation;
};

export default {
  applyStructuralConsequenceInheritance,
  assertSemanticDrivenScenePlan,
  validateSemanticDrivenScenePlan,
};
