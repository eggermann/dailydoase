const DEFAULT_SELF_HOSTED_SPACE_HOURLY_USD = Object.freeze({
  'eggman-poff/wan-mixed': 2.5,
});

const roundMoney = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 10000) / 10000;
};

const normalizeId = (value) => String(value || '').trim().toLowerCase();

const pickFirstFiniteNumber = (...values) => {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return null;
};

const normalizeResolution = ({ resolution, width, height, fallback = '' } = {}) => {
  const normalized = String(resolution || '').trim().toLowerCase();
  if (normalized === '480p' || normalized === '720p' || normalized === '1080p') {
    return normalized;
  }

  const resolvedWidth = width === null || width === undefined || width === '' ? NaN : Number(width);
  const resolvedHeight = height === null || height === undefined || height === '' ? NaN : Number(height);
  if (!Number.isFinite(resolvedWidth) || !Number.isFinite(resolvedHeight)) {
    return fallback;
  }

  const maxDimension = Math.max(resolvedWidth, resolvedHeight);
  const area = resolvedWidth * resolvedHeight;
  if (maxDimension <= 854 && area <= 854 * 480) return '480p';
  if (maxDimension <= 1280 && area <= 1280 * 720) return '720p';
  if (maxDimension <= 1920 && area <= 1920 * 1080) return '1080p';
  return fallback;
};

export const resolveSelfHostedSpaceHourlyUsd = ({ space = '', config = {}, env = process.env } = {}) => {
  const configuredRate = pickFirstFiniteNumber(
    config.selfHostedHourlyUsd,
    config.selfHostedHourlyRateUsd,
    env.FRESHWEB_WAN_SELF_HOSTED_HOURLY_USD,
    env.WAN_SELF_HOSTED_HOURLY_USD,
    env.WAN_SELF_HOSTED_SPACE_HOURLY_USD
  );
  if (configuredRate !== null) {
    return configuredRate;
  }

  const normalizedSpace = normalizeId(space);
  return DEFAULT_SELF_HOSTED_SPACE_HOURLY_USD[normalizedSpace] ?? null;
};

export const estimateHourlyRunCostUsd = ({ elapsedMs = 0, hourlyUsd = null } = {}) => {
  const resolvedElapsedMs = Number(elapsedMs);
  const resolvedHourlyUsd = Number(hourlyUsd);
  if (!Number.isFinite(resolvedElapsedMs) || resolvedElapsedMs < 0) return null;
  if (!Number.isFinite(resolvedHourlyUsd) || resolvedHourlyUsd < 0) return null;
  return roundMoney((resolvedElapsedMs / 1000 / 3600) * resolvedHourlyUsd);
};

export const estimateFalWanCostUsd = ({
  model = '',
  resolution = '',
  width = null,
  height = null,
  numFrames = null,
  durationSeconds = null,
} = {}) => {
  const normalizedModel = normalizeId(model);
  if (!normalizedModel.includes('wan')) {
    return null;
  }

  const resolvedResolution = normalizeResolution({ resolution, width, height, fallback: '' });
  if (normalizedModel.includes('wan/v2.7/image-to-video')) {
    const seconds = Number(durationSeconds);
    if (!Number.isFinite(seconds) || seconds <= 0) {
      return null;
    }
    const perSecond = resolvedResolution === '1080p' ? 0.15 : 0.1;
    return roundMoney(perSecond * seconds);
  }

  const basePrice = resolvedResolution === '480p'
    ? 0.2
    : resolvedResolution === '720p'
      ? 0.4
      : null;
  if (basePrice === null) {
    return null;
  }

  const frames = Number(numFrames);
  const multiplier = Number.isFinite(frames) && frames > 81 ? 1.25 : 1;
  return roundMoney(basePrice * multiplier);
};

export const buildVideoRunMetrics = ({
  runtime = '',
  provider = '',
  model = '',
  space = '',
  elapsedMs = 0,
  outputDurationSeconds = null,
  estimatedCostUsd = null,
  hourlyUsd = null,
  resolution = '',
  width = null,
  height = null,
  numFrames = null,
  costSource = '',
} = {}) => {
  const resolvedElapsedMs = Number(elapsedMs);
  const elapsedSeconds = Number.isFinite(resolvedElapsedMs)
    ? Math.round((resolvedElapsedMs / 1000) * 100) / 100
    : null;
  const durationSeconds = outputDurationSeconds === null || outputDurationSeconds === undefined || outputDurationSeconds === ''
    ? null
    : Number(outputDurationSeconds);
  const resolvedWidth = width === null || width === undefined || width === '' ? null : Number(width);
  const resolvedHeight = height === null || height === undefined || height === '' ? null : Number(height);
  const resolvedNumFrames = numFrames === null || numFrames === undefined || numFrames === '' ? null : Number(numFrames);

  return {
    runtime: runtime || '',
    provider: provider || '',
    model: model || '',
    space: space || '',
    elapsedMs: Number.isFinite(resolvedElapsedMs) ? Math.round(resolvedElapsedMs) : null,
    elapsedSeconds,
    outputDurationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : null,
    estimatedCostUsd: roundMoney(estimatedCostUsd),
    hourlyUsd: roundMoney(hourlyUsd),
    resolution: normalizeResolution({
      resolution,
      width: resolvedWidth,
      height: resolvedHeight,
      fallback: '',
    }) || String(resolution || ''),
    width: Number.isFinite(resolvedWidth) ? resolvedWidth : null,
    height: Number.isFinite(resolvedHeight) ? resolvedHeight : null,
    numFrames: Number.isFinite(resolvedNumFrames) ? resolvedNumFrames : null,
    costSource: costSource || '',
  };
};

export const formatVideoRunSummary = (metrics = {}) => {
  const parts = ['[video-run]'];
  if (metrics.runtime) parts.push(`runtime=${metrics.runtime}`);
  if (metrics.provider) parts.push(`provider=${metrics.provider}`);
  if (metrics.space) parts.push(`space=${metrics.space}`);
  if (metrics.model) parts.push(`model=${metrics.model}`);
  if (metrics.elapsedSeconds !== null) parts.push(`elapsed=${metrics.elapsedSeconds}s`);
  if (metrics.outputDurationSeconds !== null) parts.push(`output=${metrics.outputDurationSeconds}s`);
  if (metrics.resolution) parts.push(`resolution=${metrics.resolution}`);
  if (metrics.numFrames !== null) parts.push(`frames=${metrics.numFrames}`);
  if (metrics.hourlyUsd !== null) parts.push(`hourly=$${metrics.hourlyUsd}/h`);
  if (metrics.estimatedCostUsd !== null) parts.push(`estimatedCost=$${metrics.estimatedCostUsd}`);
  if (metrics.costSource) parts.push(`costSource=${metrics.costSource}`);
  return parts.join(' ');
};
