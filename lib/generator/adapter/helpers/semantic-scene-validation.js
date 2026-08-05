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
  'none',
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

export const GENERIC_TENSION_ONLY_PATTERNS = [
  /darker/i,
  /scarier/i,
  /more ominous/i,
  /tense atmosphere/i,
  /dramatic lighting/i,
  /camera pushes in/i,
  /louder sound/i,
];

export const DECORATIVE_PATTERNS = [
  /mood/i,
  /atmosphere/i,
  /feels? like/i,
  /symbolizes?/i,
  /represents?/i,
  /evokes?/i,
  /becomes darker/i,
  /takes on .* color/i,
  /looks? .* hungry/i,
  /appears? mysterious/i,
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
  'consequenceId',
];

const DERIVATION_FIELDS = [
  'anchorContribution',
  'collisionContribution',
  'contradiction',
  'physicalization',
  'causalResult',
];

const STOP_WORDS = new Set([
  'about', 'after', 'again', 'along', 'also', 'because', 'becomes', 'being',
  'every', 'from', 'inside', 'into', 'itself', 'monster', 'scene', 'specific',
  'their', 'there', 'these', 'this', 'through', 'toward', 'while', 'with',
  'would', 'could', 'should', 'must', 'only', 'than', 'then', 'that', 'where',
]);

const PHYSICAL_ACTION_PATTERN = /\b(?:arrang(?:e|es|ed|ing)|bend(?:s|ing)?|broke|break(?:s|ing)?|cast(?:s|ing)?|caught|catch(?:es|ing)?|caus(?:e|es|ed|ing)|clos(?:e|es|ed|ing)|coalesc(?:e|es|ed|ing)|consum(?:e|es|ed|ing)|crack(?:s|ed|ing)?|cut(?:s|ting)?|drag(?:s|ged|ging)?|drop(?:s|ped|ping)?|extinguish(?:es|ed|ing)?|fall(?:s|en|ing)?|fill(?:s|ed|ing)?|flicker(?:s|ed|ing)?|flare(?:s|d|ing)?|fold(?:s|ed|ing)?|froze|freez(?:e|es|ing)|grab(?:s|bed|bing)?|held|hold(?:s|ing)?|illuminat(?:e|es|ed|ing)|lift(?:s|ed|ing)?|lock(?:s|ed|ing)?|melt(?:s|ed|ing)?|merg(?:e|es|ed|ing)|morph(?:s|ed|ing)?|mov(?:e|es|ed|ing)|multipli(?:es|ed|ing)|open(?:s|ed|ing)?|peel(?:s|ed|ing)?|press(?:es|ed|ing)?|pull(?:s|ed|ing)?|puls(?:e|es|ed|ing)|push(?:es|ed|ing)?|remov(?:e|es|ed|ing)|reproduc(?:e|es|ed|ing)|rip(?:s|ped|ping)?|rippl(?:e|es|ed|ing)|rotat(?:e|es|ed|ing)|shatter(?:s|ed|ing)?|slid(?:e|es|ing)|sort(?:s|ed|ing)?|spread(?:s|ing)?|stack(?:s|ed|ing)?|stor(?:e|es|ed|ing)|stretch(?:es|ed|ing)?|swallow(?:s|ed|ing)?|swirl(?:s|ed|ing)?|tore|tear(?:s|ing)?|transform(?:s|ed|ing)?|trap(?:s|ped|ping)?|twist(?:s|ed|ing)?|warp(?:s|ed|ing)?)\b/i;

const GENERIC_CONSEQUENCE_PATTERN = /^(?:the )?(?:mood|atmosphere|room|scene) (?:changes?|becomes?|feels?|looks?)(?: more)? (?:dark|darker|scary|scarier|tense|ominous|mysterious)[.!]?$/i;

const normalizeWord = (word) => {
  if (word.length > 7 && word.endsWith('ation')) return word.slice(0, -4);
  if (word.length > 6 && word.endsWith('ing')) return word.slice(0, -3);
  if (word.length > 5 && word.endsWith('ed')) return word.slice(0, -2);
  if (word.length > 5 && /(?:ses|xes|zes|ches|shes)$/.test(word)) return word.slice(0, -2);
  if (word.length > 5 && word.endsWith('s')) return word.slice(0, -1);
  return word;
};

