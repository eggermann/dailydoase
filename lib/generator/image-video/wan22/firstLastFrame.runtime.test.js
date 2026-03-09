import { buildWanFirstLastSelfHostedPayload, resolveWanFirstLastRuntime } from './firstLastFrame.js';

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

  test('builds self-hosted payload with first_image and last_image fields', () => {
    const payload = buildWanFirstLastSelfHostedPayload({
      tmpStart: '/tmp/start.png',
      tmpEnd: '/tmp/end.png',
      options: {
        prompt: 'move naturally',
        duration_seconds: 4,
        randomize_seed: false,
        seed: 7,
      },
      config: {
        steps: 12,
        guidance_scale: 3.5,
      },
      durationSeconds: 4,
    });

    expect(payload.first_image).toBeDefined();
    expect(payload.last_image).toBeDefined();
    expect(payload.prompt).toBe('move naturally');
    expect(payload.seed).toBe(7);
    expect(payload.randomize_seed).toBe(false);
    expect(payload).not.toHaveProperty('start_image_pil');
    expect(payload).not.toHaveProperty('end_image_pil');
  });
});
