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
    const anchorIndex = sceneIndex % activeStreams.length;
    const orderedStreams = [
      activeStreams[anchorIndex],
      ...activeStreams.filter((_, index) => index !== anchorIndex),
    ];
    const semanticSteps = [];
    for (const stream of orderedStreams) {
      semanticSteps.push(await promptCreatorImpl.default([stream], { streamMixType: 'sequential' }));
    }
    const labels = orderedStreams.map((stream, index) => (
      resolveStreamLabel(stream, activeStreams.indexOf(stream) >= 0 ? activeStreams.indexOf(stream) : index)
    ));
    const collisions = semanticSteps.slice(1).map((step, index) => (
      `Collision ${String.fromCharCode(65 + index)} (${labels[index + 1]}): ${normalizeString(step) || labels[index + 1]}.`
    ));

    sourceCues.push([
      `Anchor (${labels[0]}): ${normalizeString(semanticSteps[0]) || labels[0]}.`,
      ...collisions,
      'Collision rule: keep the terms in productive conflict; do not explain or harmonize them. Make their contradiction physically transform bodies, objects, light, architecture, or human behavior inside the scene.',
    ].join(' '));
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
