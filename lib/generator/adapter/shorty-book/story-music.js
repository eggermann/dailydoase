import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const compact = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const captionText = (value) => String(value ?? '')
  .replace(/[ \t]+/g, ' ')
  .replace(/\n\s*/g, '\n')
  .trim();
const compactList = (values = []) => [...new Set(values.map(compact).filter(Boolean))];
const textListSchema = { type: 'array', minItems: 1, items: { type: 'string' } };
const textSchema = { type: 'string' };

const MUSIC_BLUEPRINT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'durationSeconds', 'musicalDramaturgyMap', 'global_meta', 'vocals', 'arrangement', 'lyrics'],
  properties: {
    title: textSchema,
    durationSeconds: { type: 'integer', minimum: 5, maximum: 300 },
    musicalDramaturgyMap: {
      type: 'object',
      additionalProperties: false,
      required: ['personCiphers', 'wordChains', 'musicalMotifs', 'semanticDrift', 'sceneArc', 'interactionMapping'],
      properties: {
        personCiphers: {
          type: 'array', minItems: 1,
          items: {
            type: 'object', additionalProperties: false, required: ['cipher', 'observedWords', 'role'],
            properties: { cipher: textSchema, observedWords: textListSchema, role: textSchema },
          },
        },
        wordChains: {
          type: 'array', minItems: 1,
          items: {
            type: 'object', additionalProperties: false, required: ['sourceWord', 'chain'],
            properties: { sourceWord: textSchema, chain: textListSchema },
          },
        },
        musicalMotifs: {
          type: 'array', minItems: 1,
          items: {
            type: 'object', additionalProperties: false, required: ['ownerCipher', 'motif'],
            properties: { ownerCipher: textSchema, motif: textSchema },
          },
        },
        semanticDrift: {
          type: 'array', minItems: 1,
          items: {
            type: 'object', additionalProperties: false,
            required: ['sourceMaterial', 'chain', 'inventedDestination', 'semanticLineage'],
            properties: {
              sourceMaterial: textSchema, chain: textListSchema,
              inventedDestination: textSchema, semanticLineage: textSchema,
            },
          },
        },
        sceneArc: {
          type: 'array', minItems: 1,
          items: {
            type: 'object', additionalProperties: false,
            required: ['arc', 'sourceScenes', 'dramaticFunction'],
            properties: { arc: textSchema, sourceScenes: textListSchema, dramaticFunction: textSchema },
          },
        },
        interactionMapping: {
          type: 'array', minItems: 1,
          items: {
            type: 'object', additionalProperties: false,
            required: ['sourceScenes', 'observedInteraction', 'musicalTranslation'],
            properties: { sourceScenes: textListSchema, observedInteraction: textSchema, musicalTranslation: textSchema },
          },
        },
      },
    },
    global_meta: textSchema,
    vocals: textSchema,
    arrangement: textSchema,
    lyrics: textSchema,
  },
};

const noisePattern = /\b(?:S2CID|PMID|PMC|Bibcode|identifier|Placozoa|Cnidaria|Bilateria|DOI|ISBN)\b/i;

const concreteStorySentences = (value) => String(value ?? '')
  .split(/(?:\s+->\s+)|(?<=[.!?])\s+/u)
  .map(compact)
  .filter((sentence) => sentence.length > 20)
  .filter((sentence) => !noisePattern.test(sentence))
  .filter((sentence) => !/^the moment follows\b/i.test(sentence));

const personDescription = (actor = {}) => compact(actor.description || actor.reference || 'visitor');

