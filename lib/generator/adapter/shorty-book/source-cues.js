import promptCreator from '../../../prompt-creator.js';
import {
  isReferenceImageActorMode,
} from './LiveContextOrchestrator-config.js';

const normalizeString = (value) => (typeof value === 'string' ? value.trim() : '');

export const normalizeSourceCueMode = (value, fallback = 'mixed') => {
  const normalized = normalizeString(value).toLowerCase();
  return normalized === 'collision' ? 'collision' : fallback;
};

export const resolveSourceCueMixType = ({
  configMode = 'generated',
  requestedMixType = 'random',
} = {}) => (isReferenceImageActorMode(configMode)
  ? 'sequential'
  : requestedMixType);

export const resolveStaticSourceCues = (sceneCount, staticSourceCues = []) => {
  const cues = Array.isArray(staticSourceCues) && staticSourceCues.length > 0
    ? staticSourceCues
    : ['documentary opening', 'detail shot', 'human scene', 'reflective ending'];
  return Array.from({ length: sceneCount }, (_, index) => cues[index % cues.length]);
};

const resolveStreamLabel = (stream, index) => normalizeString(stream?.startWord || stream?.word)
  || `stream-${index + 1}`;

const putSceneAnchorFirst = (streams, sceneIndex) => {
  const anchorIndex = sceneIndex % streams.length;
  const anchorStream = streams[anchorIndex];
  const collisionStreams = streams.filter((_, index) => index !== anchorIndex);
  return [anchorStream, ...collisionStreams];
};

const readNextSemanticAssociations = async (orderedStreams, promptCreatorImpl) => {
  const associations = [];

  for (const stream of orderedStreams) {
    const association = await promptCreatorImpl.default(
      [stream],
      { streamMixType: 'sequential' }
    );
    associations.push(normalizeString(association));
  }

  return associations;
};

const describeSemanticCollision = ({ orderedStreams, associations, allStreams }) => {
  const streamLabels = orderedStreams.map((stream, index) => {
    const originalIndex = allStreams.indexOf(stream);
    return resolveStreamLabel(stream, originalIndex >= 0 ? originalIndex : index);
  });
  const anchorDescription = associations[0] || streamLabels[0];
  const collisionDescriptions = associations.slice(1).map((association, index) => {
    const collisionLabel = streamLabels[index + 1];
    const collisionDescription = association || collisionLabel;
    const collisionLetter = String.fromCharCode(65 + index);
    return `Collision ${collisionLetter} (${collisionLabel}): ${collisionDescription}.`;
  });

  return [
    `Anchor (${streamLabels[0]}): ${anchorDescription}.`,
    ...collisionDescriptions,
    'Collision rule: keep the terms in productive conflict; do not explain or harmonize them. Make their contradiction physically transform bodies, objects, light, architecture, or human behavior inside the scene.',
  ].join(' ');
};

export const buildCollisionSourceCues = async ({
  streams = [],
  sceneCount = 1,
  promptCreatorImpl = promptCreator,
} = {}) => {
  const activeStreams = streams.filter(Boolean);
  if (activeStreams.length === 0) {
    return Array.from({ length: sceneCount }, () => '');
  }

  const sourceCues = [];
  for (let sceneIndex = 0; sceneIndex < sceneCount; sceneIndex += 1) {
    const orderedStreams = putSceneAnchorFirst(activeStreams, sceneIndex);
    const associations = await readNextSemanticAssociations(
      orderedStreams,
      promptCreatorImpl
    );
    const sourceCue = describeSemanticCollision({
      orderedStreams,
      associations,
      allStreams: activeStreams,
    });
    sourceCues.push(sourceCue);
  }

  return sourceCues;
};

export const buildSourceCues = async ({
  streams = [],
  sceneCount = 1,
  configMode = 'generated',
  staticTestMode = false,
  staticSourceCues = [],
  requestedMixType = 'random',
  cueMode = 'mixed',
  promptCreatorImpl = promptCreator,
} = {}) => {
  if (staticTestMode) {
    return resolveStaticSourceCues(sceneCount, staticSourceCues);
  }

  if (normalizeSourceCueMode(cueMode) === 'collision') {
    return buildCollisionSourceCues({ streams, sceneCount, promptCreatorImpl });
  }

  const streamMixType = resolveSourceCueMixType({
    configMode,
    requestedMixType,
  });
  const sourceCues = [];

  for (let index = 0; index < sceneCount; index += 1) {
    sourceCues.push(await promptCreatorImpl.default(streams, { streamMixType }));
  }

  return sourceCues;
};

export default {
  buildSourceCues,
  buildCollisionSourceCues,
  normalizeSourceCueMode,
  resolveSourceCueMixType,
  resolveStaticSourceCues,
};
