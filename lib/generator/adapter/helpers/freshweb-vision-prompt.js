import { compactScenePrompt } from './scene-generator.js';
import {
  extractVisionStoryContext,
  normalizeVisionText,
  summarizeVisionAnchor,
  summarizeVisionActorIdentity,
  summarizeVisionActors,
  summarizeVisionLocation,
  summarizeVisionSetup,
} from './frame-vision.js';

const buildSceneAnchorSummary = ({ stillPrompt, imageDescription } = {}) => {
  const visibleAnchors = compactScenePrompt(normalizeVisionText(imageDescription), 1, 28);
  const destinationSetup = compactScenePrompt(normalizeVisionText(stillPrompt), 1, 24);

  return {
    visibleAnchors,
    destinationSetup,
  };
};

const buildVisionVisibleState = (storyContext = {}, anchor = '', maxWords = 18) => {
  const summary = compactScenePrompt(
    normalizeVisionText(
      storyContext?.description
      || storyContext?.setupSummary
      || anchor
    ),
    1,
    maxWords
  ).replace(/[.]+$/g, '').trim();

  return summary;
};

const joinNaturalList = (values = []) => {
  const items = values.filter(Boolean);
  if (items.length === 0) {
    return '';
  }
  if (items.length === 1) {
    return items[0];
  }
  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
};

const stripLeadingIn = (value) => String(value || '').replace(/^in\s+/i, '').trim();

const buildContinuityLead = ({
  storyContext,
  actorsSummary,
  locationSummary,
  anchor,
} = {}) => {
  const labels = [];
  if (actorsSummary) {
    labels.push(storyContext?.actors?.length === 1 ? 'same actor' : 'same actors');
  }
  if (locationSummary) {
    labels.push('same setting');
  }
  if (storyContext?.setupSummary || locationSummary || actorsSummary) {
    labels.push('same shot family');
  }

  if (labels.length === 0) {
    if (anchor) {
      return 'Keep continuity with the same visible subject and setting.';
    }
    return '';
  }

  const details = [];
  if (actorsSummary) {
    details.push(actorsSummary);
  }
  if (locationSummary) {
    details.push(`in ${stripLeadingIn(locationSummary)}`);
  }
  const compactDetails = compactScenePrompt(details.join(' '), 1, 18);
  const labelText = joinNaturalList(labels);

  return compactDetails
    ? `Keep continuity with the ${labelText}: ${compactDetails}.`
    : `Keep continuity with the ${labelText}.`;
};

const buildStaticLocationLead = ({
  locationSummary,
  anchor,
} = {}) => {
  const lockedLocation = stripLeadingIn(locationSummary || '');
  if (lockedLocation) {
    return `Keep the location fixed in ${lockedLocation}; let the beat play inside this same space.`;
  }
  if (anchor) {
    return 'Keep the location fixed in the visible setting; let the beat play inside this same space.';
  }
  return '';
};

const buildLabeledSentence = (label, value, maxWords = 18) => {
  const normalized = compactScenePrompt(normalizeVisionText(value), 1, maxWords);
  if (!normalized) {
    return '';
  }
  return `${label} ${normalized.replace(/[.]+$/g, '').trim()}.`;
};

const toCompactPromptFragment = (value, maxWords = 18) => compactScenePrompt(
  normalizeVisionText(value),
  1,
  maxWords
).replace(/[.]+$/g, '').trim();

const collapseLeadingSame = (value) => String(value || '')
  .replace(/^the same\s+/i, 'the ')
  .replace(/^same\s+/i, '')
  .trim();

const buildContinuityConstraint = ({
  continuityText,
  maxWords = 22,
} = {}) => {
  const normalized = toCompactPromptFragment(continuityText, maxWords);
  if (!normalized) {
    return '';
  }
  return `Continuity: ${normalized}.`;
};

const buildCameraContinuityParts = ({
  actorCount = 0,
  actorsSummary,
  locationSummary,
  anchor,
} = {}) => {
  const actorText = collapseLeadingSame(toCompactPromptFragment(actorsSummary, 18));
  const locationText = collapseLeadingSame(stripLeadingIn(toCompactPromptFragment(locationSummary, 12)));
  const parts = [];

  if (actorText) {
    parts.push(`${actorCount > 1 ? 'Same actors:' : 'Same actor:'} ${actorText}.`);
  }
  if (locationText) {
    parts.push(`Same location: ${locationText}.`);
  }
  if (parts.length > 0) {
    return parts;
  }
  if (anchor) {
    return ['Same visible subject and setting.'];
  }
  return [];
};

const buildCameraTimingSentence = ({
  durationSeconds,
  useSingleImage = false,
} = {}) => {
  const duration = Number(durationSeconds);
  if (!Number.isFinite(duration) || duration <= 0) {
    return '';
  }

  return useSingleImage
    ? `Timing: one ${duration}-second held shot with one continuous motion arc.`
    : `Timing: one ${duration}-second transition with one clear start-to-end arc.`;
};