export const tokenizeMeaningfulWords = (value) => normalizeIdentity(value)
  .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
  .split(/\s+/)
  .filter((word) => word.length >= 4 && !STOP_WORDS.has(word))
  .map(normalizeWord);

export const overlapRatio = (source, target) => {
  const sourceTokens = new Set(tokenizeMeaningfulWords(source));
  const targetTokens = new Set(tokenizeMeaningfulWords(target));
  if (sourceTokens.size === 0) return 0;
  const overlap = [...sourceTokens].filter((token) => targetTokens.has(token)).length;
  return overlap / sourceTokens.size;
};

const sharesMeaning = (source, target, threshold = 0.1) => (
  overlapRatio(source, target) >= threshold || overlapRatio(target, source) >= threshold
);

const hasConcretePhysicalEvent = (value) => {
  const text = normalizeText(value);
  return PHYSICAL_ACTION_PATTERN.test(text) && tokenizeMeaningfulWords(text).length >= 3;
};

const slugify = (value) => normalizeIdentity(value)
  .replace(/[^\p{L}\p{N}]+/gu, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 48) || 'visible-consequence';

export const detectDecorativeSemanticUse = (scene = {}) => {
  const collision = normalizeIdentity(scene.semanticCollision);
  const physicalization = normalizeText(scene.semanticCollisionPhysicalization);
  const semanticAction = normalizeText(scene.semanticAction);
  const consequence = normalizeText(scene.localConsequence);
  const allText = [physicalization, semanticAction, consequence].join(' ');
  const collisionAppears = collision && normalizeIdentity(allText).includes(collision);
  const onlyDecorativeChange = DECORATIVE_PATTERNS.some((pattern) => pattern.test(allText));

  return Boolean(
    collisionAppears
    && !hasConcretePhysicalEvent(physicalization)
    && !hasConcretePhysicalEvent(semanticAction)
    && (!consequence || GENERIC_CONSEQUENCE_PATTERN.test(consequence))
    && onlyDecorativeChange
  );
};

export const applyStructuralConsequenceInheritance = (scenePlan = []) => scenePlan.map(
  (scene, sceneIndex) => {
    const consequenceId = normalizeText(scene.consequenceId) || [
      `scene-${String(sceneIndex + 1).padStart(2, '0')}`,
      slugify(scene.localConsequence),
    ].join('-');

    if (sceneIndex === 0) {
      return { ...scene, consequenceId, inheritsConsequenceId: '' };
    }

    const previousScene = scenePlan[sceneIndex - 1] || {};
    const previousConsequenceId = normalizeText(previousScene.consequenceId) || [
      `scene-${String(sceneIndex).padStart(2, '0')}`,
      slugify(previousScene.localConsequence),
    ].join('-');
    const previousVisibleState = normalizeText(
      previousScene.endFrameContinuity || previousScene.localConsequence
    );
    const inheritedConsequence = sharesMeaning(
      [previousScene.localConsequence, previousScene.endFrameContinuity].filter(Boolean).join(' '),
      scene.inheritedConsequence
    ) ? scene.inheritedConsequence : previousVisibleState;

    return {
      ...scene,
      consequenceId,
      inheritsConsequenceId: previousConsequenceId,
      inheritedConsequence,
    };
  }
);

const validateMandatoryFields = (scene, errors) => {
  const before = errors.length;
  for (const field of REQUIRED_TEXT_FIELDS) {
    if (!normalizeText(scene?.[field])) errors.push(`${field} must not be empty`);
  }
  for (const field of DERIVATION_FIELDS) {
    if (!normalizeText(scene?.semanticDerivation?.[field])) {
      errors.push(`semanticDerivation.${field} must not be empty`);
    }
  }
  return errors.length === before;
};

