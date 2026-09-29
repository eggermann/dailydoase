import { createMediaProviders } from './media-providers.js';

const createConfig = (overrides = {}) => ({
  story: {
    mode: 'reference-image-actor',
    cameraStyle: 'ordinary webcam snapshot',
    singleVideoPromptFlavor: '',
    ...overrides.story,
  },
  camera: { sourceLabel: 'test camera' },
  models: {
    imageSeed: 1,
    videoSeed: 2,
    firstLastVideoModelType: 'wanFirstLast',
    firstLastVideoModel: '',
    singleVideoModelType: 'wanSingleImage',
    singleVideoModel: '',
    wanFirstLastSpace: 'first-last-space',
    wanSingleSpace: 'single-space',
    ltxSingleSpace: 'ltx-space',
    useSelfHostedFirstLast: false,
    useSelfHostedSingle: false,
    wanFirstLastSelfHostedSpace: '',
    wanSingleSelfHostedSpace: '',
    wanFirstLastFallbackSpaces: [],
    wanSingleFallbackSpaces: [],
    ltxSingleFallbackSpaces: [],
    mireloModelVersion: 'mirelo-test',
  },
  render: {
    fluxVariant: 'flux-test',
    image: {
      width: 512,
      height: 512,
      numInferenceSteps: 4,
      guidanceScale: 3,
      negativePrompt: 'bad',
    },
    video: {
      aspectRatio: '1:1',
      first: {
        steps: 4,
        width: 512,
        height: 512,
        guidanceScale: 3,
        fps: 8,
        randomizeSeed: false,
        customMaxArea: 262144,
      },
      single: {
        height: 512,
        width: 512,
        fps: 8,
        samplingSteps: 4,
        guideScale: 3,
        shift: 1,
      },
    },
    mirelo: {
      steps: 4,
      creativityCoef: 0.5,
    },
  },
});

const dependencies = {
  useWebcamPersonaReference: false,
  createImagePrompt: () => 'image prompt',
  createFirstLastPrompt: () => 'first-last prompt',
  createSingleImagePrompt: () => 'single prompt',
  getFrameVision: async () => '',
  getContinuityFrameVision: async () => '',
  setActiveSceneDuration: () => {},
  nextSceneDuration: () => 4,
  currentSceneDuration: () => 4,
  currentSingleImageDuration: () => 4,
};

test('builds provider contracts from injected runtime state', () => {
  const providers = createMediaProviders({
    config: createConfig(),
    dependencies,
  });

  expect(providers.image.prompts.create()).toBe('image prompt');
  expect(providers.video.prompts.create).toBe('first-last prompt');
  expect(providers.video2.prompts.create).toBe('single prompt');
  expect(providers.video2.model.duration_seconds()).toBe(4);
  expect(providers.singleVideoPromptFlavor).toBe('default');
});