const buildEndContinuityLead = ({
  storyContext,
  actorsSummary,
  locationSummary,
  anchor,
} = {}) => {
  const labels = [];
  if (actorsSummary) {
    labels.push(storyContext?.actors?.length === 1 ? 'same actor' : 'same actors');
  }
  if (locationSummary) {
    labels.push('same setting');
  }

  if (labels.length > 0) {
    return `By the end, the ${joinNaturalList(labels)} should still read clearly.`;
  }
  if (anchor) {
    return 'By the end, the same subject and setting should still read clearly.';
  }
  return '';
};

const buildDurationGuidance = ({
  durationSeconds,
  useSingleImage = false,
} = {}) => {
  const duration = Number(durationSeconds);
  if (!Number.isFinite(duration) || duration <= 0) {
    return '';
  }

  const durationLabel = `${duration}-second`;
  if (useSingleImage) {
    if (duration <= 2) {
      return `Fit the action to a ${durationLabel} held shot: play one immediate readable beat and avoid a frozen hold.`;
    }
    if (duration <= 4) {
      return `Fit the action to a ${durationLabel} held shot: show one clear action, one expression change, and one readable camera move.`;
    }
    return `Fit the action to a ${durationLabel} held shot: keep one coherent motion progression, evolving expression, and no extra drift.`;
  }

  if (duration <= 2) {
    return `Fit the action to a ${durationLabel} transition: move directly to the destination with one immediate readable change.`;
  }
  if (duration <= 4) {
    return `Fit the action to a ${durationLabel} transition: keep one clear movement arc and one simple camera move.`;
  }
  return `Fit the action to a ${durationLabel} transition: allow one smooth progression from start to destination without unrelated sub-beats.`;
};

export const DEFAULT_FRESHWEB_VISION_PROMPT = 'Describe only the visible shot for continuity. Return concise labeled lines for Subject, Setting, Framing, Lighting, Location, Actors, Description, and what should stay consistent for the next video shot. In Actors, list each visible actor with a short description.';

export const resolveFreshwebVisionPrompt = (...values) => {
  const match = values.find((value) => typeof value === 'string' && value.trim().length > 0);
  return match || DEFAULT_FRESHWEB_VISION_PROMPT;
};

export const resolveFreshwebVisionProviders = (...values) => values
  .find((value) => typeof value === 'string')
  ?.split(',')
  .map((value) => value.trim())
  .filter(Boolean) || [];

export const buildVisionAwarePrompt = ({
  basePrompt,
  startVision,
  endVision,
  durationSeconds,
  useSingleImage = false,
  anchorBuilder = summarizeVisionAnchor,
} = {}) => {
  const prompt = normalizeVisionText(basePrompt);
  const toAnchor = typeof anchorBuilder === 'function' ? anchorBuilder : summarizeVisionAnchor;
  const startStoryContext = extractVisionStoryContext(startVision);
  const endStoryContext = extractVisionStoryContext(endVision);
  const startAnchor = toAnchor(startVision);
  const endAnchor = toAnchor(endVision);
  const startActors = summarizeVisionActorIdentity(startStoryContext.actors)
    || summarizeVisionActors(startStoryContext.actors);
  const endActors = summarizeVisionActorIdentity(endStoryContext.actors)
    || summarizeVisionActors(endStoryContext.actors);
  const startLocation = summarizeVisionLocation(startStoryContext.location);
  const endLocation = summarizeVisionLocation(endStoryContext.location);
  const startSetup = summarizeVisionSetup(startStoryContext);
  const startContinuity = normalizeVisionText(startStoryContext.continuity || '');
  const durationGuidance = buildDurationGuidance({
    durationSeconds,
    useSingleImage,
  });

  if (!prompt) {
    return compactScenePrompt([
      startLocation && `Location: ${startLocation}.`,
      startActors && `Actors: ${startActors}.`,
      startSetup && `Setup: ${startSetup}.`,
      durationGuidance,
      !useSingleImage && endLocation
        ? `Destination location: ${endLocation}.`
        : '',
      !useSingleImage && endActors
        ? `Destination actors: ${endActors}.`
        : '',
      !useSingleImage && endAnchor && !(endStoryContext.location || endActors)
        ? `Destination anchor: ${endAnchor}.`
        : '',
    ].filter(Boolean).join(' '), 5, 90);
  }

  const additions = [];
  const continuityLead = buildContinuityLead({
    storyContext: startStoryContext,
    actorsSummary: startActors,
    locationSummary: startLocation,
    anchor: startAnchor,
  });
  if (continuityLead) {
    additions.push(continuityLead);
  }
  const staticLocationLead = buildStaticLocationLead({
    locationSummary: startLocation,
    anchor: startAnchor,
  });
  if (staticLocationLead) {
    additions.push(staticLocationLead);
  }
  if (durationGuidance) {
    additions.push(durationGuidance);
  }
  const continuityConstraint = buildContinuityConstraint({
    continuityText: startContinuity,
    maxWords: 24,
  });
  if (continuityConstraint) {
    additions.push(continuityConstraint);
  }
  const endContinuityLead = !useSingleImage
    ? buildEndContinuityLead({
        storyContext: endStoryContext,
        actorsSummary: endActors,
        locationSummary: endLocation,
        anchor: endAnchor,
      })
    : '';
  if (endContinuityLead) {
    additions.push(endContinuityLead);
  }

  if (additions.length === 0) {
    return compactScenePrompt(prompt);
  }

  return compactScenePrompt(`${prompt} ${additions.join(' ')}`, 6, 120);
};

