import fs from 'fs-extra';
import path from 'node:path';

const normalizeText = (value) => String(value ?? '')
  .replace(/\s+/g, ' ')
  .trim();

const compactList = (values = []) => values
  .map(normalizeText)
  .filter(Boolean);

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

export const createActorReferenceFifo = ({ maxSize = 10, entries = [] } = {}) => {
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
      cache.delete(cache.keys().next().value);
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
    nextOpeningObligation: normalizeText(transport.story?.nextOpeningObligation),
  };
};

export const createStoryTransportDraft = ({
  iteration = 1,
  words = [],
  sourceCues = [],
  visionStoryContext = {},
  previousTransport = null,
} = {}) => {
  const topics = extractTopicWords(words);

  return {
    schemaVersion: 1,
    iteration: Math.max(1, Number(iteration) || 1),
    topic: topics[0] || '',
    topics,
    semanticCues: compactList(sourceCues),
    people: createPeopleSnapshot(visionStoryContext),
    location: normalizeText(
      visionStoryContext.locationSummary
      || visionStoryContext.location
    ),
    previous: createPreviousBridge(previousTransport),
  };
};

const readSceneBeat = (scene = {}) => normalizeText(
  scene.storyBeat
  || scene.beat
  || scene.title
);

const readSceneVisibleEndState = (scene = {}) => {
  const finalPose = normalizeText(scene.finalPose);
  if (!finalPose) {
    return readSceneBeat(scene);
  }
  return [
    readSceneBeat(scene),
    `Final visible pose: ${finalPose}`,
  ].filter(Boolean).join(' ');
};

export const completeStoryTransport = ({
  draft,
  scenePlan = [],
} = {}) => {
  if (!draft) {
    throw new Error('completeStoryTransport requires a draft');
  }

  const scenes = Array.isArray(scenePlan) ? scenePlan : [];
  const beats = scenes
    .map(readSceneBeat)
    .filter(Boolean);
  const finalScene = scenes.at(-1) || {};
  const finalBeat = readSceneVisibleEndState(finalScene)
    || beats[beats.length - 1]
    || beats[0]
    || '';
  const openingBeat = beats[0] || '';
  const summary = [
    ...beats.slice(0, -1),
    finalBeat,
  ].filter(Boolean).join(' -> ');

  return {
    ...draft,
    story: {
      openingBeat,
      finalBeat,
      summary,
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

const describeCastMemory = (cast = {}) => {
  const references = Array.isArray(cast.actorReferences) ? cast.actorReferences : [];
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
  return `CAST MEMORY — optional FIFO library (newest ${references.length}/${cast.actorReferenceLimit || references.length}): ${cards.join('; ')}.`;
};

export const formatStoryTransportForPrompt = (transport = {}) => {
  const lines = [
    `Current topic word: ${normalizeText(transport.topic) || 'n/a'}.`,
    `Current people: ${describePeople(transport.people)}.`,
    describeCastMemory(transport.cast),
  ];

  if (transport.previous) {
    lines.push(
      `Previous iteration topic: ${normalizeText(transport.previous.topic) || 'n/a'}.`,
      `Previous iteration story: ${normalizeText(transport.previous.storySummary) || 'n/a'}.`,
      `Previous final beat: ${normalizeText(transport.previous.finalBeat) || 'n/a'}.`,
      `Opening obligation: ${normalizeText(transport.previous.nextOpeningObligation) || 'continue causally'}.`
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
  const actorReferences = createActorReferenceFifo({
    maxSize: actorReferenceLimit,
    entries: initialTransport?.cast?.actorReferences || [],
  });
  let nextCastSequence = actorReferences.values()
    .map((actor) => Number(String(actor.personaId || '').match(/^cast-(\d+)$/)?.[1]) || 0)
    .reduce((highest, value) => Math.max(highest, value), 0) + 1;

  const createCastId = () => {
    const id = `cast-${String(nextCastSequence).padStart(3, '0')}`;
    nextCastSequence += 1;
    return id;
  };

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
      const storyState = normalizeText(scene?.castUse || readSceneVisibleEndState(scene));
      selectedCast.forEach((personaId) => {
        actorReferences.annotate(personaId, {
          lastSelectedIteration: iteration,
          lastStoryState: storyState,
          status: 'story-active',
          lastScene: sceneIndex + 1,
        });
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
      return {
        ...draft,
        cast: {
          actorReferenceLimit: Math.max(1, Number(actorReferenceLimit) || 10),
          actorReferences: actorReferences.values(),
        },
      };
    },
    completeIteration({ draft, scenePlan = [] } = {}) {
      rememberSceneCast({ scenePlan, iteration: draft?.iteration });
      previousTransport = {
        ...completeStoryTransport({ draft, scenePlan }),
        cast: {
          ...(draft?.cast || {}),
          actorReferenceLimit: Math.max(1, Number(actorReferenceLimit) || 10),
          actorReferences: actorReferences.values(),
        },
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
      return {
        people: {
          ...people,
          actors: incomingActors,
        },
        actorReferences: actorReferences.values(),
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
  extractTopicWords,
  formatStoryTransportForPrompt,
  saveStoryTransportArtifact,
};
