import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const adapterDir = path.dirname(__filename);
const projectRoot = path.resolve(adapterDir, '../../..');
dotenv.config({ path: path.join(projectRoot, '.env'), override: false });
const posterDir = path.join(projectRoot, 'lib', 'Plak-2_images');
const generationRoot = path.join(projectRoot, 'GENRATIONS-KAUFHAUF');
const presetPath = path.join(adapterDir, 'MIX-again-freshweb.glas-kaufhaus-trailer.sh');
const outputPrefix = 'glas-kaufhaus-shorty-book-trailer-loop-001';

const posterPages = ['page-1.jpg', 'page-2.jpg', 'page-3.jpg', 'page-4.jpg'];
const generatedContextImages = [
  '6d94760a76c3487b7bce9785970ff6667b85b1f7bda92c353a50208fa8a1d977.jpg',
  'eeb16152e5466cde8620748ad03c2cc7ae76fec74d0ae4726097f49743436ef7.jpg',
  'ffde3672901a44523063b9e1811b12c21a9d7735984e6db9d06b99ab94113606.jpg',
];
const locationImages = [
  'kaufhaus-location/location-central-hall.jpeg',
  'kaufhaus-location/location-mirrored-columns.jpeg',
  'kaufhaus-location/location-elevators.jpeg',
  'kaufhaus-location/location-white-wall.jpeg',
];
const sceneLocationImages = [...locationImages];
const parseConfiguredWords = (value) => String(value || '')
  .split('|')
  .map((entry) => entry.trim())
  .filter(Boolean)
  .map((entry) => {
    const [word, language = 'en'] = entry.split(',').map((part) => part.trim());
    return [word, language || 'en'];
  })
  .filter(([word]) => word);

const configuredWords = parseConfiguredWords(process.env.FRESHWEB_WORDS);
const normalizeWordToken = (value) => String(value || '')
  .replace(/[^\p{L}\p{N}\-]+/gu, ' ')
  .trim();

const buildGeneratedWords = (project, monster, artists) => {
  const sources = [
    project.title,
    project.source_exhibition,
    project.venue?.name,
    project.venue?.city,
    monster.name,
    monster.setting,
    monster.story,
    ...(artists || []).map((artist) => artist?.character_title),
  ];

  const words = [];
  const seen = new Set();

  for (const source of sources) {
    const cleaned = normalizeWordToken(source);
    if (!cleaned) continue;
    for (const token of cleaned.split(/\s+/)) {
      const word = token.trim();
      if (!word) continue;
      const key = word.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      words.push([word, /[A-Za-z]/.test(word) ? 'en' : 'de']);
      if (words.length >= 3) return words;
    }
  }

  return words.length > 0 ? words : [['Kaufhaus', 'de']];
};

const words = configuredWords.length > 0 ? configuredWords : null;

const readJson = async (filePath) => JSON.parse(await fs.readFile(filePath, 'utf8'));

const compact = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const selectArtistMotifs = (artists = []) => {
  const selections = [
    ['archiv', 0],
    ['habitat', 1],
    ['audiovisual', 2],
  ];

  return selections.map(([keyword, fallbackIndex]) => (
    artists.find((artist) => `${artist.character_title || ''} ${artist.monster_contribution || ''}`
      .toLowerCase().includes(keyword))
    || artists[fallbackIndex]
  )).filter(Boolean);
};

const buildArtistDossier = (artists = []) => artists
  .map((artist) => [
    compact(artist.name),
    compact(artist.character_title),
    compact(artist.monster_contribution),
    compact(artist.character_description),
  ].filter(Boolean).join(' — '))
  .filter(Boolean)
  .join('; ');

const assertInputs = async (files) => {
  for (const file of files) {
    const filePath = path.join(posterDir, file);
    await fs.access(filePath);
  }
};

const findNewestRun = async (folderPrefix) => {
  const candidates = [];
  let entries = [];
  try {
    entries = await fs.readdir(generationRoot, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.includes(folderPrefix)) continue;
    const fullPath = path.join(generationRoot, entry.name);
    const stat = await fs.stat(fullPath);
    candidates.push({ fullPath, mtimeMs: stat.mtimeMs });
  }
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates[0]?.fullPath || null;
};

