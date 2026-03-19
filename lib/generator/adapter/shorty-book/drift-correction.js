const TRUTHY_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSY_VALUES = new Set(['0', 'false', 'no', 'off', '']);

const DRIFT_CORRECTION_LEVEL_ALIASES = {
  default: 'default',
  off: 'off',
  none: 'off',
  disabled: 'off',
  moderate: 'moderate',
  medium: 'moderate',
  gentle: 'moderate',
  balanced: 'moderate',
  strong: 'aggressive',
  aggressive: 'aggressive',
  full: 'aggressive',
};

const resolveBoolean = (value, fallback = false) => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (TRUTHY_VALUES.has(normalized)) return true;
    if (FALSY_VALUES.has(normalized)) return false;
  }
  if (value === undefined || value === null) {
    return fallback;
  }
  return Boolean(value);
};

export const normalizeDriftCorrectionLevel = (value, fallback = 'default') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }

  return DRIFT_CORRECTION_LEVEL_ALIASES[normalized] || fallback;
};

export const resolveDriftCorrectionProfile = ({
  enabled = false,
  level = 'default',
  configMode = 'camera',
  applyToSingleImage,
  applyToFirstLast,
} = {}) => {
  const normalizedLevel = normalizeDriftCorrectionLevel(level, 'default');
  const explicitEnabled = resolveBoolean(enabled, false);
  const profileEnabled = normalizedLevel === 'off'
    ? false
    : (explicitEnabled || normalizedLevel !== 'default');

  const defaultApplyToSingleImage = normalizedLevel === 'moderate' || normalizedLevel === 'aggressive'
    ? true
    : configMode !== 'camera';
  const defaultApplyToFirstLast = normalizedLevel === 'aggressive';

  return {
    enabled: profileEnabled,
    level: normalizedLevel,
    applyToSingleImage: applyToSingleImage ?? defaultApplyToSingleImage,
    applyToFirstLast: applyToFirstLast ?? defaultApplyToFirstLast,
  };
};

export const resolveDriftCorrectionModelConfig = ({
  model = {},
  level = 'default',
  hasExplicitSteps = false,
  hasExplicitGuidance = false,
} = {}) => {
  const normalizedLevel = normalizeDriftCorrectionLevel(level, 'default');
  const resolvedModel = { ...(model || {}) };

  if (normalizedLevel === 'moderate') {
    if (!hasExplicitSteps) {
      resolvedModel.num_inference_steps = 24;
    }
    if (!hasExplicitGuidance) {
      resolvedModel.guidance_scale = 3.4;
    }
  }

  return resolvedModel;
};
