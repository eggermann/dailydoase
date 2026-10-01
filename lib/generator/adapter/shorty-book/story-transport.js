import fs from 'fs-extra';
import path from 'node:path';

const normalizeText = (value) => String(value ?? '')
  .replace(/\s+/g, ' ')
  .trim();

const STORY_METADATA_NOISE_PATTERN = /\b(?:PMID|PMCID|PMC|S2CID|Bibcode|DOI|ISBN|identifier)\b/i;

const isStoryMetadataNoise = (value) => STORY_METADATA_NOISE_PATTERN.test(normalizeText(value));

const cleanStoryCandidate = (value) => {
  const normalized = normalizeText(value);
  if (!normalized) {
    return '';
  }
  if (!isStoryMetadataNoise(normalized)) {
    return normalized;
  }

  const sentences = normalized
    .split(/(?<=[.!?])\s+/)
    .map(normalizeText)
    .filter((sentence) => sentence && !isStoryMetadataNoise(sentence));
  return sentences.join(' ');
};

const compactList = (values = []) => values
  .map(normalizeText)
  .filter(Boolean);

const compactJson = (value) => {
  if (!value) return 'n/a';
  try {
    return JSON.stringify(value);
  } catch {
    return 'n/a';
  }
};

const summarizeSemanticStreamTrace = (batches = []) => (Array.isArray(batches) ? batches : [])
  .map((batch) => (Array.isArray(batch) ? batch : []).map((entry) => ({
    linkWord: normalizeText(entry?.linkWord),
    cnt: Number.isFinite(Number(entry?.cnt)) ? Number(entry.cnt) : null,
    hasPrev: Array.isArray(entry?.prev) && entry.prev.length > 0,
    hasNext: Array.isArray(entry?.next) && entry.next.length > 0,
  })));

export const extractSemanticLinkWord = ({ semanticCues = [], currentTopic = '' } = {}) => {
  const topic = normalizeText(currentTopic).toLocaleLowerCase();
  const entries = Array.isArray(semanticCues) ? semanticCues : [semanticCues];
  const explicitLinkWord = entries
    .map((cue) => (cue && typeof cue === 'object' ? cue.linkWord : ''))
    .map(cleanStoryCandidate)
    .filter((candidate) => candidate.toLocaleLowerCase() !== topic)
    .find(Boolean);
  return explicitLinkWord || '';
};

const readTopicWord = (entry) => {
  if (Array.isArray(entry)) {
    return normalizeText(entry[0]);
  }
  if (entry && typeof entry === 'object') {
    return normalizeText(entry.topic || entry.word || entry.startWord);
  }
  return normalizeText(entry);
};

export const extractTopicWords = (words = []) => {
  const entries = Array.isArray(words) ? words : [words];
  return [...new Set(entries.map(readTopicWord).filter(Boolean))];
};

const normalizeActor = (actor = {}, index = 0) => {
  const personaId = normalizeText(actor.personaId || actor.id);
  const referenceImage = normalizeText(
    actor.referenceImage || actor.referenceImagePath || actor.imagePath
  );

  return {
    ...(personaId ? { personaId } : {}),
    reference: normalizeText(actor.reference) || personaId || `person ${index + 1}`,
    description: normalizeText(actor.description),
    position: normalizeText(actor.position),
    orientation: normalizeText(actor.orientation),
    ...(referenceImage ? { referenceImage } : {}),
    ...(normalizeText(actor.firstSeenIteration) ? { firstSeenIteration: Number(actor.firstSeenIteration) } : {}),
    ...(normalizeText(actor.lastSeenIteration) ? { lastSeenIteration: Number(actor.lastSeenIteration) } : {}),
    ...(normalizeText(actor.lastSelectedIteration) ? { lastSelectedIteration: Number(actor.lastSelectedIteration) } : {}),
    ...(normalizeText(actor.lastScene) ? { lastScene: Number(actor.lastScene) } : {}),
    ...(normalizeText(actor.lastStoryState) ? { lastStoryState: normalizeText(actor.lastStoryState) } : {}),
    ...(normalizeText(actor.status) ? { status: normalizeText(actor.status) } : {}),
  };
};

