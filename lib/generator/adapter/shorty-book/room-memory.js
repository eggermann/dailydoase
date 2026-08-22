const normalizeText = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

const normalizeRoomEntry = (entry = {}) => ({
  iteration: Math.max(1, Number(entry.iteration) || 1),
  sceneIndex: Math.max(0, Number(entry.sceneIndex) || 0),
  imagePath: normalizeText(entry.imagePath),
  imageSource: normalizeText(entry.imageSource),
  location: normalizeText(entry.location),
  setup: normalizeText(entry.setup),
  assets: Array.isArray(entry.assets) ? entry.assets : [],
  actors: Array.isArray(entry.actors) ? entry.actors : [],
  capturedAt: normalizeText(entry.capturedAt) || new Date().toISOString(),
});

export const createRoomMemory = ({ maxSize = 10, entries = [] } = {}) => {
  const capacity = Math.max(1, Number(maxSize) || 10);
  const queue = [];

  const remember = (entry = {}) => {
    const normalized = normalizeRoomEntry(entry);
    if (!normalized.imagePath) return null;
    queue.push(normalized);
    while (queue.length > capacity) queue.shift();
    return normalized;
  };

  entries.forEach(remember);

  return {
    remember,
    values: () => queue.map((entry) => ({ ...entry })),
    latest: () => queue.length > 0 ? { ...queue.at(-1) } : null,
    formatForPrompt() {
      if (queue.length === 0) return 'ROOM MEMORY: empty.';
      return `ROOM MEMORY (oldest to newest): ${queue.map((entry, index) => {
        const assets = entry.assets.map((asset) => [
          asset.reference,
          asset.description,
          asset.position,
        ].filter(Boolean).join(', ')).join('; ');
        return [
          `room-${index + 1}`,
          entry.location,
          entry.setup,
          assets ? `assets=${assets}` : '',
          `people=${entry.actors.length}`,
        ].filter(Boolean).join(' | ');
      }).join(' || ')}`;
    },
  };
};

export default createRoomMemory;