export const buildCameraGroundedPrompt = ({
  basePrompt,
  storyBeat,
  stillPrompt,
  imageDescription,
  durationSeconds,
  motionCue,
  cameraCue,
  startVision,
  endVision,
  useSingleImage = false,
  preferDynamicSingleImage = false,
} = {}) => {
  const startStoryContext = extractVisionStoryContext(startVision);
  const endStoryContext = extractVisionStoryContext(endVision);
  const startAnchor = startStoryContext.anchor || summarizeVisionAnchor(startVision);
  const endAnchor = endStoryContext.anchor || summarizeVisionAnchor(endVision);
  const startActors = summarizeVisionActorIdentity(startStoryContext.actors)
    || summarizeVisionActors(startStoryContext.actors);
  const endActors = summarizeVisionActorIdentity(endStoryContext.actors)
    || summarizeVisionActors(endStoryContext.actors);
  const startLocation = summarizeVisionLocation(startStoryContext.location);
  const endLocation = summarizeVisionLocation(endStoryContext.location);
  const startContinuity = normalizeVisionText(startStoryContext.continuity || '');
  const {
    visibleAnchors,
    destinationSetup,
  } = buildSceneAnchorSummary({ stillPrompt, imageDescription });
  const startVisibleState = buildVisionVisibleState(startStoryContext, startAnchor, 18);
  const endVisibleState = buildVisionVisibleState(endStoryContext, endAnchor, 18);
  const timingSentence = buildCameraTimingSentence({
    durationSeconds,
    useSingleImage,
  });
  const durationGuidance = buildDurationGuidance({
    durationSeconds,
    useSingleImage,
  });
  const beatText = compactScenePrompt(
    normalizeVisionText(storyBeat) || normalizeVisionText(basePrompt),
    1,
    18
  );
  const motion = normalizeVisionText(motionCue);
  const camera = normalizeVisionText(cameraCue);

  const parts = [];
  const continuityParts = buildCameraContinuityParts({
    actorCount: startStoryContext.actors?.length || 0,
    actorsSummary: startActors,
    locationSummary: startLocation,
    anchor: startAnchor,
  });
  if (continuityParts.length > 0) {
    parts.push(...continuityParts);
  }
  if (beatText) {
    parts.push(buildLabeledSentence('Beat:', beatText, 18));
  }
  if (timingSentence) {
    parts.push(timingSentence);
  }
  if (durationGuidance) {
    parts.push(durationGuidance);
  }
  const continuityConstraint = buildContinuityConstraint({
    continuityText: startContinuity,
  });
  if (continuityConstraint) {
    parts.push(continuityConstraint);
  }
  if (motion) {
    parts.push(buildLabeledSentence('Motion:', motion, 18));
  }
  if (camera) {
    parts.push(buildLabeledSentence('Camera:', camera, 16));
  }
  if (useSingleImage && !motion && !camera) {
    parts.push(
      preferDynamicSingleImage
        ? 'Play the scene change inside one continuous moving shot, not as a frozen still.'
        : 'Keep the shot visibly alive and avoid a frozen hold.'
    );
  }
  const readableState = startVisibleState || visibleAnchors;
  if (readableState) {
    parts.push(buildLabeledSentence('Keep readable:', readableState, 18));
  }
  const resolvedHoldState = useSingleImage
    ? ''
    : (endVisibleState || destinationSetup);
  if (resolvedHoldState) {
    parts.push(buildLabeledSentence(
      useSingleImage ? 'Hold state:' : 'End state:',
      resolvedHoldState,
      18
    ));
  }
  const endContinuityLead = !useSingleImage
    ? buildEndContinuityLead({
        storyContext: endStoryContext,
        actorsSummary: endActors,
        locationSummary: endLocation,
        anchor: endAnchor,
      })
    : '';
  if (endContinuityLead) {
    parts.push(endContinuityLead);
  }

  return compactScenePrompt(parts.join(' '), 9, 105);
};

export default {
  DEFAULT_FRESHWEB_VISION_PROMPT,
  resolveFreshwebVisionPrompt,
  resolveFreshwebVisionProviders,
  buildVisionAwarePrompt,
  buildCameraGroundedPrompt,
};