const validateCueIdentity = (scene, cue, errors) => {
  const before = errors.length;
  if (normalizeIdentity(scene?.semanticAnchor) !== normalizeIdentity(cue?.anchor?.term)) {
    errors.push('semanticAnchor does not match cue.anchor.term');
  }
  if (normalizeIdentity(scene?.semanticCollision) !== normalizeIdentity(cue?.collision?.term)) {
    errors.push('semanticCollision does not match cue.collision.term');
  }
  return errors.length === before;
};

const validateDerivation = (scene, errors) => {
  const before = errors.length;
  const derivation = scene?.semanticDerivation || {};
  const physicalization = normalizeText(scene.semanticCollisionPhysicalization);

  if (!DERIVATION_FIELDS.every((field) => normalizeText(derivation[field]))) {
    return false;
  }
  const collisionSource = [
    scene.semanticCollision,
    scene.semanticCollisionDescription,
  ].filter(Boolean).join(' ');
  if (!sharesMeaning(collisionSource, derivation.collisionContribution, 0.1)) {
    errors.push('semanticDerivation.collisionContribution is unrelated to the fresh collision');
  }
  if (!hasConcretePhysicalEvent(derivation.physicalization)) {
    errors.push('semanticDerivation.physicalization must describe a concrete physical event');
  }
  if (!sharesMeaning(physicalization, derivation.physicalization, 0.1)) {
    errors.push('semanticDerivation.physicalization contradicts semanticCollisionPhysicalization');
  }
  if (!sharesMeaning(derivation.causalResult, scene.localConsequence, 0.1)) {
    errors.push('semanticDerivation.causalResult does not correspond to localConsequence');
  }
  return errors.length === before;
};

const validatePhysicalization = (scene, errors, warnings) => {
  const before = errors.length;
  const physicalization = normalizeText(scene.semanticCollisionPhysicalization);
  if (!hasConcretePhysicalEvent(physicalization)) {
    errors.push('semanticCollisionPhysicalization must describe a concrete subject-object event');
  }
  if (detectDecorativeSemanticUse(scene)) {
    errors.push('semantic collision is decorative rather than physical');
  }

  const targets = [
    ['semanticAction', scene.semanticAction, 0.15],
    ['localConsequence', scene.localConsequence, 0.1],
    ['stillPrompt', scene.stillPrompt, 0.1],
    ['singleImagePrompt', scene.singleImagePrompt, 0.1],
  ];
  const propagated = targets.filter(([, target, threshold]) => (
    sharesMeaning(physicalization, target, threshold)
  ));
  if (physicalization && propagated.length === 0) {
    errors.push('semanticCollisionPhysicalization has no meaningful downstream propagation');
  } else if (propagated.length < targets.length) {
    warnings.push(`physicalization propagation is marginal in: ${targets
      .filter(([field]) => !propagated.some(([propagatedField]) => propagatedField === field))
      .map(([field]) => field).join(', ')}`);
  }
  return errors.length === before;
};

const validatePresence = (scene, errors) => {
  const before = errors.length;
  if (!MONSTER_PRESENCE_MODES.includes(scene?.monsterPresenceMode)) {
    errors.push(`monsterPresenceMode must be one of: ${MONSTER_PRESENCE_MODES.join(', ')}`);
    return false;
  }
  if (['absent', 'trace'].includes(scene.monsterPresenceMode)) {
    if (!normalizeText(scene.offscreenMonsterAction)) {
      errors.push('offscreenMonsterAction is required when monster is absent or trace');
    }
    if (!normalizeText(scene.visibleEvidenceOfAgency)) {
      errors.push('visibleEvidenceOfAgency is required when monster is absent or trace');
    }
    if (normalizeText(scene.offscreenMonsterAction)
      && normalizeText(scene.visibleEvidenceOfAgency)
      && !sharesMeaning(scene.offscreenMonsterAction, scene.visibleEvidenceOfAgency, 0.1)) {
      errors.push('visibleEvidenceOfAgency is unrelated to offscreenMonsterAction');
    }
  }
  return errors.length === before;
};

