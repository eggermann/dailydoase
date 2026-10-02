import { Taktmuster } from 'taktmuster';

import {
  isReferenceImageActorMode,
} from '../LiveContextOrchestrator-config.js';

const PUBLIC_WAN_FIRST_LAST_MAX_DURATION_SECONDS = 5.1;
const MIN_SCENES_PER_20_SECONDS = 7.5;

const createTaktmusterRuntime = ({
  takt,
  taktCnt = takt,
  zaehler = 4,
  nenner = 4,
  type,
  initialPattern = [],
} = {}) => {
  const taktmuster = new Taktmuster();
  taktmuster.setTakt(taktCnt, zaehler, nenner);
  taktmuster.setType(type);

  const pendingInitialPattern = Array.isArray(initialPattern)
    ? initialPattern
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0)
      .map((value) => Math.round(value))
    : [];

  const nextTaktValue = () => {
    const step = taktmuster.getNext();
    const value = Number(step?.patternValue ?? step);
    return Number.isFinite(value) && value > 0 ? Math.round(value) : 1;
  };

  const nextSceneCount = () => {
    if (pendingInitialPattern.length > 0) {
      return pendingInitialPattern.shift();
    }
    return nextTaktValue();
  };

  return {
    taktCnt,
    zaehler,
    nenner,
    nextSceneCount,
    nextSceneLength: nextTaktValue,
  };
};

const applySceneCountBias = (value, bias) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 1;
  }

  const normalizedBias = Number(bias);
  if (!Number.isFinite(normalizedBias) || Math.abs(normalizedBias) < 0.0001) {
    return Math.max(1, Math.floor(parsed));
  }

  return Math.max(1, Math.floor(parsed + normalizedBias));
};

const applySceneLengthQualityFloor = (sceneLengths, minimumDuration) => sceneLengths.map((value) => {
  const minLength = Number(minimumDuration) || 1;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return minLength;
  }
  return Math.max(minLength, parsed);
});

const applySceneLengthMultiplier = (sceneLengths, multiplier) => {
  const normalizedMultiplier = Number(multiplier);
  if (!Number.isFinite(normalizedMultiplier)
    || normalizedMultiplier <= 0
    || Math.abs(normalizedMultiplier - 1) < 0.0001) {
    return sceneLengths;
  }

  return sceneLengths.map((value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return value;
    }
    return Number((parsed * normalizedMultiplier).toFixed(2));
  });
};

const applySceneLengthBias = (sceneLengths, bias) => {
  const normalizedBias = Number(bias);
  if (!Number.isFinite(normalizedBias) || Math.abs(normalizedBias) < 0.0001) {
    return sceneLengths;
  }

  return sceneLengths.map((value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return value;
    }
    return Number((parsed + normalizedBias).toFixed(2));
  });
};

/**
 * Turn Taktmuster values into whole-second scene lengths. Weights set each
 * scene's share, not its duration. Keep the base per scene, water-fill the
 * remaining target proportionally, and stop at each provider duration cap.
 * Largest fractional remainders receive rounding seconds without crossing caps.
 */