export const inferStoryMusicDuration = (transport = {}) => {
  const scenes = Array.isArray(transport.story?.scenes)
    ? transport.story.scenes
    : Array.isArray(transport.scenes) ? transport.scenes : [];
  const explicitTotal = scenes.reduce((total, scene) => total + Number(scene?.durationSeconds || 0), 0);
  if (explicitTotal > 0) return Math.max(5, Math.min(300, Math.round(explicitTotal)));
  const beatCount = scenes.length || String(transport.story?.summary || '')
    .split(/\s+->\s+/u).filter(Boolean).length || 1;
  return Math.max(5, Math.min(30, beatCount * 3));
};
const cleanSemanticCue = (value) => compact(String(value ?? '')
  .replace(/\b(?:S2CID|PMID|PMC|Bibcode|identifier|Placozoa|Cnidaria|Bilateria|DOI|ISBN)\b/gi, '')
  .replace(/\(\s*\)/g, '')
  .replace(/\s+,/g, ','));

const readSceneActions = (scene = {}) => compactList([
  scene.storyBeat, scene.beat, scene.actorsInteraction, scene.actorAction, scene.title,
].flatMap(concreteStorySentences));

const readTransportScenes = (transport = {}) => {
  const explicitScenes = Array.isArray(transport.story?.scenes) ? transport.story.scenes : [];
  const iteration = Number(transport.iteration) || 0;
  const scenes = explicitScenes.map((scene, index) => ({
    sceneId: `iteration-${String(iteration).padStart(4, '0')}-scene-${String(index + 1).padStart(2, '0')}`,
    iteration,
    sceneIndex: Number(scene.sceneIndex) || index + 1,
    actions: readSceneActions(scene),
    interaction: compact(scene.actorsInteraction || scene.actorAction),
  })).filter((scene) => scene.actions.length > 0);
  if (scenes.length > 0) return scenes;

  const fallbackActions = compactList([
    ...concreteStorySentences([
    transport.story?.summary,
    transport.story?.finalBeat,
    ].filter(Boolean).join(' -> ')),
    ...(Array.isArray(transport.semanticCues) ? transport.semanticCues.map(cleanSemanticCue) : []),
  ]);
  return fallbackActions.map((action, index) => ({
    sceneId: `iteration-${String(iteration).padStart(4, '0')}-beat-${String(index + 1).padStart(2, '0')}`,
    iteration,
    sceneIndex: index + 1,
    actions: [action],
    interaction: '',
  }));
};

const collectIterationTransports = (transport = {}) => {
  const history = [
    ...(Array.isArray(transport.iterationHistory) ? transport.iterationHistory : []),
    ...(Array.isArray(transport.history) ? transport.history : []),
    ...(Array.isArray(transport.storyHistory) ? transport.storyHistory : []),
    ...(Array.isArray(transport.completedIterations) ? transport.completedIterations : []),
  ].map((entry) => entry?.transport || entry).filter(Boolean);
  if (transport.previous) {
    const previousIteration = Number(transport.previous.iteration) || 0;
    if (!history.some((entry) => (Number(entry.iteration) || 0) === previousIteration)) {
      history.push({
        iteration: transport.previous.iteration,
        story: {
          summary: transport.previous.storySummary,
          finalBeat: transport.previous.finalBeat,
          scenes: transport.previous.story?.scenes,
        },
      });
    }
  }
  history.push(transport);
  return history.sort((left, right) => (Number(left.iteration) || 0) - (Number(right.iteration) || 0));
};

export const createStoryMusicSource = (transport = {}) => {
  const currentPeople = Array.isArray(transport.people?.actors) ? transport.people.actors : [];
  const rememberedPeople = Array.isArray(transport.cast?.actorReferences)
    ? transport.cast.actorReferences.filter((actor) => actor.personaId !== currentPeople[0]?.personaId)
    : [];
  const scenes = collectIterationTransports(transport).flatMap(readTransportScenes);
  const actions = compactList(scenes.flatMap((scene) => scene.actions)).slice(0, 12);

  return {
    iteration: Number(transport.iteration) || 0,
    topics: compactList(transport.topics || [transport.topic]),
    setting: compact(transport.location) || 'an ordinary indoor room',
    currentVisitor: personDescription(currentPeople[0]),
    returningVisitor: personDescription(rememberedPeople.find((actor) => actor.lastSelectedIteration === transport.iteration)),
    people: compactList([...currentPeople.map(personDescription), ...rememberedPeople.map(personDescription)]),
    actions,
    scenes,
  };
};