const validateClue = (scene, errors) => {
  const before = errors.length;
  if (!CLUE_STATUSES.includes(scene?.clueStatus)) {
    errors.push(`clueStatus must be one of: ${CLUE_STATUSES.join(', ')}`);
  }

  if (scene.clueStatus === 'none') {
    if (normalizeText(scene.clue)) errors.push('clue must be empty when clueStatus is none');
    if (scene.clueSource !== 'none') errors.push('clueSource must be none when clueStatus is none');
    return errors.length === before;
  }

  if (!CLUE_SOURCES.includes(scene?.clueSource) || scene.clueSource === 'none') {
    errors.push('clueSource must identify a physical source when clueStatus is active');
    return false;
  }
  if (!normalizeText(scene.clue)) {
    errors.push('clue must not be empty unless clueStatus is none');
    return false;
  }

  const sourceByType = {
    physicalization: scene.semanticCollisionPhysicalization,
    tactic: [scene.monsterTactic, scene.offscreenMonsterAction].filter(Boolean).join(' '),
    consequence: scene.localConsequence,
    endFrame: scene.endFrameContinuity,
  };
  if (!sharesMeaning(sourceByType[scene.clueSource], scene.clue, 0.1)) {
    errors.push('clue is unrelated to its declared clueSource');
  }
  return errors.length === before;
};

const validateConsequenceInheritance = (scenePlan, scene, sceneIndex, errors) => {
  const before = errors.length;
  const consequenceId = normalizeText(scene.consequenceId);
  if (!consequenceId) errors.push('consequenceId must not be empty');
  if (consequenceId && scenePlan.some((candidate, candidateIndex) => (
    candidateIndex !== sceneIndex
    && normalizeText(candidate.consequenceId) === consequenceId
  ))) {
    errors.push('consequenceId must be unique');
  }

  if (sceneIndex === 0) {
    if (normalizeText(scene.inheritsConsequenceId)) {
      errors.push('first scene must not inherit a consequence ID');
    }
    return errors.length === before;
  }

  const previousScene = scenePlan[sceneIndex - 1] || {};
  if (normalizeText(scene.inheritsConsequenceId) !== normalizeText(previousScene.consequenceId)) {
    errors.push('inheritsConsequenceId does not match previous consequenceId');
  }
  if (!normalizeText(scene.inheritedConsequence)) {
    errors.push('inheritedConsequence must not be empty after the first scene');
  } else {
    const previousVisibleState = [
      previousScene.localConsequence,
      previousScene.endFrameContinuity,
    ].filter(Boolean).join(' ');
    if (!sharesMeaning(previousVisibleState, scene.inheritedConsequence, 0.1)) {
      errors.push('inheritedConsequence is unrelated to the previous visible consequence');
    }
  }
  return errors.length === before;
};

const validateTension = (scene, errors) => {
  const before = errors.length;
  const tension = Number(scene?.tensionLevel);
  if (!Number.isFinite(tension) || tension < 0 || tension > 100) {
    errors.push('tensionLevel must be between 0 and 100');
  }

  const tensionCause = normalizeText(scene.tensionCause);
  const semanticSources = [
    scene.semanticCollisionPhysicalization,
    scene.monsterTactic,
    scene.semanticAction,
    scene.localConsequence,
    scene.clue,
    scene.viewerInference,
  ].filter(Boolean).join(' ');
  const genericPatternCount = GENERIC_TENSION_ONLY_PATTERNS
    .filter((pattern) => pattern.test(tensionCause)).length;
  const concreteCause = sharesMeaning(semanticSources, tensionCause, 0.1);

  if (genericPatternCount > 0 && !concreteCause) {
    errors.push('tensionCause is generic and not caused by the semantic collision');
  } else if (tensionCause && !concreteCause) {
    errors.push('tensionCause is unrelated to the semantic consequence');
  }
  return errors.length === before;
};