export const normalizeSceneLengthsToTarget = ({
  weights = [],
  targetTotalSeconds,
  sceneBaseSeconds = 2,
  maxSceneDurations = [],
} = {}) => {
  const normalizedWeights = (Array.isArray(weights) ? weights : [])
    .map((value) => Number(value))
    .map((value) => (Number.isFinite(value) && value > 0 ? value : 1));
  if (normalizedWeights.length === 0) {
    return [];
  }

  const base = Math.max(1, Math.round(Number(sceneBaseSeconds) || 2));
  const minimumTotal = normalizedWeights.length * base;
  const requestedTotal = Math.round(Number(targetTotalSeconds));
  const normalizedMaxima = normalizedWeights.map((_, index) => {
    const configuredMaximum = Number(maxSceneDurations[index]);
    return Number.isFinite(configuredMaximum) && configuredMaximum >= base
      ? Math.floor(configuredMaximum)
      : Number.POSITIVE_INFINITY;
  });
  const maximumTotal = normalizedMaxima.reduce((sum, value) => sum + value, 0);
  const target = Math.min(
    maximumTotal,
    Math.max(minimumTotal, Number.isFinite(requestedTotal) ? requestedTotal : minimumTotal)
  );
  const exact = normalizedWeights.map(() => base);
  let remaining = target - minimumTotal;
  let activeIndexes = normalizedWeights
    .map((_, index) => index)
    .filter((index) => normalizedMaxima[index] > exact[index]);

  while (remaining > 0 && activeIndexes.length > 0) {
    const activeWeightTotal = activeIndexes.reduce(
      (sum, index) => sum + normalizedWeights[index],
      0
    );
    let distributed = 0;

    activeIndexes.forEach((index) => {
      const weightedShare = remaining * (normalizedWeights[index] / activeWeightTotal);
      const available = normalizedMaxima[index] - exact[index];
      const addition = Math.min(weightedShare, available);
      exact[index] += addition;
      distributed += addition;
    });

    remaining -= distributed;
    activeIndexes = activeIndexes.filter((index) => (
      normalizedMaxima[index] - exact[index] > 0.000001
    ));
    if (distributed < 0.000001) {
      break;
    }
  }

  const rounded = exact.map((value) => Math.max(base, Math.floor(value)));
  let roundingDifference = Math.round(target) - rounded.reduce((sum, value) => sum + value, 0);
  const roundingOrder = rounded
    .map((_, index) => ({
      index,
      fractionalPart: exact[index] - Math.floor(exact[index]),
    }))
    .sort((left, right) => (
      (right.fractionalPart - left.fractionalPart)
      || (left.index - right.index)
    ));

  while (roundingDifference > 0 && roundingOrder.length > 0) {
    const candidate = roundingOrder.find(({ index }) => (
      rounded[index] + 1 <= normalizedMaxima[index]
    ));
    if (!candidate) {
      break;
    }
    rounded[candidate.index] += 1;
    roundingDifference -= 1;
    roundingOrder.splice(roundingOrder.indexOf(candidate), 1);
  }

  return rounded;
};

const resolveTargetTotalSeconds = ({
  targetTotalSeconds,
  suggestedTotalSeconds,
  minTotalSeconds = 20,
  maxTotalSeconds = 45,
} = {}) => {
  const min = Math.max(1, Math.round(Number(minTotalSeconds) || 20));
  const max = Math.max(min, Math.round(Number(maxTotalSeconds) || 45));
  const explicit = targetTotalSeconds === null || targetTotalSeconds === undefined || targetTotalSeconds === ''
    ? Number.NaN
    : Number(targetTotalSeconds);
  const suggested = Number(suggestedTotalSeconds);
  const requested = Number.isFinite(explicit)
    ? explicit
    : (Number.isFinite(suggested) ? suggested : min);
  return Math.min(max, Math.max(min, Math.round(requested)));
};

const resolveSceneDurationCaps = (story, sceneCount) => {
  const firstSceneMode = String(story.firstClipVideoMode || 'singleImage');
  const laterCap = story.mode === 'camera'
    ? Number(story.cameraFirstLastMaxDurationSeconds)
    : PUBLIC_WAN_FIRST_LAST_MAX_DURATION_SECONDS;
  const configuredFirstCap = firstSceneMode === 'singleImage'
    ? [
        story.singleImageMaxDuration,
        isReferenceImageActorMode(story.mode) ? story.cameraSingleImageStabilityMaxDuration : null,
      ]
      .map(Number)
      .filter((value) => Number.isFinite(value) && value > 0)
      .reduce((minimum, value) => Math.min(minimum, value), Number.POSITIVE_INFINITY)
    : (story.mode === 'camera'
      ? Number(story.cameraFirstLastMaxDurationSeconds)
      : PUBLIC_WAN_FIRST_LAST_MAX_DURATION_SECONDS);
  const firstCap = Number.isFinite(configuredFirstCap) && configuredFirstCap > 0
    ? configuredFirstCap
    : laterCap;

  return Array.from({ length: sceneCount }, (_, index) => {
    const maximum = index === 0 ? firstCap : laterCap;
    return Number.isFinite(maximum) && maximum > 0
      ? Math.floor(maximum)
      : Number.POSITIVE_INFINITY;
  });
};

const resolveMinimumSceneCountForDuration = (story, targetTotalSeconds) => {
  const minimumTotal = Math.max(1, Number(targetTotalSeconds) || Number(story.minTotalSeconds) || 20);
  const base = Math.max(1, Number(story.sceneBaseSeconds) || 2);
  const firstCap = resolveSceneDurationCaps(story, 1)[0];
  const laterCap = resolveSceneDurationCaps(story, 2)[1];
  let sceneCount = 1;
  let availableTotal = firstCap;

  while (availableTotal < minimumTotal && sceneCount < 1000) {
    sceneCount += 1;
    availableTotal += laterCap;
    if (!Number.isFinite(availableTotal) || laterCap <= base) {
      return sceneCount;
    }
  }

  return sceneCount;
};