const actorCacheKey = (actor = {}, index = 0) => normalizeText(
  actor.personaId || actor.id || actor.reference
) || `person ${index + 1}`;

export const createActorReferenceFifo = ({ maxSize = 10, entries = [], onEvict } = {}) => {
  const capacity = Math.max(1, Number(maxSize) || 10);
  const cache = new Map();

  const touch = (actor, index = 0) => {
    const normalizedActor = normalizeActor(actor, index);
    if (!normalizedActor.referenceImage) {
      return false;
    }

    const key = actorCacheKey(normalizedActor, index);
    cache.set(key, { ...normalizedActor, personaId: normalizedActor.personaId || key });

    while (cache.size > capacity) {
      const oldestKey = cache.keys().next().value;
      const evictedActor = cache.get(oldestKey);
      cache.delete(oldestKey);
      onEvict?.(evictedActor);
    }
    return true;
  };

  entries.forEach(touch);

  return {
    touch,
    touchMany(actors = []) {
      actors.forEach(touch);
      return this.values();
    },
    values() {
      return [...cache.values()];
    },
    annotate(personaId, updates = {}) {
      const key = normalizeText(personaId);
      if (!key || !cache.has(key)) {
        return false;
      }
      cache.set(key, {
        ...cache.get(key),
        ...updates,
      });
      return true;
    },
    get size() {
      return cache.size;
    },
  };
};

export const createPeopleSnapshot = (visionStoryContext = {}) => {
  const actors = Array.isArray(visionStoryContext?.actors)
    ? visionStoryContext.actors.map(normalizeActor)
    : [];

  return {
    count: actors.length,
    actors,
  };
};

const createPreviousBridge = (transport) => {
  if (!transport) {
    return null;
  }

  return {
    iteration: Number(transport.iteration) || 0,
    topic: normalizeText(transport.topic),
    topics: compactList(transport.topics),
    people: transport.people || { count: 0, actors: [] },
    location: normalizeText(transport.location),
    storySummary: normalizeText(transport.story?.summary),
    finalBeat: normalizeText(transport.story?.finalBeat),
    finalScene: transport.story?.finalScene || null,
    linkWord: normalizeText(transport.linkWord || transport.story?.linkWord),
    nextTopic: normalizeText(
      transport.nextTopic
      || transport.story?.nextTopic
      || transport.linkWord
      || transport.story?.linkWord
    ),
    nextOpeningObligation: normalizeText(transport.story?.nextOpeningObligation),
  };
};

export const createStoryTransportDraft = ({
  iteration = 1,
  words = [],
  sourceCues = [],
  sourceCueCount,
  sourceCuePattern = [],
  sourceCuePatternTrace = [],
  sourceCueBatches = [],
  sourceCueStreamTrace = [],
  sourceCueStreamTraceBatches = [],
  sourceCuePatternSource = 'flat-count',
  visionStoryContext = {},
  previousTransport = null,
} = {}) => {
  const topics = extractTopicWords(words);
  const topicIndex = Math.max(0, Number(iteration) - 1) % Math.max(1, topics.length);
  const carriedNextTopic = normalizeText(
    previousTransport?.nextTopic
    || previousTransport?.story?.nextTopic
    || previousTransport?.linkWord
    || previousTransport?.story?.linkWord
  );
  const topic = carriedNextTopic || topics[topicIndex] || '';

  const semanticStreamLinkWordPreview = extractSemanticLinkWord({
    semanticCues: (Array.isArray(sourceCueStreamTrace) ? sourceCueStreamTrace : []).flat(),
    currentTopic: topic,
  });

  const explicitLinkWordPreview = semanticStreamLinkWordPreview || '';

  const currentTopic = normalizeText(
    topic
  );

  return {
    schemaVersion: 1,
    iteration: Math.max(1, Number(iteration) || 1),
    // First iteration uses configured seed. Later iterations follow the
    // previous planner's explicit linkWord/nextTopic. Raw semantic sentences
    // never replace the configured topic.
    topic: currentTopic,
    topics,
    semanticCues: compactList(sourceCues),
    sourceCueCount: Number(sourceCueCount) || sourceCues.length,
    sourceCuePattern: Array.isArray(sourceCuePattern) ? sourceCuePattern : [],
    sourceCuePatternSource: normalizeText(sourceCuePatternSource) || 'flat-count',
    sourceCuePatternTrace: Array.isArray(sourceCuePatternTrace)
      ? sourceCuePatternTrace
      : [],
    sourceCueBatches: Array.isArray(sourceCueBatches)
      ? sourceCueBatches.map((batch) => compactList(batch))
      : [],
    sourceCueStreamTrace: Array.isArray(sourceCueStreamTrace)
      ? sourceCueStreamTrace
      : [],
    sourceCueStreamTraceBatches: Array.isArray(sourceCueStreamTraceBatches)
      ? sourceCueStreamTraceBatches
      : [],
    // Optional explicit semantic linkWord preview. This never sets topic or
    // nextTopic automatically; final planner decision remains authoritative.
    semanticStreamLinkWordPreview: explicitLinkWordPreview,
    people: createPeopleSnapshot(visionStoryContext),
    location: normalizeText(
      visionStoryContext.locationSummary
      || visionStoryContext.location
    ),
    previous: createPreviousBridge(previousTransport),
  };
};

