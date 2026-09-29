import { describe, expect, jest, test } from '@jest/globals';
import {
  createMiniMaxMusic3State,
  createStoryMusicBlueprint,
  createStoryMusicSource,
  requestMiniMaxMusic3,
} from './story-music.js';

const transport = {
  iteration: 2,
  topic: 'animal',
  topics: ['love', 'animal'],
  location: 'Indoors',
  people: { actors: [{ personaId: 'cast-002', description: 'woman in a blue top' }] },
  cast: { actorReferences: [{ personaId: 'cast-001', description: 'man in a black shirt', lastSelectedIteration: 2 }] },
  story: {
    summary: 'An off-frame hand places a tiny paper animal marked with a heart into her palm. The moment follows Friendship S2CID (identifier). -> A returning visitor lightly presses the heart outline, sealing a small celebration.',
    scenes: [
      { sceneIndex: 1, storyBeat: 'An off-frame hand places a tiny paper animal marked with a heart into her palm.', actorsInteraction: 'The thumb brushes her hand before withdrawing.' },
      { sceneIndex: 2, storyBeat: 'A returning visitor lightly presses the heart outline, sealing a small celebration.', actorsInteraction: 'Their fingertips meet over the heart.' },
    ],
  },
  iterationHistory: [{
    iteration: 1,
    story: {
      scenes: [{ sceneIndex: 1, storyBeat: 'A man in black folds a paper shape beside a blue light.', actorsInteraction: 'He taps a three-note rhythm on the table.' }],
    },
  }],
};

const blueprint = {
  title: 'Paper Animal Heart',
  durationSeconds: 60,
  musicalDramaturgyMap: {
    personCiphers: [
      { cipher: 'BLUE', observedWords: ['blue top'], role: 'bright high vocal answer' },
      { cipher: 'BLACK', observedWords: ['black shirt'], role: 'low rhythmic call' },
    ],
    wordChains: [
      { sourceWord: 'paper animal', chain: ['paper animal', 'fold', 'origami', 'paper zoo'] },
      { sourceWord: 'heart', chain: ['heart', 'outline', 'pulse', 'dancefloor stamp'] },
    ],
    musicalMotifs: [
      { ownerCipher: 'BLUE', motif: 'three bright felt-piano notes rising' },
      { ownerCipher: 'BLACK', motif: 'short black-key bass answer' },
    ],
    semanticDrift: [{
      sourceMaterial: 'paper animal marked with a heart',
      chain: ['paper animal', 'origami creature', 'paper zoo', 'dancefloor safari'],
      inventedDestination: 'dancefloor safari',
      semanticLineage: 'Paper folds become origami, then a paper zoo, then its party version.',
    }],
    sceneArc: [{
      arc: 'Folded invitation becomes shared party pulse',
      sourceScenes: ['iteration-0001-scene-01', 'iteration-0002-scene-01', 'iteration-0002-scene-02'],
      dramaticFunction: 'Build from private tactile cue to communal release.',
    }],
    interactionMapping: [{
      sourceScenes: ['iteration-0002-scene-01', 'iteration-0002-scene-02'],
      observedInteraction: 'A hand places the paper animal, then fingertips meet over its heart.',
      musicalTranslation: 'Bass call hands off to high vocal response; fingertip press locks handclaps to shared pulse.',
    }],
  },
  global_meta: 'Global Metadata\nBasic Attributes: 112 BPM, D major scale, surreal harmonic party-pop with warm acoustic guitar, felt piano, hand percussion, rounded bass, and bright synth accents. Global Emotional Progression: the track begins as a private tactile curiosity, gathers a playful pulse while the paper animal changes hands, opens into a shared celebration when fingertips meet, and settles into a tender afterglow. Application Scenarios & Sonics: an imperfect indoor selfie memory, close hands, blue light, black fabric, paper folds, and a small room becoming a friendly dance floor; use warm stereo space, crisp transient detail, gentle saturation, and a clean low end.',
  vocals: 'Vocal Details: BLUE sings a close bright alto call with a warm chest register and a slightly breathy edge, as if speaking across a small room. BLACK answers in low rhythmic talk-singing, using short phrases that feel like a friendly reply rather than a separate narrator. The verse stays intimate and nearly dry; the chorus joins both ciphers in playful parallel harmony. Add a light plate reverb, tiny delay throws at line endings, soft doubling on the shared pulse, and a brief wordless lift when the heart outline is pressed.',
  arrangement: 'Arrangement: begin with felt-piano notes shaped like a three-step folding pattern, finger taps, and a filtered room tone. Add acoustic guitar and a restrained kick under the first verse while BLUE introduces the bright motif. Let BLACK answer with low bass and muted hand percussion; the two motifs should trade places rather than compete. Increase claps, brushed snare, and a round synth bass for the chorus, with a short paper-rustle texture as a transition. After the shared fingertip moment, widen the stereo field and add a gentle disco pulse. Remove drums in the outro, leave piano, guitar harmonics, and one fading heart-like tone.',
  lyrics: '[Intro]\nMm\n\n[Verse]\nPaper animal in my hand\n\n[Chorus]\nHold this small heart close\n\n[Outro]\nWe let it glow',
};

