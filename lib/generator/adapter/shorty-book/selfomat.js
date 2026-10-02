import {
  buildSelfomatCaptureCameraDirection,
  buildSelfomatCaptureMaterialStyle,
  resolveSelfomatCaptureSource,
} from './selfomat-capture-style.js';

const readableText = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

const describePerson = (person, fallback) => {
  const description = readableText(person?.description);
  return description || fallback;
};

const findCurrentVisitor = (transport) => {
  const visiblePeople = transport?.people?.actors;
  if (!Array.isArray(visiblePeople) || visiblePeople.length === 0) {
    return null;
  }

  return visiblePeople.find((visitor) => readableText(visitor?.referenceImage)) || null;
};

const findEarlierVisitors = (transport, currentVisitor) => {
  const visitors = new Map();
  const fifoVisitors = Array.isArray(transport?.cast?.actorReferences)
    ? transport.cast.actorReferences
    : [];

  fifoVisitors.forEach((visitor) => {
    const personaId = readableText(visitor?.personaId);
    if (personaId && readableText(visitor?.referenceImage)) {
      visitors.set(personaId, visitor);
    }
  });

  return [...visitors.values()].filter((visitor) => (
    visitor.personaId !== currentVisitor.personaId
  ));
};

const rawCueForScene = (sourceCues, sceneIndex, topic) => {
  const cues = Array.isArray(sourceCues) ? sourceCues : [];
  return readableText(cues[sceneIndex] || cues[cues.length - 1] || topic);
};

const selectReturningVisitors = ({ visitors, sceneIndex, sceneCount }) => {
  if (visitors.length === 0) {
    return [];
  }

  // FIFO is oldest to newest. The short film walks backwards through it:
  // newest visitor first, oldest available visitor at the closing beat.
  const newestToOldest = [...visitors].reverse();
  const progress = sceneCount > 1 ? sceneIndex / (sceneCount - 1) : 0;
  const primaryIndex = Math.round(progress * (newestToOldest.length - 1));
  const primaryVisitor = newestToOldest[primaryIndex];
  const selected = [{
    visitor: primaryVisitor,
    fifoPosition: primaryIndex,
    selectionReason: primaryIndex === 0 ? 'newest-fifo-visitor' : 'older-fifo-visitor',
  }];

  // A three-person selfie is a closing gesture, not a semantic-match reward.
  if (sceneCount >= 3 && sceneIndex === sceneCount - 1 && primaryIndex > 0) {
    selected.push({
      visitor: newestToOldest[primaryIndex - 1],
      fifoPosition: primaryIndex - 1,
      selectionReason: 'closing-fifo-neighbor',
    });
  }

  return selected;
};

const describeInteraction = (scene, returningVisitors = []) => {
  const plannedInteraction = readableText(
    scene?.actorsInteraction || scene?.actorAction
  );
  if (plannedInteraction) {
    return plannedInteraction;
  }

  if (returningVisitors.length > 0) {
    const people = returningVisitors
      .map((visitor) => describePerson(visitor, 'an earlier visitor'))
      .join(' and ');
    return `The current visitor and ${people} perform one brief, visible shared gesture. Keep the interaction physical and unposed, not explanatory.`;
  }

  return 'The current visitor performs one brief, visible physical gesture.';
};

const describeVisiblePeople = ({
  currentVisitor,
  returningVisitors = [],
  captureSource = 'pocketPhone',
}) => {
  const currentDescription = describePerson(currentVisitor, 'the current visitor');
  const captureNoun = captureSource === 'cheapCCTV'
    ? 'security camera'
    : captureSource === 'firstPersonDrone'
      ? 'drone'
      : 'phone';
  const returningDescriptions = returningVisitors
    .map((visitor) => describePerson(visitor, 'an earlier visitor'));
  return returningDescriptions.length > 0
    ? `The current visitor (${currentDescription}) remains the main person in the ${captureNoun} view. ${returningDescriptions.length === 1 ? 'One earlier visitor' : 'Two earlier visitors'} (${returningDescriptions.join(' and ')}) ${returningDescriptions.length === 1 ? 'appears' : 'appear'} beside them, recognizable from ${returningDescriptions.length === 1 ? 'the memory reference' : 'their memory references'}.`
    : `The current visitor (${currentDescription}) remains the main person in the ${captureNoun} view.`;
};

const describeSceneMeaning = (scene = {}) => readableText(
  scene?.creativeDecision?.visualEvent
    || scene?.imageDescription
    || scene?.storyEvent
    || scene?.storyBeat
    || scene?.beat
);

const describeSceneTransformation = (scene = {}) => readableText(
  scene?.creativeDecision?.transformation
    || scene?.locationAction
);

const describeDramaturgicalClue = (scene = {}) => readableText(
  scene?.creativeDecision?.dramaturgicalClue
);