const readSceneBeat = (scene = {}) => [
  scene.storyBeat,
  scene.storyEvent,
  scene.actorsInteraction,
  scene.actorAction,
  scene.locationAction,
  scene.beat,
  scene.title,
]
  .map(cleanStoryCandidate)
  .find(Boolean) || '';

const readSceneState = (scene = {}, sceneIndex = 0, fallbackTopic = '') => {
  const state = {
    sceneIndex: sceneIndex + 1,
    beat: readSceneBeat(scene),
  };
  const fields = [
    'title',
    'semanticCue',
    'topic',
    'eventType',
    'actorsInteraction',
    'actorAction',
    'castUse',
    'frameSource',
    'videoMode',
    'cameraCue',
    'stillPrompt',
    'videoPrompt',
  ];
  fields.forEach((field) => {
    const value = normalizeText(scene[field]);
    if (value) state[field] = value;
  });
  if (!state.topic && normalizeText(fallbackTopic)) {
    state.topic = normalizeText(fallbackTopic);
  }
  if (Array.isArray(scene.castSelection) && scene.castSelection.length > 0) {
    state.castSelection = scene.castSelection.map(normalizeText).filter(Boolean);
  }
  if (Number.isFinite(Number(scene.durationSeconds))) {
    state.durationSeconds = Number(scene.durationSeconds);
  }
  const decision = scene.creativeDecision && typeof scene.creativeDecision === 'object'
    ? scene.creativeDecision
    : null;
  if (decision) {
    state.creativeDecision = {
      visualEvent: normalizeText(decision.visualEvent),
      personAction: normalizeText(decision.personAction),
      transformation: normalizeText(decision.transformation),
      residue: {
        description: normalizeText(decision.residue?.description),
        mustSurvive: decision.residue?.mustSurvive !== false,
      },
      nextWord: normalizeText(decision.nextWord),
      nextWordReason: normalizeText(decision.nextWordReason),
      cameraMove: normalizeText(decision.cameraMove),
    };
    if (state.creativeDecision.nextWord) {
      state.nextWord = state.creativeDecision.nextWord;
    }
    if (state.creativeDecision.nextWordReason) {
      state.nextWordReason = state.creativeDecision.nextWordReason;
    }
  }
  return state;
};

