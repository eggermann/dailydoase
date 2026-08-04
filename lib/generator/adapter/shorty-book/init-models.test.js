import { expect, test } from '@jest/globals';

import {
  isImageOnlySceneLoop,
  normalizeVideoModelType,
  resolveFirstLastVideoModelType,
  resolveContextImageModel,
  resolveVideoModelClass,
  shouldInitOpeningFluxContextModel,
  shouldInitFirstLastVideoModel,
} from './init-models.js';

test('isImageOnlySceneLoop accepts shell flags and remains off by default', () => {
  expect(isImageOnlySceneLoop({
    sceneLoop: { imageOnly: { enabled: '1' } },
  })).toBe(true);
  expect(isImageOnlySceneLoop({ sceneLoop: {} })).toBe(false);
});

test('resolveContextImageModel selects native Runware image generation', () => {
  expect(resolveContextImageModel({ provider: 'runware' })).toEqual(expect.objectContaining({
    init: expect.any(Function),
  }));
  expect(resolveContextImageModel({ hfProvider: 'RUNWARE' })).toBe(
    resolveContextImageModel({ provider: 'runware' })
  );
  expect(resolveContextImageModel({ provider: 'fal-ai' })).not.toBe(
    resolveContextImageModel({ provider: 'runware' })
  );
});

test('shouldInitFirstLastVideoModel disables first-last init when image-to-video-only is forced on model config', () => {
  expect(shouldInitFirstLastVideoModel({
    model: { forceImageToVideoOnly: true },
  })).toBe(false);
});

test('shouldInitFirstLastVideoModel accepts string truthy flags from wrappers', () => {
  expect(shouldInitFirstLastVideoModel({
    model: { forceImageToVideoOnly: '1' },
  })).toBe(false);
});

test('shouldInitFirstLastVideoModel still enables first-last init by default', () => {
  expect(shouldInitFirstLastVideoModel({
    model: {},
  })).toBe(true);
});

test('shouldInitOpeningFluxContextModel only enables the extra start-image model for flux-context mode', () => {
  expect(shouldInitOpeningFluxContextModel({
    sceneLoop: {
      openingImage: {
        enabled: true,
        mode: 'fluxContext',
      },
    },
  })).toBe(true);

  expect(shouldInitOpeningFluxContextModel({
    sceneLoop: {
      openingImage: {
        enabled: true,
        mode: 'cameraShot',
      },
    },
  })).toBe(false);
});

test('normalizeVideoModelType resolves ltx aliases for single-image video', () => {
  expect(normalizeVideoModelType('ltx')).toBe('ltxImageToVideo');
  expect(normalizeVideoModelType('ltxDistilled')).toBe('ltxImageToVideo');
  expect(normalizeVideoModelType('')).toBe('wanSingleImage');
});

test('resolveVideoModelClass picks the LTX adapter for ltx single-image video', () => {
  expect(resolveVideoModelClass('ltx')).toEqual(expect.objectContaining({
    type: 'ltxImageToVideo',
  }));
});

test('resolveFirstLastVideoModelType allows fal first-last override', () => {
  expect(resolveFirstLastVideoModelType({
    video: {
      model: {
        type: 'falFirstLast',
      },
    },
  })).toBe('falFirstLast');

  expect(resolveFirstLastVideoModelType({})).toBe('wanFirstLast');
});
