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

const readFirstSentence = (sentences) => {
  if (!Array.isArray(sentences)) {
    return '';
  }
  return normalizeString(sentences.find((sentence) => normalizeString(sentence)));
};

const describeSemanticLink = (link) => {
  if (typeof link === 'string') {
    return normalizeString(link);
  }

  const nextSentence = readFirstSentence(link?.sentences?.next);
  const title = normalizeString(link?.title);
  const previousSentence = readFirstSentence(link?.sentences?.prev);
  const sentenceContext = [nextSentence, previousSentence].filter(Boolean).join(' ');
  return sentenceContext || title;
};

const resolveSemanticTerm = (link, description, streamLabel) => {
  if (typeof link === 'string') {
    return normalizeString(link) || streamLabel;
  }

  const title = normalizeString(link?.title);
  if (title) {
    return title;
  }

  return description || streamLabel;
};

const readNextSemanticStep = async ({
  stream,
  streamIndex,
  promptCreatorImpl,
}) => {
  const streamLabel = resolveStreamLabel(stream, streamIndex);

  if (typeof stream?.getNext === 'function') {
    const link = await stream.getNext();
    const description = describeSemanticLink(link) || streamLabel;
    return {
      streamLabel,
      term: resolveSemanticTerm(link, description, streamLabel),
      description,
    };
  }

  // Compatibility path for injected or legacy stream adapters.
  const generatedDescription = await promptCreatorImpl.default(
    [stream],
    { streamMixType: 'sequential' }
  );
  const description = normalizeString(generatedDescription) || streamLabel;
  return {
    streamLabel,
    term: description,
    description,
  };
};

export const resolveSceneDramaticFunction = (sceneIndex, sceneCount) => {
  if (sceneCount <= 1) {
    return 'condensed arc: establish the world, intensify the collision, and show its consequence in one scene';
  }
  if (sceneIndex === 0) {
    return 'opening: make the first semantic disturbance visible';
  }
  if (sceneIndex === sceneCount - 1) {
    return 'consequence: use the fresh term to transform and resolve the accumulated visible residue';
  }

  const progress = sceneIndex / (sceneCount - 1);
  if (progress >= 0.7) {
    return 'rupture: let the inherited and fresh terms destabilize the established scene state';
  }
  return 'escalation: make the fresh term visibly intensify the inherited transformation';
};

const endSentenceOnce = (value) => {
  const sentence = normalizeString(value);
  if (!sentence || /[.!?]$/.test(sentence)) {
    return sentence;
  }
  return `${sentence}.`;
};

const describeSemanticBatonScene = ({
  inheritedTerm,
  semanticStep,
  sceneIndex,
  sceneCount,
}) => {
  const semanticContext = semanticStep.description === semanticStep.term
    ? ''
    : ` Context: ${endSentenceOnce(semanticStep.description)}`;
  const dramaticFunction = resolveSceneDramaticFunction(sceneIndex, sceneCount);
  const anchorRole = sceneIndex === 0
    ? 'initial configured term'
    : 'carried semantic inheritance';
  const inheritanceRule = sceneIndex === sceneCount - 1
    ? `Final-state rule: ${semanticStep.term} remains visible as the final semantic consequence.`
    : `Carry-forward rule: ${semanticStep.term} becomes the semantic inheritance of the next scene.`;

  return [
    `Anchor (${anchorRole}): ${inheritedTerm}.`,
    `Collision A (fresh getNext from ${semanticStep.streamLabel}): ${semanticStep.term}.${semanticContext}`,
    `Dramatic function: ${dramaticFunction}.`,
    'Collision rule: keep the terms in productive conflict; do not explain or harmonize them. Make their contradiction physically transform bodies, objects, light, architecture, or human behavior inside the scene.',
    inheritanceRule,
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

  let inheritedTerm = resolveStreamLabel(activeStreams[0], 0);
  const sourceCues = [];
  for (let sceneIndex = 0; sceneIndex < sceneCount; sceneIndex += 1) {
    const streamIndex = sceneIndex % activeStreams.length;
    const semanticStep = await readNextSemanticStep({
      stream: activeStreams[streamIndex],
      streamIndex,
      promptCreatorImpl,
    });
    const sourceCue = describeSemanticBatonScene({
      inheritedTerm,
      semanticStep,
      sceneIndex,
      sceneCount,
    });
    sourceCues.push(sourceCue);
    inheritedTerm = semanticStep.term;
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
  resolveSceneDramaticFunction,
  resolveSourceCueMixType,
  resolveStaticSourceCues,
};