export const completeStoryTransport = ({
  draft,
  scenePlan = [],
} = {}) => {
  if (!draft) {
    throw new Error('completeStoryTransport requires a draft');
  }

  const sceneStates = Array.isArray(scenePlan)
    ? scenePlan.map((scene, index) => readSceneState(scene, index, draft.topic)).filter((scene) => scene.beat)
    : [];
  const beats = sceneStates.map((scene) => scene.beat);
  const openingBeat = beats[0] || '';
  const finalBeat = beats[beats.length - 1] || openingBeat;
  const summary = beats.join(' -> ');
  const openingScene = sceneStates[0] || null;
  const finalScene = sceneStates[sceneStates.length - 1] || null;
  const finalDecision = finalScene?.creativeDecision || {};
  const plannedNextWord = normalizeText(finalDecision.nextWord || finalScene?.nextWord);
  const explicitLinkWordFallback = extractSemanticLinkWord({
    semanticCues: (Array.isArray(draft.sourceCueStreamTrace) ? draft.sourceCueStreamTrace : []).flat(),
    currentTopic: draft.topic,
  });
  const nextTopic = plannedNextWord && plannedNextWord.toLocaleLowerCase() !== normalizeText(draft.topic).toLocaleLowerCase()
    ? plannedNextWord
    : explicitLinkWordFallback;
  const nextWordSource = nextTopic === plannedNextWord && plannedNextWord
    ? 'planner-final-creative-decision'
    : explicitLinkWordFallback
      ? 'semantic-stream-explicit-linkWord-fallback'
      : 'none';
  const nextWordFallback = nextWordSource === 'semantic-stream-explicit-linkWord-fallback';
  const nextWordReason = normalizeText(finalDecision.nextWordReason)
    || (nextWordFallback
      ? 'Final creative decision omitted usable nextWord; explicit semantic linkWord fallback used.'
      : nextWordSource === 'none'
        ? 'No explicit linkWord or usable final creativeDecision.nextWord was available.'
        : 'Final creative decision names concrete continuation from visible consequence.');
  return {
    ...draft,
    linkWord: nextTopic,
    nextTopic,
    nextWord: nextTopic,
    nextWordSource,
    nextWordFallback,
    nextWordReason,
    story: {
      openingBeat,
      openingScene,
      finalBeat,
      finalScene,
      scenes: sceneStates,
      summary,
      linkWord: nextTopic,
      nextTopic,
      nextWord: nextTopic,
      nextWordSource,
      nextWordFallback,
      nextWordReason,
      nextOpeningObligation: finalBeat
        ? `Continue from this consequence: ${finalBeat}`
        : 'Let the next topic create the next visible consequence.',
    },
  };
};

const describePeople = (people = {}) => {
  const actors = Array.isArray(people.actors) ? people.actors : [];
  if (actors.length === 0) {
    return '0 visible people';
  }

  const descriptions = actors.map((actor) => [
    actor.personaId,
    actor.reference,
    actor.description,
    actor.position ? `position=${actor.position}` : '',
    actor.orientation ? `orientation=${actor.orientation}` : '',
  ].filter(Boolean).join(', '));

  return `${Number(people.count) || actors.length} visible people: ${descriptions.join('; ')}`;
};

const describeCastMemory = (cast = {}, maxPlannerReferences = 3) => {
  const references = Array.isArray(cast.actorReferences)
    ? cast.actorReferences.slice(-Math.max(1, maxPlannerReferences)).reverse()
    : [];
  if (references.length === 0) {
    return 'CAST MEMORY: empty. Invent, transform, or ignore people freely.';
  }

  const cards = references.map((actor) => [
    actor.personaId || actor.reference,
    actor.description || actor.reference,
    actor.position ? `last position=${actor.position}` : '',
    actor.lastStoryState ? `last story state=${actor.lastStoryState}` : '',
    actor.status ? `status=${actor.status}` : '',
    'whole camera-frame reference available',
  ].filter(Boolean).join(', '));
  const archivedCount = Array.isArray(cast.archivedActorReferences)
    ? cast.archivedActorReferences.length
    : 0;
  const archiveNote = archivedCount > 0
    ? ` ${archivedCount} older archived reference${archivedCount === 1 ? '' : 's'} retained for history, not eligible for return.`
    : '';
  return `CAST MEMORY — optional FIFO library (${references.length}/${cast.actorReferenceLimit || references.length} newest): ${cards.join('; ')}.${archiveNote}`;
};