const main = async () => {
  if (!process.env.RUNWARE_API_KEY && !process.env.RUNWARE_KEY) {
    throw new Error('Runware is the default trailer provider. Set RUNWARE_API_KEY before starting.');
  }
  const metadataPath = path.join(posterDir, 'formen_der_abweichunf_datas.json');
  const metadata = await readJson(metadataPath);
  await assertInputs([
    ...posterPages,
    ...generatedContextImages,
    ...locationImages,
    'formen_der_abweichunf_datas.json',
  ]);

  const project = metadata.project || {};
  const monster = metadata.monster || {};
  const artists = Array.isArray(metadata.artists) ? metadata.artists : [];
  const artistMotifs = selectArtistMotifs(artists);
  const artistDossier = buildArtistDossier(artists);
  const motifDossier = artistMotifs
    .map((artist) => `${artist.name}: ${artist.character_title}; ${artist.monster_contribution}`)
    .join(' | ');
  const creativeRule = compact(project.creative_rule)
    || 'Treat every artist-derived protagonist as fictional and practice-informed, never as a literal portrait or invented biography.';
  const monsterAppearance = Array.isArray(monster.appearance)
    ? monster.appearance.join(', ')
    : compact(monster.appearance);
  const activeWords = words || buildGeneratedWords(project, monster, artists);
  const openingPrompt = [
    compact(monster.image_prompt),
    `Transform this into a 1989 BRD television-trailer opening inside the exact Kaufhaus location shown by the separate location reference photos.`,
    `Use the protagonist reference image only for the collective protagonist ${compact(monster.name) || 'The Green Warehouse Organism'} and its visual identity: ${monsterAppearance}.`,
    'Do not copy the protagonist image background, location, props, or palette into the trailer scene.',
    'Make the result feel like realistic handheld mobile-device footage: candid framing, slight shake, natural exposure shifts, autofocus breathing, mild compression, and no polished studio gloss.',
    'No readable lettering, no modern branding, no literal artist portraits.',
  ].join(' ');
  const visualDirection = [
    `Make a compact multi-scene film iteration for ${compact(project.title) || 'Green Monster Ware Haus'} inside ${compact(monster.setting) || 'an old Kaufhaus warehouse in Neukölln, Berlin'}. Use the requested scene count and give every scene a distinct dramatic function.`,
    `The central protagonist is ${compact(monster.name) || 'The Green Warehouse Organism'}: ${compact(monster.story)}`,
    'Treat the supplied Kaufhaus photos as the fixed physical world for every scene. Preserve their architecture, mirrored columns, open technical ceiling, fluorescent fixtures, concrete floor, elevators, windows, and white partition walls.',
    `Semantic input: ${activeWords.map(([word]) => word).join(', ')}. Derive the scene arc from their live getNext sequence; do not assign fixed meanings or fixed scenes to the configured start words.`,
    `Artist-derived fictional motifs, never literal portraits: ${motifDossier}.`,
    creativeRule,
    'Render the film with grounded mobile-device realism: handheld, candid, slightly imperfect, and visibly recorded rather than studio-smooth.',
    'Compose every scene as a semantic baton collision: carry the previous fresh term forward as semantic inheritance, collide it with the current stream\'s fresh getNext term, and let the conflict visibly infect bodies, objects, light, behavior, or architecture. The protagonist image only anchors identity; never explain or harmonize the contradiction.',
    'Make every stillPrompt a complete FLUX image prompt with subject, frozen surreal event, mood, lighting, palette, texture, composition, lens and framing. Make every singleImagePrompt a complete WAN image-to-video prompt with temporal transformation, body and environment motion, atmosphere, changing light, composition continuity, and one motivated virtual camera move.',
    'People may appear when the semantic streams naturally call for them; neither add nor exclude them by default.',
    'Keep the film causally linked, visually concrete, poetic, strange but readable. Let the semantic stream decide the room, action, and atmosphere. No live camera, modern logos, subtitles, or invented artist biographies.',
  ].join(' ');
  const scenePlanSystemPrompt = [
    'Create the requested number of short scene plans for this poster-driven film iteration.',
    `Project: ${compact(project.title)}; source exhibition: ${compact(project.source_exhibition)}; venue: ${compact(project.venue?.name)}, ${compact(project.venue?.city)}.`,
    `Monster dossier: ${compact(monster.story)} Appearance: ${monsterAppearance}. The reference image only fixes the protagonist identity and motion vocabulary.`,
    'Location dossier: real Kaufhaus interior with raw concrete floor, exposed ducts and cables, suspended fluorescent fixtures, mirrored structural columns, elevators, windows, brick walls, and white exhibition partitions. Every scene happens inside this same photographed location.',
    `Artist dossier: ${artistDossier}.`,
    `Use these artist-derived fictional motifs as forces inside the collective protagonist: ${motifDossier}.`,
    `Creative rule: ${creativeRule}`,
    'Keep the visual result grounded and believable like a phone-shot document: handheld, candid, slightly shaky, with natural exposure variation and no studio-polished finish.',
    'Each source cue labels a carried Anchor and a fresh getNext Collision. Keep these roles distinct: the Collision becomes the next scene\'s Anchor. Do not reconcile, explain, or summarize the contradiction; turn it into visible physical action.',
    'The collision must produce a precise surreal image, not a thematic explanation. Describe what visibly happens to body, object, light, texture, architecture, or human behavior.',
    'Choose startFrameStrategy from locationReanchor, driftCorrectedLastFrame, or rawLastFrame according to the visible transition. Explain the choice briefly in startFrameReason.',
    'Every stillPrompt is a final FLUX image prompt: include subject, decisive frozen action, collision, real location geometry, 1980s mood, lighting, palette, material texture, composition, lens and framing.',
    'Every singleImagePrompt is a final WAN image-to-video prompt: include starting state, temporal transformation, subject motion, environmental motion, atmosphere, changing light, composition continuity, and one motivated virtual camera move without cuts.',
    'People may appear when the semantic streams naturally call for them; neither add nor exclude them by default.',
    `The configured semantic streams (${activeWords.map(([word]) => word).join(', ')}) must repeatedly yield fresh terms that alter the protagonist, room, gesture, sound-implied rhythm, atmosphere, light, composition, or camera emphasis across the requested scenes.`,
    'Build a clear film arc across however many scenes were requested: arrival, escalation, mutation, and a final exhibition-broadcast consequence. Keep the Green Warehouse Organism as protagonist. Return required JSON scene plan only.',
  ].join(' ');

  const manifest = {
    project: 'glas-kaufhaus-shorty-book-trailer',
    loop: 1,
    sourceMode: 'saved-poster-images-no-live-camera',
    words: activeWords,
    primaryProtagonistReference: path.join(posterDir, generatedContextImages[0]),
    posterPages: posterPages.map((file) => path.join(posterDir, file)),
    contextImages: generatedContextImages.map((file) => path.join(posterDir, file)),
    locationImages: locationImages.map((file) => path.join(posterDir, file)),
    sceneLocationImages: sceneLocationImages.map((file) => path.join(posterDir, file)),
    exhibitionMetadataFile: metadataPath,
    exhibition: metadata,
    monster,
    artistMotifs,
    artistDossier,
    creativeRule,
    openingPrompt,
    visualDirection,
    scenePlanSystemPrompt,
    dramaticArc: ['arrival', 'escalation', 'mutation', 'exhibition-broadcast consequence'],
    outputFolderPrefix: outputPrefix,
  };

  const configuredFolder = process.env.FRESHWEB_FOLDER || outputPrefix;
  const env = {
    ...process.env,
    FRESHWEB_FOLDER: configuredFolder,
    FRESHWEB_CAMERA_IMAGE_PATH: manifest.primaryProtagonistReference,
    FRESHWEB_SCENE_CONTEXT_IMAGE_MAPPING_ENABLED: '1',
    FRESHWEB_SCENE_CONTEXT_IMAGE_PATHS: manifest.sceneLocationImages.join(' | '),
    FRESHWEB_WORDS: activeWords.map(([word, language]) => `${word},${language}`).join(' | '),
    FRESHWEB_OPENING_PROMPT: process.env.FRESHWEB_OPENING_PROMPT || openingPrompt,
    FRESHWEB_SCENE_VISUAL_DIRECTION: process.env.FRESHWEB_SCENE_VISUAL_DIRECTION || visualDirection,
    FRESHWEB_CAMERA_SCENE_PLAN_SYSTEM_PROMPT: process.env.FRESHWEB_CAMERA_SCENE_PLAN_SYSTEM_PROMPT || scenePlanSystemPrompt,
  };

  console.log('[glas-kaufhaus] source manifest:');
  console.log(JSON.stringify({
    project: project.title,
    monster: monster.name,
    artistCount: artists.length,
    artistMotifs: artistMotifs.map((artist) => artist.character_title),
    primaryProtagonistReference: manifest.primaryProtagonistReference,
    posterPages: manifest.posterPages.length,
    contextImages: manifest.contextImages.length,
    locationImages: manifest.locationImages.length,
    sceneLocationImages: manifest.sceneLocationImages,
    dramaticArc: manifest.dramaticArc,
    words: manifest.words,
  }, null, 2));

  const result = spawnSync('sh', [presetPath], {
    cwd: adapterDir,
    env,
    stdio: 'inherit',
  });

  const runDir = await findNewestRun(configuredFolder);
  if (runDir) {
    await fs.writeFile(
      path.join(runDir, 'glas-kaufhaus-input-manifest.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
      'utf8'
    );
    console.log(`[glas-kaufhaus] manifest saved: ${path.join(runDir, 'glas-kaufhaus-input-manifest.json')}`);
  } else {
    await fs.mkdir(generationRoot, { recursive: true });
    const manifestPath = path.join(generationRoot, `${configuredFolder}-input-manifest.json`);
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    console.log(`[glas-kaufhaus] manifest saved: ${manifestPath}`);
  }

  if (result.error) throw result.error;
  process.exit(result.status ?? 0);
};

main().catch((error) => {
  console.error(`[glas-kaufhaus] failed: ${error?.stack || error}`);
  process.exit(1);
});
