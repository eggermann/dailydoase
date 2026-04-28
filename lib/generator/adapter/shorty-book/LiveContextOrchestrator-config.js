export const parseBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};

export const parsePositiveNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const parseFiniteNumber = (value, fallback) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const clampNumber = (value, min, max, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
};

export const pickEnvValue = (...names) => {
  for (const name of names) {
    const value = process.env[name];
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }
  return '';
};

export const normalizeUrl = (value) => String(value || '').trim().replace(/\/+$/g, '');
export const appendUniqueLast = (items = [], value = '') => {
  const normalizedValue = String(value || '').trim();
  if (!normalizedValue) {
    return items;
  }
  const nextItems = items.filter((item) => String(item || '').trim() && String(item).trim() !== normalizedValue);
  nextItems.push(normalizedValue);
  return nextItems;
};

export const parseOptionalPositiveNumber = (value) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

export const parsePositiveNumberList = (value) => String(value || '')
  .split(',')
  .map((entry) => Number(entry.trim()))
  .filter((entry) => Number.isFinite(entry) && entry > 0);

export const parsePipeList = (value, fallback = []) => {
  const items = String(value || '')
    .split('|')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return items.length > 0 ? items : fallback;
};

export const parseCommaList = (value, fallback = []) => {
  const items = String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return items.length > 0 ? items : fallback;
};

export const parseWordPairs = (value, fallback = [['horror', 'de']]) => {
  const raw = String(value || '').trim();
  if (!raw) {
    return fallback;
  }

  const pairs = raw
    .split('|')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [word, lang] = entry.split(',').map((part) => part.trim());
      if (!word) {
        return null;
      }
      return [word, lang || 'en'];
    })
    .filter(Boolean);

  return pairs.length > 0 ? pairs : fallback;
};