const buildSelfomatImageDescription = ({
  visiblePeople,
  sceneMeaning,
  dramaturgicalClue,
  transformation,
  interaction,
}) => [
  visiblePeople,
  sceneMeaning,
  dramaturgicalClue,
  transformation,
  interaction,
].filter(Boolean).map((fragment) => {
  const normalized = readableText(fragment);
  return /[.!?]$/.test(normalized) ? normalized : `${normalized}.`;
}).join(' ');

const buildSelfomatStillPrompt = ({
  imageDescription,
  captureSource,
  sceneIndex,
  cameraCue = '',
}) => {
  return [
    imageDescription,
    buildSelfomatCaptureCameraDirection({ captureSource, sceneIndex, cameraCue }),
    buildSelfomatCaptureMaterialStyle({ captureSource, sceneIndex }),
  ].filter(Boolean).join(' ');
};

const buildSelfomatVideoPrompt = ({
  visiblePeople,
  sceneMeaning,
  dramaturgicalClue,
  transformation,
  motionCue,
  captureSource,
  sceneIndex,
  cameraCue = '',
}) => {
  return [
    'Continue from the next frame.',
    visiblePeople,
    sceneMeaning,
    dramaturgicalClue,
    transformation,
    motionCue,
    buildSelfomatCaptureCameraDirection({ captureSource, sceneIndex, cameraCue }),
    buildSelfomatCaptureMaterialStyle({ captureSource, sceneIndex, video: true }),
  ].filter(Boolean).join(' ');
};

export const adaptSelfomatScenePlan = ({ scenePlan = [], transport = {} } = {}) => {
  if (!Array.isArray(scenePlan)) {
    return [];
  }

  const currentVisitor = findCurrentVisitor(transport);
  if (!currentVisitor) {
    return scenePlan;
  }

  const currentId = readableText(currentVisitor.personaId);
  const earlierVisitors = findEarlierVisitors(transport, currentVisitor);

  return scenePlan.map((scene, sceneIndex) => {
    const semanticCue = rawCueForScene(transport.semanticCues, sceneIndex, transport.topic);
    const selectedVisitors = selectReturningVisitors({
      visitors: earlierVisitors,
      sceneIndex,
      sceneCount: scenePlan.length,
    });
    const returningVisitors = selectedVisitors.map(({ visitor }) => visitor);
    const returningIds = returningVisitors.map((visitor) => readableText(visitor.personaId));
    const interaction = describeInteraction(scene, returningVisitors);
    const cameraCue = readableText(scene?.cameraCue);
    const captureSource = resolveSelfomatCaptureSource(scene?.captureSource, sceneIndex);
    const visiblePeople = describeVisiblePeople({
      currentVisitor,
      returningVisitors,
      captureSource,
    });
    // These fields serve distinct render jobs. Do not flatten them back into
    // one reusable paragraph: imageDescription is a visible destination,
    // stillPrompt describes a possible generated still, videoPrompt is the
    // short motion instruction sent to WAN for this scene.
    const sceneMeaning = describeSceneMeaning(scene);
    const dramaturgicalClue = describeDramaturgicalClue(scene);
    const transformation = describeSceneTransformation(scene);
    const imageDescription = buildSelfomatImageDescription({
      visiblePeople,
      sceneMeaning,
      dramaturgicalClue,
      transformation,
      interaction,
    });
    const stillPrompt = buildSelfomatStillPrompt({
      imageDescription,
      captureSource,
      sceneIndex,
      cameraCue,
    });
    const motionCue = readableText(scene?.motionCue) || interaction;
    const videoPrompt = buildSelfomatVideoPrompt({
      visiblePeople,
      sceneMeaning,
      dramaturgicalClue,
      transformation,
      motionCue,
      captureSource,
      sceneIndex,
      cameraCue,
    });
    const storyBeat = readableText(
      scene?.storyBeat
      || scene?.beat
      || `${interaction} The moment follows the visible action.`
    );

    return {
      ...scene,
      selfomat: true,
      peopleChain: selectedVisitors.map(({ visitor, fifoPosition, selectionReason }) => ({
        personaId: visitor.personaId,
        fifoPosition,
        selectionReason,
      })),
      beat: storyBeat,
      storyBeat,
      topic: readableText(transport.topic),
      semanticCue,
      eventType: returningVisitors.length > 0 ? 'actorToActor' : 'actorOnly',
      actorsInteraction: interaction,
      castSelection: returningIds,
      castUse: returningIds.length > 0
        ? `Keep ${currentId} as the current selfie lead; ${returningIds.join(' and ')} ${returningIds.length === 1 ? 'returns' : 'return'} as real people for this brief interaction.`
        : '',
      stillPrompt,
      imageDescription,
      motionCue,
      videoPrompt,
      singleImagePrompt: stillPrompt,
      captureSource,
      cameraCue,
    };
  });
};

export default adaptSelfomatScenePlan;
