import {
  extractWanSingleImageVideoUrl,
  resolveWanSingleImageRuntime,
} from './imageVideo.js';

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

  test('uses self-hosted payload mode when the wan-mixed space is set directly', () => {
    const runtime = resolveWanSingleImageRuntime({
      space: 'eggman-poff/wan-mixed',
    });

    expect(runtime.selfHostedHugginfaceModel).toBe(true);
    expect(runtime.space).toBe('eggman-poff/wan-mixed');
    expect(runtime.endpoint).toBe('/generate_video_safe');
  });

  test('throws when the self-hosted safe endpoint returns a Gradio error string', () => {
    expect(() => extractWanSingleImageVideoUrl(
      { config: { root_url: 'https://eggman-poff-wan-s.hf.space', api_prefix: '/gradio_api' } },
      { data: [null, 'Error: The truth value of an array with more than one element is ambiguous. Use a.any() or a.all()'] }
    )).toThrow('Wan image-video: The truth value of an array with more than one element is ambiguous. Use a.any() or a.all()');
  });

  test('extracts the first valid Gradio file URL from the self-hosted response', () => {
    expect(extractWanSingleImageVideoUrl(
      { config: { root_url: 'https://eggman-poff-wan-s.hf.space', api_prefix: '/gradio_api' } },
      { data: [{ video: '/gradio_api/file=/tmp/gradio/demo/output.mp4' }] }
    )).toBe('https://eggman-poff-wan-s.hf.space/gradio_api/file=/tmp/gradio/demo/output.mp4');
  });
});
