import sharp from 'sharp';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const positiveInteger = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

const positiveNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const readCameraFrameSignature = async (imagePath, {
  width = 96,
  height = 72,
} = {}) => {
  const signatureWidth = positiveInteger(width, 96);
  const signatureHeight = positiveInteger(height, 72);
  const { data, info } = await sharp(imagePath)
    .rotate()
    .resize(signatureWidth, signatureHeight, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return {
    pixels: Buffer.from(data),
    width: info.width,
    height: info.height,
  };
};

export const compareCameraFrameSignatures = (baseline, current, {
  pixelDelta = 24,
} = {}) => {
  if (!baseline?.pixels || !current?.pixels || baseline.pixels.length !== current.pixels.length) {
    return {
      meanDifference: 1,
      changedPixelRatio: 1,
      comparable: false,
    };
  }

  const threshold = positiveNumber(pixelDelta, 24);
  let totalDifference = 0;
  let changedPixels = 0;
  for (let index = 0; index < current.pixels.length; index += 1) {
    const difference = Math.abs(current.pixels[index] - baseline.pixels[index]);
    totalDifference += difference;
    if (difference >= threshold) {
      changedPixels += 1;
    }
  }

  return {
    meanDifference: totalDifference / current.pixels.length / 255,
    changedPixelRatio: changedPixels / current.pixels.length,
    comparable: true,
  };
};

export const createCameraChangeGate = ({
  enabled = true,
  signatureReader = readCameraFrameSignature,
  width = 96,
  height = 72,
  meanDifferenceThreshold = 0.065,
  changedPixelRatioThreshold = 0.08,
  pixelDelta = 24,
  requiredChangedFrames = 2,
  heartbeatMs = 30000,
  now = () => Date.now(),
} = {}) => {
  const requiredFrames = positiveInteger(requiredChangedFrames, 2);
  const heartbeatInterval = positiveNumber(heartbeatMs, 30000);
  const meanThreshold = clamp(Number(meanDifferenceThreshold) || 0.065, 0, 1);
  const changedRatioThreshold = clamp(Number(changedPixelRatioThreshold) || 0.08, 0, 1);

  let baseline = null;
  let pendingChangedFrames = 0;
  let lastVisionCheckAt = 0;
  let hasVisionCheck = false;

  const evaluate = async ({ imagePath } = {}) => {
    const capturedAt = now();
    if (!enabled) {
      return { shouldCheckVision: true, reason: 'disabled', capturedAt };
    }

    const signature = await signatureReader(imagePath, { width, height });
    if (!baseline) {
      return {
        shouldCheckVision: true,
        reason: 'initial-background',
        signature,
        capturedAt,
        pendingChangedFrames,
      };
    }

    const comparison = compareCameraFrameSignatures(baseline, signature, { pixelDelta });
    const changed = comparison.meanDifference >= meanThreshold
      || comparison.changedPixelRatio >= changedRatioThreshold;
    pendingChangedFrames = changed ? pendingChangedFrames + 1 : 0;
    const heartbeatDue = !hasVisionCheck || capturedAt - lastVisionCheckAt >= heartbeatInterval;
    const changeConfirmed = pendingChangedFrames >= requiredFrames;

    return {
      shouldCheckVision: changeConfirmed || heartbeatDue,
      reason: changeConfirmed ? 'confirmed-change' : (heartbeatDue ? 'heartbeat' : 'unchanged'),
      signature,
      capturedAt,
      changed,
      pendingChangedFrames,
      ...comparison,
    };
  };

  const recordVisionDecision = ({ gateResult, hasPerson } = {}) => {
    const checkedAt = gateResult?.capturedAt || now();
    lastVisionCheckAt = checkedAt;
    hasVisionCheck = true;
    pendingChangedFrames = 0;
    if (!hasPerson && gateResult?.signature) {
      baseline = gateResult.signature;
    }
  };

  return {
    evaluate,
    recordVisionDecision,
    getState: () => ({
      hasBaseline: Boolean(baseline),
      pendingChangedFrames,
      lastVisionCheckAt,
      hasVisionCheck,
      requiredChangedFrames: requiredFrames,
      heartbeatMs: heartbeatInterval,
    }),
  };
};

export default {
  compareCameraFrameSignatures,
  createCameraChangeGate,
  readCameraFrameSignature,
};
