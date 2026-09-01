const IDENTITY_NOISE_WORDS = new Set([
  'a', 'an', 'and', 'at', 'background', 'center', 'foreground', 'frame', 'front',
  'in', 'individual', 'left', 'looking', 'man', 'middle', 'near', 'of', 'on',
  'person', 'right', 'side', 'standing', 'subject', 'the', 'toward', 'visitor',
  'wearing', 'with', 'woman',
]);

const normalizeDescription = (value) => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9äöüß\s-]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const identityTokens = (value) => new Set(
  normalizeDescription(value)
    .split(/[\s-]+/)
    .filter((token) => token.length > 2 && !IDENTITY_NOISE_WORDS.has(token))
);

const descriptionOverlap = (left, right) => {
  const leftTokens = identityTokens(left);
  const rightTokens = identityTokens(right);
  if (leftTokens.size < 2 || rightTokens.size < 2) return 0;

  const shared = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return shared / Math.min(leftTokens.size, rightTokens.size);
};

const positiveInteger = (value, fallback) => {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
};

export const createVisitorMemory = ({ capacity = 10 } = {}) => ({
  capacity: positiveInteger(capacity, 10),
  visitors: [],
});

export const findRememberedVisitor = (memory, {
  description = '',
  strength = 0,
  minimumOverlap = 0.6,
} = {}) => {
  if (Number(strength) <= 0 || !normalizeDescription(description)) return null;

  const candidates = Array.isArray(memory?.visitors) ? memory.visitors : [];
  return candidates
    .map((visitor) => ({
      visitor,
      overlap: descriptionOverlap(visitor?.description, description),
    }))
    .filter(({ overlap }) => overlap >= minimumOverlap)
    .sort((left, right) => right.overlap - left.overlap)[0] || null;
};

export const rememberVisitor = (memory, {
  description = '',
  strength = 0,
  referencePath = '',
  sceneIndex = null,
} = {}) => {
  const normalizedDescription = normalizeDescription(description);
  const currentMemory = {
    ...createVisitorMemory({ capacity: memory?.capacity }),
    visitors: [...(Array.isArray(memory?.visitors) ? memory.visitors : [])],
  };
  if (!normalizedDescription || Number(strength) <= 0 || !referencePath) {
    return { memory: currentMemory, event: null };
  }

  const match = findRememberedVisitor(currentMemory, {
    description: normalizedDescription,
    strength,
  });
  if (match) {
    const referencePaths = [...new Set([
      ...(Array.isArray(match.visitor.referencePaths) ? match.visitor.referencePaths : []),
      match.visitor.referencePath,
      referencePath,
    ].filter(Boolean))].slice(-3);
    const visitor = {
      ...match.visitor,
      description: normalizedDescription,
      strength: Number(strength),
      referencePath,
      referencePaths,
      lastSeenScene: sceneIndex,
      sightings: Number(match.visitor.sightings || 1) + 1,
      interactionState: {
        status: 'returning',
        lastEvent: 'shared-attention',
        sceneIndex,
      },
    };
    currentMemory.visitors = currentMemory.visitors.map((entry) => (
      entry.id === visitor.id ? visitor : entry
    ));
    return {
      memory: currentMemory,
      event: {
        type: 'returning',
        visitor,
        overlap: match.overlap,
        interaction: 'shared-attention',
      },
    };
  }

  const visitor = {
    id: `visitor-${String(Date.now()).slice(-8)}-${currentMemory.visitors.length + 1}`,
    description: normalizedDescription,
    strength: Number(strength),
    referencePath,
    referencePaths: [referencePath],
    firstSeenScene: sceneIndex,
    lastSeenScene: sceneIndex,
    sightings: 1,
    interactionState: {
      status: 'arriving',
      lastEvent: 'arrival',
      sceneIndex,
    },
  };
  currentMemory.visitors = [...currentMemory.visitors, visitor].slice(-currentMemory.capacity);
  return {
    memory: currentMemory,
    event: {
      type: 'new',
      visitor,
      overlap: 0,
      interaction: 'arrival',
    },
  };
};
