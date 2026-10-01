import { Taktmuster } from 'taktmuster';

import {
  isReferenceImageActorMode,
} from '../LiveContextOrchestrator-config.js';

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

export const createSceneRhythmController = ({
  story = {},
  resolveSceneCountFromConfig,
  resolveSceneLengthsInput,
  resolveSemanticSceneCount,
} = {}) => {
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
      return resolveSceneCountFromConfig({
        sceneLengths: [],
        sceneCount: null,
        defaultSceneCount: applySceneCountBias(sceneCountTaktmuster.nextSceneCount(), story.sceneCountBias),
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
    const withMultiplier = applySceneLengthMultiplier(plannedLengths, story.sceneLengthMultiplier);
    const withBias = applySceneLengthBias(withMultiplier, story.sceneLengthBias);

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