const validatePromptPropagation = (scene, errors) => {
  const before = errors.length;
  const fluxPrompt = [
    scene.stillPrompt,
    scene.inheritedConsequence,
    scene.semanticCollisionPhysicalization,
    scene.monsterTactic,
    scene.semanticAction,
    scene.offscreenMonsterAction,
    scene.visibleEvidenceOfAgency,
    scene.monsterPresence,
    scene.localConsequence,
  ].filter(Boolean).join(' ');
  const wanPrompt = [
    scene.singleImagePrompt,
    scene.monsterTactic,
    scene.motionCue,
    scene.semanticCollisionPhysicalization,
    scene.semanticAction,
    scene.offscreenMonsterAction,
    scene.visibleEvidenceOfAgency,
    scene.localConsequence,
    scene.endFrameContinuity,
    scene.cameraCue,
  ].filter(Boolean).join(' ');
  const required = [
    scene.semanticCollisionPhysicalization,
    scene.semanticAction,
    scene.localConsequence,
  ].filter(Boolean);
  if (required.some((part) => !sharesMeaning(part, fluxPrompt, 0.1))) {
    errors.push('FLUX prompt does not contain the semantic action core');
  }
  if (required.some((part) => !sharesMeaning(part, wanPrompt, 0.1))) {
    errors.push('WAN prompt does not contain the semantic action core');
  }
  return errors.length === before;
};

export const validateSemanticDrivenScenePlan = ({
  scenePlan = [],
  sourceCueRecords = [],
  strict = true,
} = {}) => {
  const reports = scenePlan.map((scene, sceneIndex) => {
    const cue = sourceCueRecords[sceneIndex];
    const errors = [];
    const warnings = [];
    if (!cue) errors.push('missing structured source cue record');

    const cueIdentityValid = cue ? validateCueIdentity(scene, cue, errors) : false;
    const mandatoryFieldsValid = validateMandatoryFields(scene, errors);
    const derivationValid = validateDerivation(scene, errors);
    const collisionPhysicalizationValid = validatePhysicalization(scene, errors, warnings);
    const consequenceInheritanceValid = validateConsequenceInheritance(
      scenePlan, scene, sceneIndex, errors
    );
    const clueDerivationValid = validateClue(scene, errors);
    const monsterAgencyValid = validatePresence(scene, errors);
    const tensionDerivationValid = validateTension(scene, errors);
    const promptPropagationValid = validatePromptPropagation(scene, errors);

    if (!CONSEQUENCE_FAMILIES.includes(scene?.consequenceFamily)) {
      warnings.push(`consequenceFamily should be one of: ${CONSEQUENCE_FAMILIES.join(', ')}`);
    }

    return {
      sceneIndex,
      anchor: cue?.anchor?.term || '',
      collision: cue?.collision?.term || '',
      valid: errors.length === 0,
      cueIdentityValid,
      mandatoryFieldsValid,
      derivationValid,
      collisionPhysicalizationValid,
      consequenceInheritanceValid,
      clueDerivationValid,
      monsterAgencyValid,
      tensionDerivationValid,
      promptPropagationValid,
      visibleEvidenceOfAgency: normalizeText(scene.visibleEvidenceOfAgency),
      errors,
      warnings,
    };
  });

  if (scenePlan.length !== sourceCueRecords.length) {
    reports.push({
      sceneIndex: -1,
      anchor: '',
      collision: '',
      valid: false,
      cueIdentityValid: false,
      mandatoryFieldsValid: false,
      derivationValid: false,
      collisionPhysicalizationValid: false,
      consequenceInheritanceValid: false,
      clueDerivationValid: false,
      monsterAgencyValid: false,
      tensionDerivationValid: false,
      promptPropagationValid: false,
      visibleEvidenceOfAgency: '',
      errors: [`scene/cue count mismatch: ${scenePlan.length}/${sourceCueRecords.length}`],
      warnings: [],
    });
  }

  const errors = reports.flatMap((report) => report.errors.map((message) => ({
    sceneIndex: report.sceneIndex,
    message,
  })));
  const warnings = reports.flatMap((report) => report.warnings.map((message) => ({
    sceneIndex: report.sceneIndex,
    message,
  })));

  return {
    valid: reports.length > 0 && reports.every((report) => report.valid),
    scenePlan,
    reports,
    errors,
    warnings,
    strict: strict !== false,
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
  detectDecorativeSemanticUse,
  overlapRatio,
  tokenizeMeaningfulWords,
  validateSemanticDrivenScenePlan,
};
