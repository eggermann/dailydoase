const cleanPromptText = (value) => String(value || '').trim();

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
    return stillPrompt;
  }

  const imageDescription = cleanPromptText(scenePlanEntry?.imageDescription);
  if (imageDescription) {
    return imageDescription;
  }

  const legacySingleImagePrompt = cleanPromptText(scenePlanEntry?.singleImagePrompt);
  if (legacySingleImagePrompt) {
    return legacySingleImagePrompt;
  }

  const legacyVideoPrompt = cleanPromptText(scenePlanEntry?.videoPrompt);
  if (legacyVideoPrompt) {
    return legacyVideoPrompt;
  }

  const semanticCue = cleanPromptText(primarySourceCue);
  if (semanticCue) {
    return semanticCue;
  }

  const authoredOpening = cleanPromptText(openingPromptSource);
  if (authoredOpening) {
    return authoredOpening;
  }

  const sceneContextBeat = cleanPromptText(sceneContext?.storyBeat);
  if (sceneContextBeat) {
    return sceneContextBeat;
  }

  const sceneTitle = cleanPromptText(scenePlanEntry?.title);
  if (sceneTitle) {
    return sceneTitle;
  }

  return cleanPromptText(fallbackPrompt);
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
    return videoPrompt;
  }

  if (singleImagePrompt) {
    return singleImagePrompt;
  }

  if (videoPrompt) {
    return videoPrompt;
  }

  return cleanPromptText(fallbackPrompt);
};

export default {
  selectFluxStillDirection,
  selectSceneStoryBeat,
  selectWanMotionDirection,
};