const blueprintInstructions = [
  'You are musical dramaturg turning one complete Selfomat iteration into MiniMax Music 3 inputs.',
  'Return only JSON matching provided schema. Write English. Keep real people anonymous; ciphers derive only from observed words or attributes.',
  'Build musicalDramaturgyMap first. It is provenance map, not extra prose.',
  'Invent freely: surreal, harmonious, smart and party-capable imagery wanted. Every invented image, character, object or lyric leap needs semantic ancestry in semanticDrift: sourceMaterial -> chain -> inventedDestination. No orphan invention.',
  'Derive personCiphers from observable material (example blue -> BLUE, black -> BLACK). wordChains may make associative puns. musicalMotifs give each cipher or object playable voice.',
  'Use all supplied scenes across complete iteration. sceneArc groups and reshapes scene material into overall trajectory; do not force one scene into one song section.',
  'Turn observed interactions into interactionMapping: call/response, motif exchange, harmonic joining, rhythmic imitation, shared pulse, interruption, or another explicit musical behavior.',
  'global_meta must be 80-160 words and begin exactly "Global Metadata\\nBasic Attributes:"; include BPM, key, scale, genre, then explicit labels "Global Emotional Progression:" and "Application Scenarios & Sonics:".',
  'vocals must be 60-140 words, begin "Vocal Details:", and define singer/ciphers, timbre, performance, harmony, and effects.',
  'arrangement must be 80-160 words, begin "Arrangement:", and give an evolving timeline driven by map motifs and interaction mappings.',
  'The combined global_meta, vocals, and arrangement must be 250-450 words. Never put lyric lines or section tags in these fields.',
  'lyrics uses [Intro], [Verse], [Chorus], [Outro] on own lines. Singable, playful, traceable to map; sections may combine scene material, never 1:1 scene mapping.',
  'Keep production description out of lyric lines. No names, brands, citations, research identifiers, untraceable biography.',
].join('\n');

const requireText = (value, label) => {
  const text = compact(value);
  if (!text) throw new Error(`Story music dramaturgy needs ${label}`);
  return text;
};

const requireTextList = (value, label) => {
  const list = compactList(Array.isArray(value) ? value : []);
  if (list.length === 0) throw new Error(`Story music dramaturgy needs ${label}`);
  return list;
};

const validateDramaturgyMap = (map = {}) => ({
  personCiphers: (Array.isArray(map.personCiphers) ? map.personCiphers : []).map((entry) => ({
    cipher: requireText(entry?.cipher, 'person cipher'),
    observedWords: requireTextList(entry?.observedWords, 'cipher observed words'),
    role: requireText(entry?.role, 'cipher role'),
  })),
  wordChains: (Array.isArray(map.wordChains) ? map.wordChains : []).map((entry) => ({
    sourceWord: requireText(entry?.sourceWord, 'word-chain source'),
    chain: requireTextList(entry?.chain, 'word-chain links'),
  })),
  musicalMotifs: (Array.isArray(map.musicalMotifs) ? map.musicalMotifs : []).map((entry) => ({
    ownerCipher: requireText(entry?.ownerCipher, 'motif owner'),
    motif: requireText(entry?.motif, 'musical motif'),
  })),
  semanticDrift: (Array.isArray(map.semanticDrift) ? map.semanticDrift : []).map((entry) => ({
    sourceMaterial: requireText(entry?.sourceMaterial, 'semantic-drift source'),
    chain: requireTextList(entry?.chain, 'semantic-drift chain'),
    inventedDestination: requireText(entry?.inventedDestination, 'semantic-drift destination'),
    semanticLineage: requireText(entry?.semanticLineage, 'semantic-drift lineage'),
  })),
  sceneArc: (Array.isArray(map.sceneArc) ? map.sceneArc : []).map((entry) => ({
    arc: requireText(entry?.arc, 'scene arc'),
    sourceScenes: requireTextList(entry?.sourceScenes, 'scene-arc sources'),
    dramaticFunction: requireText(entry?.dramaticFunction, 'scene-arc dramatic function'),
  })),
  interactionMapping: (Array.isArray(map.interactionMapping) ? map.interactionMapping : []).map((entry) => ({
    sourceScenes: requireTextList(entry?.sourceScenes, 'interaction sources'),
    observedInteraction: requireText(entry?.observedInteraction, 'observed interaction'),
    musicalTranslation: requireText(entry?.musicalTranslation, 'interaction musical translation'),
  })),
});

