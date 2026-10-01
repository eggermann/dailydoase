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

const buildSelfomatPrompt = ({
  currentVisitor,
  returningVisitors = [],
  interaction,
  cameraCue = '',
}) => {
  const currentDescription = describePerson(currentVisitor, 'the current visitor');
  const returningDescriptions = returningVisitors
    .map((visitor) => describePerson(visitor, 'an earlier visitor'));
  const people = returningDescriptions.length > 0
    ? `The current visitor (${currentDescription}) is closest to the phone and remains the main person. ${returningDescriptions.length === 1 ? 'One earlier visitor' : 'Two earlier visitors'} (${returningDescriptions.join(' and ')}) ${returningDescriptions.length === 1 ? 'appears' : 'appear'} beside them, recognizable from ${returningDescriptions.length === 1 ? 'the memory reference' : 'their memory references'}.`
    : `The current visitor (${currentDescription}) is closest to the camera and remains the main person.`;

  return [
    'Ordinary, unplanned camera capture of a real visitor.',
    people,
    interaction,
    'Choose a loose handheld-phone or small-drone viewpoint only when it follows the visible story event.',
    cameraCue ? `Camera movement: ${cameraCue}` : '',
    'Keep any visible camera consequence natural: uneven light, imperfect focus, motion blur, or an off-center frame only when motivated by that camera movement.',
    'Natural skin and clothing; no posed composition, collage, or cinematic lighting.',
  ].join(' ');
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
    const prompt = buildSelfomatPrompt({
      currentVisitor,
      returningVisitors,
      interaction,
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
      stillPrompt: prompt,
      imageDescription: prompt,
      motionCue: interaction,
      videoPrompt: prompt,
      singleImagePrompt: prompt,
      cameraCue,
    };
  });
};

export default adaptSelfomatScenePlan;
