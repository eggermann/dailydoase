import {
  compareCameraFrameSignatures,
  readCameraFrameSignature,
} from '../helpers/camera-change-gate.js';

const VISUAL_PREPARATIONS = new Set(['continueFrame', 'fluxEdit']);

export const normalizeVisualPreparation = (value) => {
  const normalized = String(value || '').trim();
  return VISUAL_PREPARATIONS.has(normalized) ? normalized : 'continueFrame';
};

export const shouldPrepareVisualStateWithFlux = (scene = {}) => (
  normalizeVisualPreparation(scene?.visualPreparation) === 'fluxEdit'
);

export const evaluateVisualContinuityComparison = (comparison = {}, {
  maxMeanDifference = 0.26,
  maxChangedPixelRatio = 0.8,
} = {}) => {
  const meanDifference = Number(comparison?.meanDifference);
  const changedPixelRatio = Number(comparison?.changedPixelRatio);
  const comparable = comparison?.comparable === true
    && Number.isFinite(meanDifference)
    && Number.isFinite(changedPixelRatio);
  const rejected = comparable
    && meanDifference > maxMeanDifference
    && changedPixelRatio > maxChangedPixelRatio;

  return {
    comparable,
    rejected,
    meanDifference: Number.isFinite(meanDifference) ? meanDifference : null,
    changedPixelRatio: Number.isFinite(changedPixelRatio) ? changedPixelRatio : null,
    maxMeanDifference,
    maxChangedPixelRatio,
    reason: rejected ? 'composition-drift' : (comparable ? 'within-limits' : 'not-comparable'),
  };
};

export const compareVisualContinuity = async ({
  sourcePath,
  generatedPath,
  ...thresholds
} = {}) => {
  const [source, generated] = await Promise.all([
    readCameraFrameSignature(sourcePath),
    readCameraFrameSignature(generatedPath),
  ]);
  const comparison = compareCameraFrameSignatures(source, generated);
  return evaluateVisualContinuityComparison(comparison, thresholds);
};