export const formatStoryTransportForPrompt = (transport = {}) => {
  const lines = [
    `Current topic word: ${normalizeText(transport.topic) || 'n/a'}.`,
    `Active semantic topics: ${compactList(transport.topics).join(' | ') || 'n/a'}.`,
    `Semantic cue takt pattern by scene: ${Array.isArray(transport.sourceCuePattern) && transport.sourceCuePattern.length > 0 ? transport.sourceCuePattern.join(' | ') : 'flat'}.`,
    `Semantic cue takt source: ${normalizeText(transport.sourceCuePatternSource) || 'flat-count'}.`,
    `Semantic cue takt calls: ${compactJson(transport.sourceCuePatternTrace || [])}.`,
    `Semantic cue batches by scene (private): ${compactJson(transport.sourceCueBatches || [])}.`,
    `Semantic stream getNext context availability by scene (private): ${compactJson(summarizeSemanticStreamTrace(transport.sourceCueStreamTraceBatches || []))}. The dedicated scene-planner request carries the provider's prev/title/next context; prev and next remain source-text snippets, and visible image wording must still be newly generated.`,
    `Explicit semantic linkWord preview: ${normalizeText(transport.semanticStreamLinkWordPreview) || 'n/a'}. (preview only; sentences.next never becomes a topic automatically; planner final decision is authoritative.)`,
    `Final planner nextWord: ${normalizeText(transport.nextWord || transport.nextTopic) || 'pending scene plan'}.`,
    `Current people: ${describePeople(transport.people)}.`,
    describeCastMemory(transport.cast),
  ];

  if (transport.previous) {
    lines.push(
      `Previous iteration topic: ${normalizeText(transport.previous.topic) || 'n/a'}.`,
      `Previous iteration story: ${normalizeText(transport.previous.storySummary) || 'n/a'}.`,
      `Previous final beat: ${normalizeText(transport.previous.finalBeat) || 'n/a'}.`,
      `Opening obligation: ${normalizeText(transport.previous.nextOpeningObligation) || 'continue causally'}.`,
      `Previous final scene state: ${compactJson(transport.previous.finalScene)}.`,
      `Previous semantic link word: ${normalizeText(transport.previous.linkWord) || 'n/a'}.`,
      `Previous next semantic topic: ${normalizeText(transport.previous.nextTopic) || 'n/a'}.`
    );
  } else {
    lines.push('Previous iteration: none; establish the story.');
  }

  return lines.join(' ');
};

export const attachCastReferencesToScenePlan = ({
  scenePlan = [],
  cast = {},
} = {}) => {
  const castById = new Map(
    (Array.isArray(cast.actorReferences) ? cast.actorReferences : [])
      .map((actor) => [normalizeText(actor.personaId), actor])
      .filter(([personaId]) => Boolean(personaId))
  );

  return (Array.isArray(scenePlan) ? scenePlan : []).map((scene) => {
    const selectedCast = Array.isArray(scene?.castSelection) ? scene.castSelection : [];
    const castReferences = selectedCast
      .map((personaId) => castById.get(normalizeText(personaId)))
      .filter(Boolean)
      .map((actor) => ({
        personaId: actor.personaId,
        referenceImage: actor.referenceImage,
        description: actor.description,
        position: actor.position,
        lastStoryState: actor.lastStoryState,
      }));
    return {
      ...scene,
      castReferences,
    };
  });
};

