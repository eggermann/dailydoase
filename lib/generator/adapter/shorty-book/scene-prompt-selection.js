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

export const buildFluxPrompt = ({
  scene = {},
  locationRule = '',
  creatureRule = '',
} = {}) => [
  cleanPromptText(locationRule),
  cleanPromptText(creatureRule),
  cleanPromptText(scene.stillPrompt),
  scene.consequence ? `Visible result: ${cleanPromptText(scene.consequence)}` : '',
  scene.monsterPresence ? `Monster presence: ${cleanPromptText(scene.monsterPresence)}` : '',
  'Create one realistic cinematic photograph. No readable text or logos.',
].filter(Boolean).join(' ');

export const buildWanPrompt = ({ scene = {} } = {}) => [
  cleanPromptText(scene.videoPrompt),
  scene.cameraCue ? `Camera: ${cleanPromptText(scene.cameraCue)}.` : '',
  scene.consequence ? `End with this readable result: ${cleanPromptText(scene.consequence)}` : '',
].filter(Boolean).join(' ');

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
    return translateSemanticTermsForProductionPrompt(stillPrompt, scenePlanEntry);
  }

  const imageDescription = cleanPromptText(scenePlanEntry?.imageDescription);
  if (imageDescription) {
    return translateSemanticTermsForProductionPrompt(imageDescription, scenePlanEntry);
  }

  const legacySingleImagePrompt = cleanPromptText(scenePlanEntry?.singleImagePrompt);
  if (legacySingleImagePrompt) {
    return translateSemanticTermsForProductionPrompt(legacySingleImagePrompt, scenePlanEntry);
  }

  const legacyVideoPrompt = cleanPromptText(scenePlanEntry?.videoPrompt);
  if (legacyVideoPrompt) {
    return translateSemanticTermsForProductionPrompt(legacyVideoPrompt, scenePlanEntry);
  }

  const semanticCue = cleanPromptText(primarySourceCue);
  if (semanticCue) {
    return translateSemanticTermsForProductionPrompt(semanticCue, scenePlanEntry);
  }

  const authoredOpening = cleanPromptText(openingPromptSource);
  if (authoredOpening) {
    return translateSemanticTermsForProductionPrompt(authoredOpening, scenePlanEntry);
  }

  const sceneContextBeat = cleanPromptText(sceneContext?.storyBeat);
  if (sceneContextBeat) {
    return translateSemanticTermsForProductionPrompt(sceneContextBeat, scenePlanEntry);
  }

  const sceneTitle = cleanPromptText(scenePlanEntry?.title);
  if (sceneTitle) {
    return translateSemanticTermsForProductionPrompt(sceneTitle, scenePlanEntry);
  }

  return translateSemanticTermsForProductionPrompt(fallbackPrompt, scenePlanEntry);
};

export const selectSceneStoryBeat = ({
  scenePlanEntry = {},
  sceneContext = {},
  primarySourceCue = '',
  openingPromptSource = '',
  selectedPrompt = '',
} = {}) => {
  const plannedStoryBeat = cleanPromptText(scenePlanEntry?.event || scenePlanEntry?.storyBeat);
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

  const selectedVideoPrompt = wasTransitionBeat || scenePlanEntry?.event || !singleImagePrompt
    ? videoPrompt
    : singleImagePrompt;

  if (selectedVideoPrompt) {
    return translateSemanticTermsForProductionPrompt(buildWanPrompt({
      scene: { ...scenePlanEntry, videoPrompt: selectedVideoPrompt },
    }), scenePlanEntry);
  }

  return translateSemanticTermsForProductionPrompt(buildWanPrompt({
    scene: { ...scenePlanEntry, videoPrompt: fallbackPrompt },
  }), scenePlanEntry);
};

export default {
  selectFluxStillDirection,
  selectSceneStoryBeat,
  selectWanMotionDirection,
  buildFluxPrompt,
  buildWanPrompt,
};
