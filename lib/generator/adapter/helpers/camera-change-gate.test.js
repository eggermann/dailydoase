import { expect, test } from '@jest/globals';

import {
  compareCameraFrameSignatures,
  createCameraChangeGate,
} from './camera-change-gate.js';

const signature = (...pixels) => ({
  pixels: Buffer.from(pixels),
  width: pixels.length,
  height: 1,
});

test('compares grayscale frame signatures as average and changed-pixel ratios', () => {
  expect(compareCameraFrameSignatures(signature(0, 0, 0, 0), signature(0, 30, 0, 30), {
    pixelDelta: 20,
  })).toEqual({
    meanDifference: 15 / 255,
    changedPixelRatio: 0.5,
    comparable: true,
  });
});

test('requires two changed frames before spending a vision request', async () => {
  let timestamp = 0;
  const frames = [signature(0, 0), signature(0, 0), signature(80, 80), signature(80, 80)];
  const gate = createCameraChangeGate({
    now: () => timestamp,
    signatureReader: async () => frames.shift(),
    meanDifferenceThreshold: 0.05,
    changedPixelRatioThreshold: 0.05,
    requiredChangedFrames: 2,
    heartbeatMs: 10000,
  });

  const initial = await gate.evaluate({ imagePath: 'initial.jpg' });
  expect(initial).toEqual(expect.objectContaining({ shouldCheckVision: true, reason: 'initial-background' }));
  gate.recordVisionDecision({ gateResult: initial, hasPerson: false });

  timestamp = 1000;
  const unchanged = await gate.evaluate({ imagePath: 'unchanged.jpg' });
  expect(unchanged).toEqual(expect.objectContaining({ shouldCheckVision: false, reason: 'unchanged' }));

  timestamp = 2000;
  const firstChanged = await gate.evaluate({ imagePath: 'changed-1.jpg' });
  expect(firstChanged).toEqual(expect.objectContaining({ shouldCheckVision: false, pendingChangedFrames: 1 }));

  timestamp = 3000;
  const confirmed = await gate.evaluate({ imagePath: 'changed-2.jpg' });
  expect(confirmed).toEqual(expect.objectContaining({ shouldCheckVision: true, reason: 'confirmed-change', pendingChangedFrames: 2 }));
});

test('runs a heartbeat vision check for a still person after the interval', async () => {
  let timestamp = 0;
  const baseline = signature(20, 20);
  const gate = createCameraChangeGate({
    now: () => timestamp,
    signatureReader: async () => baseline,
    heartbeatMs: 30000,
  });

  const initial = await gate.evaluate({ imagePath: 'empty.jpg' });
  gate.recordVisionDecision({ gateResult: initial, hasPerson: false });

  timestamp = 29999;
  expect(await gate.evaluate({ imagePath: 'still.jpg' })).toEqual(expect.objectContaining({
    shouldCheckVision: false,
    reason: 'unchanged',
  }));

  timestamp = 30000;
  expect(await gate.evaluate({ imagePath: 'still.jpg' })).toEqual(expect.objectContaining({
    shouldCheckVision: true,
    reason: 'heartbeat',
  }));
});