describe('story music', () => {
  test('keeps all iteration scenes, planned interactions, and drops citation noise', () => {
    const source = createStoryMusicSource(transport);
    expect(source).toMatchObject({ iteration: 2, topics: ['love', 'animal'], currentVisitor: 'woman in a blue top' });
    expect(source.actions.join(' ')).toContain('paper animal');
    expect(source.actions.join(' ')).not.toMatch(/S2CID|identifier/i);
    expect(source.scenes.map((scene) => scene.sceneId)).toEqual(expect.arrayContaining([
      'iteration-0001-scene-01',
      'iteration-0002-scene-01',
      'iteration-0002-scene-02',
    ]));
    expect(source.scenes[1].interaction).toContain('thumb brushes');
  });

  test('asks o4-mini for strict dramaturgy map and direct MiniMax fields', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'resp_1', output_text: JSON.stringify(blueprint) });
    const result = await createStoryMusicBlueprint({ openai: { responses: { create } }, transport });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      model: 'o4-mini',
      text: expect.objectContaining({ format: expect.objectContaining({ type: 'json_schema' }) }),
      instructions: expect.stringContaining('semantic ancestry'),
    }));
    expect(result.blueprint).toEqual(blueprint);
    expect(result.blueprint.musicalDramaturgyMap.interactionMapping[0].musicalTranslation).toContain('call');
  });

  test('uses the strict Chat Completions route when the installed client has no Responses API', async () => {
    const create = jest.fn().mockResolvedValue({ choices: [{ message: { content: JSON.stringify(blueprint) } }] });
    const result = await createStoryMusicBlueprint({ openai: { chat: { completions: { create } } }, transport });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      model: 'o4-mini',
      response_format: expect.objectContaining({
        type: 'json_schema',
        json_schema: expect.objectContaining({ name: 'story_music_dramaturgy' }),
      }),
    }));
    expect(result.blueprint.title).toBe('Paper Animal Heart');
  });

  test('sends Studio state, duration, and lyrics to the discovered Space endpoint', async () => {
    const predict = jest.fn().mockResolvedValue({ data: ['', '', { url: 'https://example.test/song.wav' }, 77] });
    const result = await requestMiniMaxMusic3({ client: { predict }, blueprint, randomizeSeed: false, seed: 17 });
    expect(createMiniMaxMusic3State(blueprint)).toMatchObject({
      global_meta: blueprint.global_meta,
      vocals: blueprint.vocals,
      arrangement: blueprint.arrangement,
      lyrics: blueprint.lyrics,
    });
    expect(predict).toHaveBeenCalledWith('/studio_generate', expect.objectContaining({
      duration: 60, seed: 17, randomize_seed: false,
      state: expect.objectContaining(createMiniMaxMusic3State(blueprint)),
    }));
    expect(result).toMatchObject({ audioUrl: 'https://example.test/song.wav', seed: 77 });
  });
});
