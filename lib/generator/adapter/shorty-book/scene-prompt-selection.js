const cleanPromptText = (value) => String(value || '').trim();

// The planner's narrative fields are generated from the live Semantic Stream.
// Carry them into both image and WAN prompts so a word collision determines
// agency, consequence, and viewpoint instead of only changing creature mood.
const withStoryCausality = (prompt, scenePlanEntry = {}) => {
  const causalStory = [
    scenePlanEntry?.storyCause,
    scenePlanEntry?.monsterIntent,
    scenePlanEntry?.roomConsequence,
    scenePlanEntry?.semanticAction,
    scenePlanEntry?.monsterPresence,
    scenePlanEntry?.viewpoint,
  ].map(cleanPromptText).filter(Boolean);
  return [cleanPromptText(prompt), ...causalStory].filter(Boolean).join(' ');
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
    return withStoryCausality(videoPrompt, scenePlanEntry);
  }

  if (singleImagePrompt) {
    return withStoryCausality(singleImagePrompt, scenePlanEntry);
  }

  if (videoPrompt) {
    return withStoryCausality(videoPrompt, scenePlanEntry);
  }

  return withStoryCausality(fallbackPrompt, scenePlanEntry);
};

export default {
  selectFluxStillDirection,
  selectSceneStoryBeat,
  selectWanMotionDirection,
};
