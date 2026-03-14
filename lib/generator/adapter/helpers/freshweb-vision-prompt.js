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
      return `Fit the action to a ${durationLabel} held shot: play one immediate readable beat with visible subject movement and one clear camera accent, and avoid a frozen portrait hold.`;
    }
    if (duration <= 4) {
      return `Fit the action to a ${durationLabel} held shot: show one clear physical action, one expressive shift, and one readable camera move without drifting into unrelated beats.`;
    }
    return `Fit the action to a ${durationLabel} held shot: sustain visible body motion, evolving expression, and a continuous camera move inside one coherent progression.`;
  }

  if (duration <= 2) {
    return `Fit the action to a ${durationLabel} transition: move directly from the current frame to the destination with one immediate readable change and no extra beats.`;
  }
  if (duration <= 4) {
    return `Fit the action to a ${durationLabel} transition: keep one clear movement arc from start to destination and one simple camera move.`;
  }
  return `Fit the action to a ${durationLabel} transition: allow one smooth progression from start state to destination without adding unrelated sub-beats.`;
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
  const startSetup = summarizeVisionSetup(startStoryContext);
  const {
    visibleAnchors,
    destinationSetup,
  } = buildSceneAnchorSummary({ stillPrompt, imageDescription });
  const durationGuidance = buildDurationGuidance({
    durationSeconds,
    useSingleImage,
  });
  const planned = compactScenePrompt(
    [normalizeVisionText(storyBeat), normalizeVisionText(basePrompt)].filter(Boolean).join(' '),
    2,
    40
  );
  const motion = normalizeVisionText(motionCue);
  const camera = normalizeVisionText(cameraCue);

  const parts = [];
  if (planned) {
    parts.push(`Follow this planned beat inside the shot: ${planned}`);
  }
  if (durationGuidance) {
    parts.push(durationGuidance);
  }
  if (useSingleImage) {
    parts.push(
      preferDynamicSingleImage
        ? 'Translate the scene change into one continuous shot with visible body movement and a readable camera move; do not let it play like a frozen still.'
        : 'Avoid a frozen hold: keep visible subject motion and at least one readable camera move when the shot allows it.'
    );
  }
  parts.push('Only describe believable motion, expression changes, and camera movement inside this shot.');
  if (motion) {
    parts.push(motion);
  }
  if (camera) {
    parts.push(camera);
  }
  const continuityLead = buildContinuityLead({
    storyContext: startStoryContext,
    actorsSummary: startActors,
    locationSummary: startLocation,
    anchor: startAnchor,
  });
  if (continuityLead) {
    parts.push(continuityLead);
  }
  const staticLocationLead = buildStaticLocationLead({
    locationSummary: startLocation,
    anchor: startAnchor,
  });
  if (staticLocationLead) {
    parts.push(staticLocationLead);
  }
  if (visibleAnchors) {
    parts.push(`If already visible, keep these anchors readable: ${visibleAnchors}.`);
  }
  if (destinationSetup) {
    parts.push(
      useSingleImage
        ? `Let this held shot settle into: ${destinationSetup}.`
        : `Drive the shot toward: ${destinationSetup}.`
    );
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

  return compactScenePrompt(parts.join(' '), 14, 230);
};

export default {
  DEFAULT_FRESHWEB_VISION_PROMPT,
  resolveFreshwebVisionPrompt,
  resolveFreshwebVisionProviders,
  buildVisionAwarePrompt,
  buildCameraGroundedPrompt,
};