const resolveTaktSceneCountForTarget = (story, taktValue, targetTotalSeconds) => {
  const desiredSceneCount = Math.max(
    1,
    (Math.max(1, Number(targetTotalSeconds) || 20) / 20) * MIN_SCENES_PER_20_SECONDS
  );
  const lowerCount = Math.floor(desiredSceneCount);
  const upperCount = Math.ceil(desiredSceneCount);

  if (lowerCount === upperCount) {
    return lowerCount;
  }

  const maximumTaktValue = Math.max(1, Number(story.sceneCountTaktmusterZaehler) || 4);
  const normalizedTaktValue = maximumTaktValue > 1
    ? Math.min(1, Math.max(0, (Number(taktValue) - 1) / (maximumTaktValue - 1)))
    : 0;
  const upperCountThreshold = upperCount - desiredSceneCount;

  return normalizedTaktValue >= upperCountThreshold ? upperCount : lowerCount;
};

export const createSceneRhythmController = ({
  story = {},
  resolveSceneCountFromConfig,
  resolveSceneLengthsInput,
  resolveSemanticSceneCount,
} = {}) => {
  let iterationTargetTotalSeconds = null;
  let resolvedSceneLengths = Array.isArray(story.lengths) ? [...story.lengths] : [];
  let sceneLengthSource = resolvedSceneLengths;
  let sceneLengthIndex = 0;
  let activeSceneDuration = resolvedSceneLengths[0] || 3;

  const sceneCountTaktmuster = createTaktmusterRuntime({
    taktCnt: story.sceneCountTaktmusterCount,
    zaehler: story.sceneCountTaktmusterZaehler,
    nenner: story.sceneCountTaktmusterNenner,
    type: story.sceneCountTaktmusterType,
    initialPattern: story.sceneCountInitialPattern,
  });

  // One persistent scene-count stream: one getNext() per iteration. The
  // semantic aspect stream uses its own Taktmuster and never consumes this
  // scene-count rhythm.

  const sceneLengthTaktmuster = createTaktmusterRuntime({
    takt: story.sceneLengthTaktmusterTakt,
    type: story.sceneLengthTaktmusterType,
  });

  const nextSceneDuration = () => {
    const nextLength = resolvedSceneLengths[sceneLengthIndex % resolvedSceneLengths.length]
      || activeSceneDuration;
    sceneLengthIndex += 1;
    activeSceneDuration = nextLength;
    return activeSceneDuration;
  };

  const setActiveSceneDuration = (value) => {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      activeSceneDuration = parsed;
    }
    return activeSceneDuration;
  };

  const currentSceneDuration = () => activeSceneDuration;

  const resolveSingleImageDuration = (value) => {
    const plannedDuration = Number(value);
    const normalizedDuration = Number.isFinite(plannedDuration) && plannedDuration > 0
      ? plannedDuration
      : currentSceneDuration();
    const cameraStabilityMax = isReferenceImageActorMode(story.mode)
      ? Number(story.cameraSingleImageStabilityMaxDuration)
      : null;
    const configuredMax = Number(story.singleImageMaxDuration);
    const effectiveMax = [configuredMax, cameraStabilityMax]
      .filter((candidate) => Number.isFinite(candidate) && candidate > 0)
      .reduce((minValue, candidate) => (minValue === null ? candidate : Math.min(minValue, candidate)), null);

    if (Number.isFinite(effectiveMax) && effectiveMax > 0) {
      return Math.min(normalizedDuration, effectiveMax);
    }
    return normalizedDuration;
  };

  const currentSingleImageDuration = () => resolveSingleImageDuration(currentSceneDuration());

  const applyRequestedSceneDurations = (scenePlan = []) => scenePlan.map((scene) => {
    const plannedDuration = Number(scene?.durationSeconds);
    const normalizedDuration = Number.isFinite(plannedDuration) && plannedDuration > 0
      ? plannedDuration
      : null;

    return {
      ...scene,
      requestedDurationSeconds: scene?.videoMode === 'singleImage'
        ? resolveSingleImageDuration(normalizedDuration)
        : normalizedDuration,
    };
  });

  const resolveSceneCount = () => {
    const hasExplicitSceneCount = Number.isFinite(Number(story.count)) && Number(story.count) > 0;
    const hasExplicitSceneLengths = Array.isArray(sceneLengthSource) && sceneLengthSource.length > 0;

    // In takt mode the persistent Taktmuster is the scene-count authority.
    // An explicit count belongs to the fixed-count mode; otherwise it would
    // silently stop the rhythm after the first iteration.
    if (story.sceneCountMode === 'taktmuster') {
      const sceneCountTaktValue = sceneCountTaktmuster.nextSceneCount();
      // The scene-count rhythm must never turn a 20-second target into a
      // 20-to-45-second runtime range. Taktmuster distributes the fixed target
      // over scenes; only an explicit target changes the film length.
      iterationTargetTotalSeconds = story.targetTotalSeconds
        ?? story.minTotalSeconds
        ?? 20;
      const taktSceneCount = story.normalizeSceneDurationsToTarget
        && story.useTaktmusterLengths
        ? resolveTaktSceneCountForTarget(
            story,
            sceneCountTaktValue,
            iterationTargetTotalSeconds
          )
        : applySceneCountBias(sceneCountTaktValue, story.sceneCountBias);
      const minimumDurationSceneCount = story.normalizeSceneDurationsToTarget
        && story.useTaktmusterLengths
        ? resolveMinimumSceneCountForDuration(story, iterationTargetTotalSeconds)
        : 1;
      const baseDuration = Math.max(1, Number(story.sceneBaseSeconds) || 2);
      const maximumDurationSceneCount = story.normalizeSceneDurationsToTarget
        && story.useTaktmusterLengths
        ? Math.max(
            minimumDurationSceneCount,
            Math.floor((Number(story.maxTotalSeconds) || 45) / baseDuration)
          )
        : Number.POSITIVE_INFINITY;
      return resolveSceneCountFromConfig({
        sceneLengths: [],
        sceneCount: null,
        defaultSceneCount: Math.max(
          minimumDurationSceneCount,
          Math.min(taktSceneCount, maximumDurationSceneCount)
        ),
      });
    }

    if (story.sceneCountMode === 'semantic' && !hasExplicitSceneCount && !hasExplicitSceneLengths) {
      return resolveSemanticSceneCount({ words: story.words });
    }

    return resolveSceneCountFromConfig({
      sceneLengths: story.useTaktmusterLengths ? [] : sceneLengthSource,
      sceneCount: story.count,
      defaultSceneCount: story.useTaktmusterLengths
        ? applySceneCountBias(sceneCountTaktmuster.nextSceneCount(), story.sceneCountBias)
        : story.count,
    });
  };

  const refreshResolvedSceneLengths = async (sceneCount) => {
    const nextSource = story.useTaktmusterLengths
      ? sceneLengthTaktmuster.nextSceneLength
      : story.lengths;

    sceneLengthSource = nextSource;
    const plannedLengths = await resolveSceneLengthsInput(nextSource, sceneCount, 3);
    const sceneBaseSeconds = Math.max(1, Number(story.sceneBaseSeconds) || 2);
    const suggestedTotalSeconds = plannedLengths.reduce(
      (sum, value) => sum + (Number(value) || 0),
      0
    );
    const sceneDurationCaps = resolveSceneDurationCaps(story, sceneCount);
    const normalizedLengths = story.normalizeSceneDurationsToTarget && story.useTaktmusterLengths
      ? normalizeSceneLengthsToTarget({
          weights: plannedLengths,
          maxSceneDurations: sceneDurationCaps,
          targetTotalSeconds: resolveTargetTotalSeconds({
            targetTotalSeconds: story.targetTotalSeconds ?? iterationTargetTotalSeconds,
            suggestedTotalSeconds,
            minTotalSeconds: story.minTotalSeconds,
            maxTotalSeconds: story.maxTotalSeconds,
          }),
          sceneBaseSeconds,
        })
      : plannedLengths;
    const withMultiplier = story.normalizeSceneDurationsToTarget && story.useTaktmusterLengths
      ? normalizedLengths
      : applySceneLengthMultiplier(plannedLengths, story.sceneLengthMultiplier);
    const withBias = story.normalizeSceneDurationsToTarget && story.useTaktmusterLengths
      ? withMultiplier
      : applySceneLengthBias(withMultiplier, story.sceneLengthBias);

    resolvedSceneLengths = applySceneLengthQualityFloor(
      withBias,
      story.minSceneDurationSeconds
    );
    sceneLengthIndex = 0;
    activeSceneDuration = resolvedSceneLengths[0] || 3;
    return resolvedSceneLengths;
  };

  return {
    applyRequestedSceneDurations,
    currentSceneDuration,
    currentSingleImageDuration,
    nextSceneDuration,
    refreshResolvedSceneLengths,
    resolveSceneCount,
    setActiveSceneDuration,
  };
};

export default createSceneRhythmController;
