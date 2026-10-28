import { createHash } from 'node:crypto';
import { describe, expect, test } from '@jest/globals';
import { buildAudioDirectionRequest, buildAudioPrompt } from '../../eu-reski-news/news-scene/audio-director.mjs';
import { buildImageTask, buildPlanRequest } from '../../eu-reski-news/news-scene/planner.mjs';
import { buildTimingRequest } from '../../eu-reski-news/news-scene/scene-timing.mjs';
import { buildGrokVideoPrompt, buildVideoDirectionRequest } from '../../eu-reski-news/news-scene/video-director.mjs';

const sha256 = (value) => createHash('sha256')
  .update(typeof value === 'string' ? value : JSON.stringify(value))
  .digest('hex');

const article = {
  id: 'golden-article',
  title: 'A bridge opens between two towns',
  publish_date: '2026-01-02',
  url: 'https://example.test/a',
  source_country: 'Belgium',
  language: 'en',
  summary: 'A new bridge connects two towns.',
  text: 'Residents cross a newly opened bridge.',
};
const semantic = { entries: [] };
const catalog = [];
const images = [];
const visualStyleOptions = { symbolic: true, roomDeepness: false, layering: 2 };
const plan = {
  storyPremise: 'A bridge joins separated routines.',
  protagonist: { name: 'Mira' },
  scenes: [1, 2].map((index) => ({
    index,
    title: `Scene ${index}`,
    storyBeat: `Beat ${index}`,
    protagonistAction: `Mira crosses section ${index}.`,
    dramaticFunction: index === 1 ? 'setup' : 'resolution',
    durationSeconds: 5,
    stillPrompt: `A monochrome cubist mural frame ${index}.`,
    videoPrompt: `Mira crosses the bridge in scene ${index} with one measured gesture, then settles into stillness.`,
  })),
};
const record = {
  plan,
  results: [
    { path: 'media/scene-1.png', sha256: 'a'.repeat(64) },
    { path: 'media/scene-2.png', sha256: 'b'.repeat(64) },
  ],
  visualStyleOptions,
};

async function plannerHash(options = {}) {
  const built = await buildPlanRequest({
    article,
    semantic,
    catalog,
    sceneCount: 2,
    visualStyleOptions,
    images,
    model: 'gpt-4.1-mini',
    ...options,
  });
  return sha256(built.request);
}

describe('non-auto prompt golden masters', () => {
  test('preserves manual story planning requests and all Guernica reference variants', async () => {
    await expect(plannerHash({ styleReferenceProvided: true, articleImageReferenceProvided: false, figureReferenceProvided: true }))
      .resolves.toBe('5adfc3d6b2f9e0a6aed3686906baa1a99c895554acd434d1019e4817fa629ca0');
    await expect(plannerHash({ sceneVisualControls: true, styleReferenceProvided: true, articleImageReferenceProvided: true, figureReferenceProvided: true }))
      .resolves.toBe('8338e48b6ba4da040ac9c826849efa216b1a9563417f05ae2cc91e83bedef403');
    await expect(plannerHash({ legacyGuernicaStyleReferencePrompt: true, styleReferenceProvided: true, figureReferenceProvided: true }))
      .resolves.toBe('12805a3bb14ba71b0a30055387493d7f7a40ad1d9964c00bdd09241a40565c66');
    await expect(plannerHash({ styleReferenceProvided: false, articleImageReferenceProvided: true, figureReferenceProvided: false }))
      .resolves.toBe('637c4c39389bae80a94ddf9dfd970153ac824dc1274d5ecc35c223d7b20ab71c');
  });

  test('preserves manual timing, video direction, and audio direction requests', () => {
    const timing = buildTimingRequest({
      plan,
      sceneDurations: [5, 5],
      sceneDurationSettings: { minimum: 3, maximum: 8, provider: 'Taktmuster' },
      visualStyleOptions,
      model: 'gpt-4.1-mini',
    });
    const video = buildVideoDirectionRequest({
      record,
      vision: null,
      model: 'gpt-4.1-mini',
      videoMode: 'image_to_video',
      audioDirection: 'off',
      noDialogueNarration: true,
      maxZoom: 0.08,
    });
    const audio = buildAudioDirectionRequest({ record, model: 'gpt-4.1-mini', noDialogueNarration: true });

    expect(sha256(timing)).toBe('b479bd79f42fd9a9c8509258bdbcab19739c551308b70d60001107940120d47d');
    expect(sha256(video)).toBe('50430b76415d4840ea4b2f4fbe053da533d6803b5ab4411e58ef4f57da59165a');
    expect(sha256(audio)).toBe('7355bcb057da5156a543a07d3bfc37617dbf4b3f55ebd8409abad09d3dbf2e76');
  });

  test('preserves the exact still prompt and image reference task payload', () => {
    const scene = { stillPrompt: 'A monochrome cubist mural frame 1.' };
    expect(sha256(buildImageTask(scene, 'golden-task', [])))
      .toBe('c77534fbb680e2f3d02b5f49b4fbd762e220a53693052de9e0c8f0f814961f6a');
    expect(sha256(buildImageTask(scene, 'golden-task', ['figure-data', 'guernica-style-data', 'article-photo-data'])))
      .toBe('1527a3a30aa996240e567d49c71f41bf2c7061088e7a22514692366bdbac0ad8');
  });

  test('preserves manual video and audio prompts byte for byte', () => {
    const videoPrompt = buildGrokVideoPrompt({
      visualPrompt: plan.scenes[0].videoPrompt,
      cameraMotion: {
        type: 'pan', direction: 'left', description: 'A restrained pan follows Mira.',
        startFraming: 'wide', endFraming: 'medium', zoomAmount: 0.02,
      },
      audioDirection: 'off',
      maxZoom: 0.08,
    });
    const audioPrompt = buildAudioPrompt({
      intentionalSilence: true,
      silenceReason: 'Let the crossing breathe.',
      ambientTexture: 'A low wind across the bridge.',
      soundEvents: [],
      continuityFromPrevious: 'The wind emerges from silence.',
      continuityToNext: 'The wind continues.',
      spokenKind: 'none',
      spokenText: '',
    }, {
      overallConcept: 'Sparse wind and silence.',
      musicPolicy: 'No music.',
      recurringMotifs: [],
    }, true);

    expect(sha256(videoPrompt)).toBe('5e0348c2b4e430f2a67a2160b593244f53af0c659531658714c471cdfdc358ad');
    expect(sha256(audioPrompt)).toBe('c3e536d61aa83b49603e3cb93866ddc66606365a323aecdb16de7851784b9b66');
  });
});
