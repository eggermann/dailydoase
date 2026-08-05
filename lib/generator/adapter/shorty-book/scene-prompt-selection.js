const cleanPromptText = (value) => String(value || '').trim();

const escapeRegularExpression = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Planner records keep source-language cue identity for validation. Provider
// prompts must instead use the paired English rendering, even if the model
// repeats the original token inside otherwise English prose.
export const translateSemanticTermsForProductionPrompt = (value, scenePlanEntry = {}) => {
  let translated = cleanPromptText(value);
  const replacements = [
    [scenePlanEntry?.semanticAnchor, scenePlanEntry?.semanticAnchorEnglish],
    [scenePlanEntry?.semanticCollision, scenePlanEntry?.semanticCollisionEnglish],
  ]
    .map(([source, english]) => [cleanPromptText(source), cleanPromptText(english)])
    .filter(([source, english]) => source && english && source.toLocaleLowerCase() !== english.toLocaleLowerCase())
    .sort(([left], [right]) => right.length - left.length);

  for (const [source, english] of replacements) {
    const termPattern = new RegExp(
      `(^|[^\\p{L}\\p{N}])${escapeRegularExpression(source)}(?=$|[^\\p{L}\\p{N}])`,
      'giu'
    );
    translated = translated.replace(termPattern, (_, prefix) => `${prefix}${english}`);
  }

  return translated;
};

// The planner's narrative fields are generated from the live Semantic Stream.
// Carry them into both image and WAN prompts so a word collision determines
// agency, consequence, and viewpoint instead of only changing creature mood.
const withStoryCausality = (prompt, scenePlanEntry = {}) => {
  const causalStory = [
    scenePlanEntry?.inheritedConsequence,
    scenePlanEntry?.semanticCollisionPhysicalization,
    scenePlanEntry?.storyCause,
    scenePlanEntry?.monsterInterpretation,
    scenePlanEntry?.monsterIntent,
    scenePlanEntry?.monsterTactic,
    scenePlanEntry?.semanticAction,
    scenePlanEntry?.offscreenMonsterAction,
    scenePlanEntry?.visibleEvidenceOfAgency,
    scenePlanEntry?.monsterPresence,
    scenePlanEntry?.localConsequence,
    scenePlanEntry?.viewpoint,
  ].map(cleanPromptText).filter(Boolean);
  return translateSemanticTermsForProductionPrompt(
    [cleanPromptText(prompt), ...causalStory].filter(Boolean).join(' '),
    scenePlanEntry
  );
};

// WAN must receive the planner's exact word-driven physical and camera action.
// Keeping these as explicit final clauses prevents generic model motion from
// replacing the scene-specific plan.
const withPlannedMotion = (prompt, scenePlanEntry = {}) => {
  const physicalMotion = cleanPromptText(scenePlanEntry?.motionCue);
  const cameraMotion = cleanPromptText(scenePlanEntry?.cameraCue);

  return translateSemanticTermsForProductionPrompt([
    cleanPromptText(prompt),
    cleanPromptText(scenePlanEntry?.monsterTactic),
    physicalMotion ? `Physical motion: ${physicalMotion}` : '',
    cleanPromptText(scenePlanEntry?.semanticCollisionPhysicalization),
    cleanPromptText(scenePlanEntry?.semanticAction),
    cleanPromptText(scenePlanEntry?.offscreenMonsterAction),
    cleanPromptText(scenePlanEntry?.visibleEvidenceOfAgency),
    cleanPromptText(scenePlanEntry?.localConsequence),
    cleanPromptText(scenePlanEntry?.endFrameContinuity),
    cameraMotion ? `Camera behavior: ${cameraMotion}` : '',
  ].filter(Boolean).join(' '), scenePlanEntry);
};

// FLUX needs a still-image description. Motion prompts remain fallbacks only
// for older scene plans that do not yet provide stillPrompt.
export const selectFluxStillDirection = ({
  scenePlanEntry = {},
  sceneContext = {},
  primarySourceCue = '',
  openingPromptSource = '',
  fallbackPrompt = '',
} = {}) => {
  const stillPrompt = cleanPromptText(scenePlanEntry?.stillPrompt);
  if (stillPrompt) {
    return withStoryCausality(stillPrompt, scenePlanEntry);
  }

  const imageDescription = cleanPromptText(scenePlanEntry?.imageDescription);
  if (imageDescription) {
    return withStoryCausality(imageDescription, scenePlanEntry);
  }

  const legacySingleImagePrompt = cleanPromptText(scenePlanEntry?.singleImagePrompt);
  if (legacySingleImagePrompt) {
    return withStoryCausality(legacySingleImagePrompt, scenePlanEntry);
  }

  const legacyVideoPrompt = cleanPromptText(scenePlanEntry?.videoPrompt);
  if (legacyVideoPrompt) {
    return withStoryCausality(legacyVideoPrompt, scenePlanEntry);
  }

  const semanticCue = cleanPromptText(primarySourceCue);
  if (semanticCue) {
    return withStoryCausality(semanticCue, scenePlanEntry);
  }

  const authoredOpening = cleanPromptText(openingPromptSource);
  if (authoredOpening) {
    return withStoryCausality(authoredOpening, scenePlanEntry);
  }

  const sceneContextBeat = cleanPromptText(sceneContext?.storyBeat);
  if (sceneContextBeat) {
    return withStoryCausality(sceneContextBeat, scenePlanEntry);
  }

  const sceneTitle = cleanPromptText(scenePlanEntry?.title);
  if (sceneTitle) {
    return withStoryCausality(sceneTitle, scenePlanEntry);
  }

  return withStoryCausality(fallbackPrompt, scenePlanEntry);
};

export const selectSceneStoryBeat = ({
  scenePlanEntry = {},
  sceneContext = {},
  primarySourceCue = '',
  openingPromptSource = '',
  selectedPrompt = '',
} = {}) => {
  const plannedStoryBeat = cleanPromptText(scenePlanEntry?.storyBeat);
  if (plannedStoryBeat) {
    return plannedStoryBeat;
  }

  const plannedBeat = cleanPromptText(scenePlanEntry?.beat);
  if (plannedBeat) {
    return plannedBeat;
  }

  const sceneContextBeat = cleanPromptText(sceneContext?.storyBeat);
  if (sceneContextBeat) {
    return sceneContextBeat;
  }

  const semanticCue = cleanPromptText(primarySourceCue);
  if (semanticCue) {
    return semanticCue;
  }

  const authoredOpening = cleanPromptText(openingPromptSource);
  if (authoredOpening) {
    return authoredOpening;
  }

  return cleanPromptText(selectedPrompt);
};

// A converted first/last-frame scene keeps its transition prompt. A native
// single-image scene uses its WAN prompt directly.
export const selectWanMotionDirection = ({
  scenePlanEntry = {},
  wasTransitionBeat = false,
  fallbackPrompt = '',
} = {}) => {
  const videoPrompt = cleanPromptText(scenePlanEntry?.videoPrompt);
  const singleImagePrompt = cleanPromptText(scenePlanEntry?.singleImagePrompt);

  if (wasTransitionBeat && videoPrompt) {
    return withPlannedMotion(videoPrompt, scenePlanEntry);
  }

  if (singleImagePrompt) {
    return withPlannedMotion(singleImagePrompt, scenePlanEntry);
  }

  if (videoPrompt) {
    return withPlannedMotion(videoPrompt, scenePlanEntry);
  }

  return withPlannedMotion(fallbackPrompt, scenePlanEntry);
};

export default {
  selectFluxStillDirection,
  selectSceneStoryBeat,
  selectWanMotionDirection,
};
