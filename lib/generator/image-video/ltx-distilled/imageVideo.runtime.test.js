import { DEFAULT_LTX_IMAGE_VIDEO_SPACE, PostToLtxDistilled_ImageVideo } from './imageVideo.js';

describe('PostToLtxDistilled_ImageVideo', () => {
  test('uses the official LTX space by default', () => {
    const model = new PostToLtxDistilled_ImageVideo({});

    expect(model.config.space).toBe(DEFAULT_LTX_IMAGE_VIDEO_SPACE);
  });

  test('allows overriding the LTX gradio space for self-hosted Hugging Face apps', () => {
    const model = new PostToLtxDistilled_ImageVideo({
      space: 'eggman-poff/ltx-i2v',
    });

    expect(model.config.space).toBe('eggman-poff/ltx-i2v');
  });

  test('accepts WAN-style aliases for height, width, duration, guidance, and seed', () => {
    const model = new PostToLtxDistilled_ImageVideo({});
    const payload = model.buildPayload('A calm portrait becomes animated.', '/tmp/input.png', {
      height: 513,
      width: 705,
      duration_seconds: 3.4,
      guide_scale: 4,
      seed: 99,
      randomize_seed: false,
    });

    expect(payload.height_ui).toBe(544);
    expect(payload.width_ui).toBe(736);
    expect(payload.duration_ui).toBe(3.4);
    expect(payload.ui_guidance_scale).toBe(4);
    expect(payload.seed_ui).toBe(99);
    expect(payload.randomize_seed).toBe(false);
    expect(payload.mode).toBe('image-to-video');
  });
});
