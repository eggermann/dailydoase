export const RUNWARE_WAN_26_FLASH_DURATION_RULE = 'runware-wan-2.6-flash-integer-2-15';

export const normalizeSceneLengthCurve = (value, fallback = 'linear') => {
  const normalized = String(value || '').trim().toLowerCase();
  return ['linear', 'power', 'log'].includes(normalized)
    ? normalized
    : fallback;
};

export const applySceneLengthCurve = (sceneLengths = [], {
  mode = 'linear',
  exponent = 1,
  preserveTotal = true,
} = {}) => {
  const source = sceneLengths.map(Number);
  if (source.length === 0 || source.some((value) => !Number.isFinite(value) || value <= 0)) {
    return [...sceneLengths];
  }

  const resolvedMode = normalizeSceneLengthCurve(mode, 'linear');
  if (resolvedMode === 'linear') {
    return [...source];
  }

  const mean = source.reduce((sum, value) => sum + value, 0) / source.length;
  if (!Number.isFinite(mean) || mean <= 0) {
    return [...source];
  }

  let transformed;
  if (resolvedMode === 'power') {
    const resolvedExponent = Number.isFinite(Number(exponent)) && Number(exponent) > 0
      ? Number(exponent)
      : 1;
    transformed = source.map((value) => {
      const ratio = value / mean;
      return mean * Math.pow(ratio, resolvedExponent);
    });
  } else {
    transformed = source.map((value) => Math.log1p(value));
  }

  if (preserveTotal) {
    const sourceTotal = source.reduce((sum, value) => sum + value, 0);
    const transformedTotal = transformed.reduce((sum, value) => sum + value, 0);
    if (sourceTotal > 0 && Number.isFinite(transformedTotal) && transformedTotal > 0) {
      const normalization = sourceTotal / transformedTotal;
      transformed = transformed.map((value) => value * normalization);
    }
  }

  return transformed.map((value) => Number(value.toFixed(3)));
};

export const applySceneLengthMinimum = (sceneLengths = [], minimum = 1) => {
  const resolvedMinimum = Number(minimum);
  if (!Number.isFinite(resolvedMinimum) || resolvedMinimum <= 0) {
    return [...sceneLengths];
  }
  return sceneLengths.map((value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0
      ? Math.max(parsed, resolvedMinimum)
      : resolvedMinimum;
  });
};

export const applySceneLengthMaximum = (sceneLengths = [], maximum = null) => {
  const resolvedMaximum = Number(maximum);
  if (!Number.isFinite(resolvedMaximum) || resolvedMaximum <= 0) {
    return [...sceneLengths];
  }
  return sceneLengths.map((value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0
      ? Math.min(parsed, resolvedMaximum)
      : value;
  });
};

export const quantizeRunwareWan26FlashDuration = (durationSeconds, {
  minimum = 2,
  maximum = 15,
} = {}) => {
  const parsed = Number(durationSeconds);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return minimum;
  }
  return Math.min(maximum, Math.max(minimum, Math.round(parsed)));
};

export const resolveProviderDuration = ({
  durationSeconds,
  videoModelType,
  model,
} = {}) => {
  const normalizedType = String(videoModelType || '').trim();
  const normalizedModel = String(model || '').trim().toLowerCase();
  if (normalizedType === 'runwareImageToVideo' && normalizedModel === 'alibaba:wan@2.6-flash') {
    return {
      durationSeconds: quantizeRunwareWan26FlashDuration(durationSeconds),
      rule: RUNWARE_WAN_26_FLASH_DURATION_RULE,
    };
  }
  return {
    durationSeconds,
    rule: 'provider-native-duration',
  };
};
