export const stripCodeFences = (value) => String(value ?? '')
  .replace(/^```(?:json)?\s*/i, '')
  .replace(/\s*```$/i, '')
  .trim();

export const clampSceneCount = (value) => {
  const count = Number(value);
  if (!Number.isFinite(count) || count < 1) {
    return 1;
  }
  return Math.floor(count);
};

export const normalizeString = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

export const normalizeFrameSource = (value, fallback = 'lastFrame') => {
  const normalized = normalizeString(value, fallback);
  return normalized === 'newImage' ? 'newImage' : 'lastFrame';
};

export const normalizeVideoMode = (value, fallback = 'singleImage') => {
  const normalized = normalizeString(value, fallback);
  return normalized === 'firstLast' ? 'firstLast' : 'singleImage';
};

export const normalizeSceneLengthValue = (value, fallback = 3) => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }

  if (value && typeof value === 'object') {
    if (Number.isFinite(Number(value.durationSeconds)) && Number(value.durationSeconds) > 0) {
      return Number(value.durationSeconds);
    }
    if (Number.isFinite(Number(value.timeoutMillis)) && Number(value.timeoutMillis) > 0) {
      return Math.max(1, Math.round(Number(value.timeoutMillis) / 1000));
    }
  }

  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric;
  }

  return fallback;
};