export const createStoryTransportController = ({
  initialTransport = null,
  actorReferenceLimit = 10,
} = {}) => {
  let previousTransport = initialTransport;
  const archivedActors = new Map(
    (initialTransport?.cast?.archivedActorReferences || [])
      .map((actor) => [normalizeText(actor.personaId), normalizeActor(actor)])
      .filter(([personaId, actor]) => personaId && actor.referenceImage)
  );
  const actorReferences = createActorReferenceFifo({
    maxSize: actorReferenceLimit,
    entries: initialTransport?.cast?.actorReferences || [],
    onEvict: (actor) => {
      if (actor?.personaId && actor.referenceImage) {
        archivedActors.set(actor.personaId, actor);
      }
    },
  });
  let nextCastSequence = [...actorReferences.values(), ...archivedActors.values()]
    .map((actor) => Number(String(actor.personaId || '').match(/^cast-(\d+)$/)?.[1]) || 0)
    .reduce((highest, value) => Math.max(highest, value), 0) + 1;

  const createCastId = () => {
    const id = `cast-${String(nextCastSequence).padStart(3, '0')}`;
    nextCastSequence += 1;
    return id;
  };

  const createCastSnapshot = () => ({
    actorReferenceLimit: Math.max(1, Number(actorReferenceLimit) || 10),
    actorReferences: actorReferences.values(),
    archivedActorReferences: [...archivedActors.values()],
  });

  const createCurrentCast = ({ people = {}, referenceImagePath = '', iteration = 1 } = {}) => ({
    ...people,
    actors: (Array.isArray(people.actors) ? people.actors : []).map((actor) => ({
      ...actor,
      personaId: normalizeText(actor.personaId) || createCastId(),
      referenceImage: normalizeText(actor.referenceImage) || normalizeText(referenceImagePath),
      firstSeenIteration: Number(actor.firstSeenIteration) || iteration,
      lastSeenIteration: iteration,
      status: normalizeText(actor.status) || 'present',
    })),
  });

  const rememberSceneCast = ({ scenePlan = [], iteration = 1 } = {}) => {
    (Array.isArray(scenePlan) ? scenePlan : []).forEach((scene, sceneIndex) => {
      const selectedCast = Array.isArray(scene?.castSelection) ? scene.castSelection : [];
      const storyState = normalizeText(scene?.castUse || readSceneBeat(scene));
      selectedCast.forEach((personaId) => {
        const updates = {
          lastSelectedIteration: iteration,
          lastStoryState: storyState,
          status: 'story-active',
          lastScene: sceneIndex + 1,
        };
        actorReferences.annotate(personaId, updates);
      });
    });
  };

  return {
    beginIteration(input = {}) {
      const draft = createStoryTransportDraft({
        ...input,
        previousTransport,
      });
      draft.people = createCurrentCast({
        people: draft.people,
        referenceImagePath: input.referenceImagePath,
        iteration: draft.iteration,
      });
      actorReferences.touchMany(draft.people.actors);
      draft.people.actors.forEach((actor) => archivedActors.delete(actor.personaId));
      return {
        ...draft,
        cast: createCastSnapshot(),
      };
    },
    completeIteration({ draft, scenePlan = [] } = {}) {
      rememberSceneCast({ scenePlan, iteration: draft?.iteration });
      previousTransport = {
        ...completeStoryTransport({ draft, scenePlan }),
        cast: createCastSnapshot(),
      };
      return previousTransport;
    },
    rememberRealityIntrusion({
      visionStoryContext = {},
      referenceImagePath = '',
      iteration = 1,
      sceneIndex = 0,
    } = {}) {
      const people = createCurrentCast({
        people: createPeopleSnapshot(visionStoryContext),
        referenceImagePath,
        iteration,
      });
      const incomingActors = people.actors.map((actor) => ({
        ...actor,
        status: 'reality-intrusion',
        lastScene: Number(sceneIndex) || undefined,
        lastStoryState: 'Entered through a deliberate live-camera reality intrusion.',
      }));
      actorReferences.touchMany(incomingActors);
      incomingActors.forEach((actor) => archivedActors.delete(actor.personaId));
      return {
        people: {
          ...people,
          actors: incomingActors,
        },
        actorReferences: actorReferences.values(),
        archivedActorReferences: [...archivedActors.values()],
      };
    },
    getPreviousTransport() {
      return previousTransport;
    },
    getActorReferences() {
      return actorReferences.values();
    },
  };
};

export const saveStoryTransportArtifact = async ({
  outputDir,
  transport,
} = {}) => {
  const resolvedOutputDir = normalizeText(outputDir);
  if (!resolvedOutputDir || !transport) {
    return null;
  }

  const iteration = Math.max(1, Number(transport.iteration) || 1);
  const targetDir = path.join(path.resolve(resolvedOutputDir), 'story-transport');
  const targetPath = path.join(
    targetDir,
    `iteration-${String(iteration).padStart(4, '0')}.json`
  );

  await fs.ensureDir(targetDir);
  await fs.writeJson(targetPath, transport, { spaces: 2 });
  return targetPath;
};

export default {
  completeStoryTransport,
  attachCastReferencesToScenePlan,
  createActorReferenceFifo,
  createPeopleSnapshot,
  createStoryTransportController,
  createStoryTransportDraft,
  extractSemanticLinkWord,
  extractTopicWords,
  formatStoryTransportForPrompt,
  saveStoryTransportArtifact,
};
