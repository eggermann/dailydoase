import { expect, test } from '@jest/globals';

import { shouldInitFirstLastVideoModel } from './init-models.js';

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
