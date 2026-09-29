import promptCreator from '../../../prompt-creator.js';
import {
  isReferenceImageActorMode,
} from './LiveContextOrchestrator-config.js';

const normalizeString = (value) => (typeof value === 'string' ? value.trim() : '');

export const resolveSemanticSceneCount = ({ words = [], min = 1, max = 8 } = {}) => {
  const lowerBound = Math.max(1, Math.floor(Number(min) || 1));
  const upperBound = Math.max(lowerBound, Math.floor(Number(max) || 8));
  const count = Array.isArray(words)
    ? words.filter((word) => (
        Array.isArray(word)
          ? normalizeString(word[0]).length > 0
          : normalizeString(word).length > 0
      )).length
    : 0;
  return Math.min(upperBound, Math.max(lowerBound, count || lowerBound));
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

export const buildSourceCues = async ({
  streams = [],
  sceneCount = 1,
  configMode = 'generated',
  staticTestMode = false,
  staticSourceCues = [],
  requestedMixType = 'random',
  promptCreatorImpl = promptCreator,
} = {}) => {
  if (staticTestMode) {
    return resolveStaticSourceCues(sceneCount, staticSourceCues);
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
  resolveSourceCueMixType,
  resolveStaticSourceCues,
};