const requireMapSections = (map) => {
  Object.entries(map).forEach(([name, entries]) => {
    if (entries.length === 0) throw new Error(`Story music dramaturgy needs ${name}`);
  });
  return map;
};

const wordCount = (value) => String(value ?? '').match(/[A-Za-z0-9][A-Za-z0-9'/-]*/g)?.length || 0;

const captionWordCount = (blueprint) => wordCount([
  blueprint.global_meta,
  blueprint.vocals,
  blueprint.arrangement,
].join(' '));

export const validateStoryMusicBlueprint = (blueprint = {}) => {
  const validated = {
    title: compact(blueprint.title),
    durationSeconds: Math.max(5, Math.min(300, Math.round(Number(blueprint.durationSeconds) || 60))),
    musicalDramaturgyMap: requireMapSections(validateDramaturgyMap(blueprint.musicalDramaturgyMap)),
    global_meta: captionText(blueprint.global_meta),
    vocals: captionText(blueprint.vocals),
    arrangement: captionText(blueprint.arrangement),
    lyrics: String(blueprint.lyrics ?? '').trim(),
  };
  if (!validated.title) throw new Error('Story music blueprint needs a title');
  if (!/^Global Metadata\s+Basic Attributes:/i.test(validated.global_meta)) throw new Error('Story music blueprint needs Global Metadata and Basic Attributes');
  if (!/Global Emotional Progression:/i.test(validated.global_meta)) throw new Error('Story music blueprint needs Global Emotional Progression');
  if (!/Application Scenarios & Sonics:/i.test(validated.global_meta)) throw new Error('Story music blueprint needs Application Scenarios & Sonics');
  if (!/^Vocal Details\s*:/i.test(validated.vocals)) throw new Error('Story music blueprint needs Vocal Details');
  if (!/^Arrangement\s*:/i.test(validated.arrangement)) throw new Error('Story music blueprint needs Arrangement');
  const totalCaptionWords = captionWordCount(validated);
  if (totalCaptionWords < 250 || totalCaptionWords > 450) {
    throw new Error(`MiniMax Music 3 structured caption must contain 250-450 words; received ${totalCaptionWords}`);
  }
  if (/\[(?:intro|verse|pre-chorus|chorus|bridge|solo|interlude|outro)\]/i.test(
    `${validated.global_meta} ${validated.vocals} ${validated.arrangement}`
  )) throw new Error('Lyrics section tags must stay out of the music description');
  for (const section of ['Intro', 'Verse', 'Chorus', 'Outro']) {
    if (!new RegExp(`^\\[${section}\\]`, 'mi').test(validated.lyrics)) throw new Error(`Story music lyrics need [${section}]`);
  }
  return validated;
};

export const createStoryMusicBlueprint = async ({ openai, transport, model = 'o4-mini', durationSeconds = 60 } = {}) => {
  if (!openai?.responses?.create && !openai?.chat?.completions?.create) throw new Error('An OpenAI Responses or Chat Completions client is required');
  const source = createStoryMusicSource(transport);
  const prompt = `Create a ${durationSeconds}-second song blueprint from this verified iteration material:\n${JSON.stringify(source, null, 2)}`;
  const schemaFormat = { name: 'story_music_dramaturgy', strict: true, schema: MUSIC_BLUEPRINT_SCHEMA };
  const requestBlueprint = (input) => openai.responses?.create
    ? openai.responses.create({ model, store: false, instructions: blueprintInstructions, input, text: { format: { type: 'json_schema', ...schemaFormat } } })
    : openai.chat.completions.create({
      model,
      messages: [{ role: 'system', content: blueprintInstructions }, { role: 'user', content: input }],
      response_format: { type: 'json_schema', json_schema: schemaFormat },
    });
  const parseResponse = (response) => {
    const outputText = compact(response?.output_text || response?.choices?.[0]?.message?.content);
    if (!outputText) throw new Error('o4-mini returned no music blueprint text');
    try { return JSON.parse(outputText); } catch { throw new Error('o4-mini returned invalid music blueprint JSON'); }
  };
  let response = await requestBlueprint(prompt);
  let parsed = parseResponse(response);
  let validated;
  try {
    validated = validateStoryMusicBlueprint(parsed);
  } catch (validationError) {
    response = await requestBlueprint(`${prompt}\n\nREPAIR REQUIRED: The previous JSON failed validation: ${validationError.message}. Return corrected JSON. Expand or shorten only the structured caption fields until their combined count is 250-450 words; preserve the story provenance map and lyric tags.`);
    parsed = parseResponse(response);
    validated = validateStoryMusicBlueprint(parsed);
  }
  return { source, blueprint: validated, responseId: compact(response?.id) };
};

export const createMiniMaxMusic3State = (blueprint) => {
  const valid = validateStoryMusicBlueprint(blueprint);
  return {
    mode: 'studio',
    description: '',
    instrumental: false,
    title: valid.title,
    lyrics: valid.lyrics,
    global_meta: valid.global_meta,
    vocals: valid.vocals,
    arrangement: valid.arrangement,
  };
};

export const requestMiniMaxMusic3 = async ({ client, blueprint, seed = 0, randomizeSeed = true, steps = 30, guidance = 1.7, headroom = 0 } = {}) => {
  if (!client?.predict) throw new Error('A MiniMax Music 3 Gradio client is required');
  const valid = validateStoryMusicBlueprint(blueprint);
  const result = await client.predict('/studio_generate', {
    state: createMiniMaxMusic3State(valid),
    duration: valid.durationSeconds,
    seed,
    randomize_seed: randomizeSeed,
    headroom,
    steps,
    guidance,
  });
  const audio = result?.data?.[2];
  const audioUrl = compact(typeof audio === 'string' ? audio : audio?.url || audio?.path);
  if (!audioUrl) throw new Error('MiniMax Music 3 returned no audio file');
  return { audioUrl, seed: Number(result?.data?.[3] ?? seed), raw: result };
};

export const saveStoryMusicArtifacts = async ({ outputDirectory, iteration, source, blueprint, responseId = '', audioUrl = '', seed = 0, fetchImpl = fetch, ffmpegPath = 'ffmpeg' } = {}) => {
  const safeIteration = String(Number(iteration) || 0).padStart(4, '0');
  await fs.mkdir(outputDirectory, { recursive: true });
  const base = path.join(outputDirectory, `iteration-${safeIteration}`);
  const blueprintPath = `${base}.music-blueprint.json`;
  await fs.writeFile(blueprintPath, `${JSON.stringify({ source, blueprint, responseId, audioUrl, seed }, null, 2)}\n`);
  if (!audioUrl) return { blueprintPath };
  const audioResponse = await fetchImpl(audioUrl);
  if (!audioResponse.ok) throw new Error(`Could not download MiniMax audio: HTTP ${audioResponse.status}`);
  const sourceExtension = path.extname(new URL(audioUrl).pathname).toLowerCase() || '.wav';
  const audioSourcePath = `${base}${sourceExtension}`;
  await fs.writeFile(audioSourcePath, Buffer.from(await audioResponse.arrayBuffer()));
  const mp3Path = `${base}.mp3`;
  await execFileAsync(ffmpegPath, ['-y', '-i', audioSourcePath, '-codec:a', 'libmp3lame', '-q:a', '2', mp3Path]);
  return { blueprintPath, audioSourcePath, mp3Path };
};
