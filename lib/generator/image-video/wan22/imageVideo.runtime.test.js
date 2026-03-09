import { resolveWanSingleImageRuntime } from './imageVideo.js';

describe('resolveWanSingleImageRuntime', () => {
  test('forces eggman-poff/wan-s when selfHostedHugginfaceModel is true', () => {
    const runtime = resolveWanSingleImageRuntime({
      selfHostedHugginfaceModel: true,
      space: 'Wan-AI/Wan-2.2-5B',
    });

    expect(runtime.selfHostedHugginfaceModel).toBe(true);
    expect(runtime.space).toBe('eggman-poff/wan-s');
    expect(runtime.endpoint).toBe('/generate_video_safe');
  });

  test('uses self-hosted payload mode when the wan-s space is set directly', () => {
    const runtime = resolveWanSingleImageRuntime({
      space: 'eggman-poff/wan-s',
    });

    expect(runtime.selfHostedHugginfaceModel).toBe(true);
    expect(runtime.space).toBe('eggman-poff/wan-s');
    expect(runtime.endpoint).toBe('/generate_video_safe');
  });
});
