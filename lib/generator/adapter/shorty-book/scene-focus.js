export const VALID_SCENE_FOCUSES = new Set([
  'location',
  'objects',
  'people',
  'trace',
  'monster',
  'mixed',
]);

export const MONSTER_FREE_FOCUSES = new Set([
  'location',
  'objects',
  'people',
  'trace',
]);

export const MONSTER_VISIBLE_FOCUSES = new Set(['monster', 'mixed']);

export const normalizeSceneFocus = (value, fallback = 'location') => {
  const normalized = String(value || '').trim().toLowerCase();
  return VALID_SCENE_FOCUSES.has(normalized) ? normalized : fallback;
};

export const isMonsterExplicitlyAbsent = (scene = {}) => /\b(absent|not visible|unseen|off-screen|offscreen|no monster)\b/i
  .test(String(scene.monsterPresence || '').trim());

export const shouldIncludeMonsterReference = (scene = {}) => {
  const resolvedScene = scene || {};
  const focus = normalizeSceneFocus(resolvedScene.sceneFocus);
  if (isMonsterExplicitlyAbsent(resolvedScene)) {
    return false;
  }
  return MONSTER_VISIBLE_FOCUSES.has(focus);
};

export const needsMonsterIdentitySeed = ({
  scene = {},
  previousScene = {},
} = {}) => (
  shouldIncludeMonsterReference(scene)
  && !shouldIncludeMonsterReference(previousScene)
);

// A video model only animates pixels already in its first frame. Crossing from
// a monster-free scene to a visible monster therefore requires a new FLUX still
// made with the canonical protagonist image.
export const sceneRequiresFreshMonsterFrame = ({
  scene = {},
  previousScene = null,
} = {}) => {
  if (!shouldIncludeMonsterReference(scene)) {
    return false;
  }
  return !previousScene || !shouldIncludeMonsterReference(previousScene);
};

export const mustGenerateFreshCanonicalMonsterFrame = ({
  scene = {},
  previousScene = null,
  sceneIndex = 0,
} = {}) => shouldIncludeMonsterReference(scene)
  && (sceneIndex === 0 || !previousScene || !shouldIncludeMonsterReference(previousScene));

export const enforceMonsterEntryStartFrame = ({
  scene = {},
  previousScene = null,
  sceneIndex = 0,
  alwaysFresh = false,
} = {}) => {
  const mustUseCanonicalFrame = alwaysFresh
    ? shouldIncludeMonsterReference(scene)
    : mustGenerateFreshCanonicalMonsterFrame({ scene, previousScene, sceneIndex });
  if (!mustUseCanonicalFrame) {
    return scene;
  }
  return {
    ...scene,
    startFrameStrategy: 'locationReanchor',
    frameSource: 'newImage',
    freshImage: true,
    useCameraShot: true,
    monsterEntryMode: 'freshCanonicalFlux',
  };
};

const promptMentionsMonster = (value = '') => {
  const withoutExplicitExclusions = String(value)
    .replace(/\b(?:no|without)\s+(?:the\s+)?(?:monster|creature|green figure|plant creature|green monster)\b/gi, '')
    .replace(/\bdo not\s+(?:show|reveal|introduce|include)\s+(?:the\s+)?(?:monster|creature|green figure|plant creature|green monster)\b/gi, '');
  return /\b(monster|creature|green figure|plant creature|green monster)\b/i
    .test(withoutExplicitExclusions);
};

export const validateSceneFocus = (scene = {}, index = 0) => {
  const errors = [];
  const focus = normalizeSceneFocus(scene.sceneFocus, '');
  if (!VALID_SCENE_FOCUSES.has(focus)) {
    return [`Scene ${index + 1}: invalid or missing sceneFocus.`];
  }
  if (MONSTER_FREE_FOCUSES.has(focus)) {
    if (promptMentionsMonster(scene.stillPrompt)) {
      errors.push(`Scene ${index + 1}: monster-free stillPrompt mentions the monster.`);
    }
    if (promptMentionsMonster(scene.videoPrompt)) {
      errors.push(`Scene ${index + 1}: monster-free videoPrompt mentions the monster.`);
    }
  }
  return errors;
};
