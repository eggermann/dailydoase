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

export const isMonsterExplicitlyAbsent = (scene = {}) => {
  const presence = String(scene.monsterPresence || '').trim();
  const remainingVisibleEvidence = presence
    .replace(/\b(?:not visible|unseen|off-screen|offscreen|off-frame|out of (?:the )?frame|outside (?:the )?frame|not in (?:the )?frame|no monster|without (?:the )?monster|absent|none)\b/gi, ' ');
  if (/\b(?:visible|partial|revealed?|head|eyes?|face|body|trunk|vine|reflection|silhouette|sculpture)\b/i
    .test(remainingVisibleEvidence)) {
    return false;
  }
  return /\b(absent|none|not visible|unseen|off-screen|offscreen|off-frame|out of (?:the )?frame|outside (?:the )?frame|not in (?:the )?frame|no monster|without (?:the )?monster)\b/i
    .test(presence);
};

const promptMentionsMonster = (value = '') => {
  const withoutExplicitExclusions = String(value)
    .replace(/\b(?:no|without)\s+(?:the\s+)?(?:monster|creature|green figure|plant creature|green monster|protagonist)\b/gi, '')
    .replace(/\bdo not\s+(?:show|reveal|introduce|include)\s+(?:the\s+)?(?:monster|creature|green figure|plant creature|green monster|protagonist)\b/gi, '');
  return /\b(monster|creature|green figure|plant creature|green monster|green warehouse organism|protagonist)\b/i
    .test(withoutExplicitExclusions);
};

export const shouldIncludeMonsterReference = (scene = {}) => {
  const resolvedScene = scene || {};
  const focus = normalizeSceneFocus(resolvedScene.sceneFocus);
  if (isMonsterExplicitlyAbsent(resolvedScene)) {
    return false;
  }
  if (MONSTER_VISIBLE_FOCUSES.has(focus)) {
    return true;
  }

  return [
    resolvedScene.monsterPresence,
    resolvedScene.stillPrompt,
    resolvedScene.videoPrompt,
    resolvedScene.event,
  ].some(promptMentionsMonster);
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

export const validateSceneFocus = (scene = {}, index = 0) => {
  const focus = normalizeSceneFocus(scene.sceneFocus, '');
  if (!VALID_SCENE_FOCUSES.has(focus)) {
    return [`Scene ${index + 1}: invalid or missing sceneFocus.`];
  }
  return [];
};
