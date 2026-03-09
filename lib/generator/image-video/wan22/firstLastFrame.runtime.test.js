import { resolveWanFirstLastRuntime } from './firstLastFrame.js';

describe('resolveWanFirstLastRuntime', () => {
  test('forces eggman-poff/wan-flf2v when selfHostedHugginfaceModel is true', () => {
    const runtime = resolveWanFirstLastRuntime({
      selfHostedHugginfaceModel: true,
      space: 'cakegreen/Wan-2-2-first-last-frame',
    });

    expect(runtime.selfHostedHugginfaceModel).toBe(true);
    expect(runtime.space).toBe('eggman-poff/wan-flf2v');
    expect(runtime.endpoint).toBe('/generate_video');
  });

  test('uses configured space when self-hosted mode is disabled', () => {
    const runtime = resolveWanFirstLastRuntime({
      selfHostedHugginfaceModel: false,
      space: 'cakegreen/Wan-2-2-first-last-frame',
    });

    expect(runtime.selfHostedHugginfaceModel).toBe(false);
    expect(runtime.space).toBe('cakegreen/Wan-2-2-first-last-frame');
    expect(runtime.endpoint).toBe('/generate_video');
  });
});
