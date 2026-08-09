import promptCreator from '../../../prompt-creator.js';
import {
  isReferenceImageActorMode,
} from './LiveContextOrchestrator-config.js';

const normalizeString = (value) => (typeof value === 'string' ? value.trim() : '');

const withTimeout = (promise, timeoutMs, label) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  Promise.resolve(promise).then(resolve, reject).finally(() => clearTimeout(timer));
});

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
  timeoutMs = 90000,
}) => {
  const streamLabel = resolveStreamLabel(stream, streamIndex);

  if (typeof stream?.getNext === 'function') {
    const link = await withTimeout(stream.getNext(), timeoutMs, `Semantic Stream ${streamLabel} getNext`);
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

export const serializeCollisionSourceCue = (cueRecord = {}) => {
  const anchorTerm = normalizeString(cueRecord?.anchor?.term);
  const collisionTerm = normalizeString(cueRecord?.collision?.term);
  const collisionDescription = normalizeString(cueRecord?.collision?.description);
  const streamLabel = normalizeString(cueRecord?.collision?.streamLabel, 'semantic-stream');
  const sceneIndex = Number(cueRecord?.sceneIndex) || 0;
  const sceneCount = Math.max(1, Number(cueRecord?.sceneCount) || 1);
  const semanticContext = collisionDescription === collisionTerm
    ? ''
    : ` Context: ${endSentenceOnce(collisionDescription)}`;
  const dramaticFunction = normalizeString(cueRecord?.dramaticFunction)
    || resolveSceneDramaticFunction(sceneIndex, sceneCount);
  const anchorRole = cueRecord?.anchor?.role === 'initialConfiguredTerm'
    ? 'initial configured term'
    : 'carried semantic inheritance';
  const inheritanceRule = sceneIndex === sceneCount - 1
    ? `Final-state rule: ${collisionTerm} remains visible as the final semantic consequence.`
    : `Carry-forward rule: ${collisionTerm} becomes the semantic inheritance of the next scene.`;

  return [
    `Anchor (${anchorRole}): ${anchorTerm}.`,
    `Collision A (fresh getNext from ${streamLabel}): ${collisionTerm}.${semanticContext}`,
    `Dramatic function: ${dramaticFunction}.`,
    'Collision rule: keep the terms in productive conflict; do not explain or harmonize them. Make their contradiction physically transform bodies, objects, light, architecture, or human behavior inside the scene.',
    inheritanceRule,
  ].join(' ');
};

export const buildCollisionSourceCueRecords = async ({
  streams = [],
  sceneCount = 1,
  promptCreatorImpl = promptCreator,
  semanticStepTimeoutMs = 90000,
} = {}) => {
  const activeStreams = streams.filter(Boolean);
  if (activeStreams.length === 0) {
    return [];
  }

  let inheritedTerm = resolveStreamLabel(activeStreams[0], 0);
  const sourceCueRecords = [];
  for (let sceneIndex = 0; sceneIndex < sceneCount; sceneIndex += 1) {
    const streamIndex = sceneIndex % activeStreams.length;
    const semanticStep = await readNextSemanticStep({
      stream: activeStreams[streamIndex],
      streamIndex,
      promptCreatorImpl,
      timeoutMs: semanticStepTimeoutMs,
    });
    sourceCueRecords.push({
      sceneIndex,
      sceneCount,
      anchor: {
        term: inheritedTerm,
        role: sceneIndex === 0
          ? 'initialConfiguredTerm'
          : 'carriedSemanticInheritance',
      },
      collision: {
        term: semanticStep.term,
        streamLabel: semanticStep.streamLabel,
        description: semanticStep.description,
      },
      dramaticFunction: resolveSceneDramaticFunction(sceneIndex, sceneCount),
      semanticRules: {
        keepConflictOpen: true,
        collisionMustCausePhysicalEvent: true,
        freshTermBecomesNextAnchor: true,
      },
    });
    inheritedTerm = semanticStep.term;
  }

  return sourceCueRecords;
};

export const buildCollisionSourceCues = async (options = {}) => {
  const sourceCueRecords = await buildCollisionSourceCueRecords(options);
  if (sourceCueRecords.length === 0) {
    const sceneCount = Math.max(1, Number(options.sceneCount) || 1);
    return Array.from({ length: sceneCount }, () => '');
  }
  return sourceCueRecords.map(serializeCollisionSourceCue);
};

export const buildSourceCueBundle = async (options = {}) => {
  if (options.staticTestMode || normalizeSourceCueMode(options.cueMode) !== 'collision') {
    return {
      sourceCues: await buildSourceCues(options),
      sourceCueRecords: [],
    };
  }

  const sourceCueRecords = await buildCollisionSourceCueRecords(options);
  return {
    sourceCues: sourceCueRecords.length > 0
      ? sourceCueRecords.map(serializeCollisionSourceCue)
      : Array.from({ length: Math.max(1, Number(options.sceneCount) || 1) }, () => ''),
    sourceCueRecords,
  };
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
  buildSourceCueBundle,
  buildCollisionSourceCueRecords,
  buildCollisionSourceCues,
  serializeCollisionSourceCue,
  normalizeSourceCueMode,
  resolveSceneDramaticFunction,
  resolveSourceCueMixType,
  resolveStaticSourceCues,
};
