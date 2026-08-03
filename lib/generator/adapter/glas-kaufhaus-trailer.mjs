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
const sceneLocationImages = locationImages.slice(0, 3);
const words = [
  ['1983', 'de'],
  ['Kaufhaus', 'de'],
  ['Kunstausstellung', 'de'],
];

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
  const openingPrompt = [
    compact(monster.image_prompt),
    `Transform this into a 1989 BRD television-trailer opening inside the exact Kaufhaus location shown by the separate location reference photos: exposed ventilation, hanging fluorescent fixtures, mirrored columns, raw concrete floor, brick and white partition walls.`,
    `Preserve the collective protagonist ${compact(monster.name) || 'The Green Warehouse Organism'} and its visual identity: ${monsterAppearance}.`,
    'No readable lettering, no modern branding, no literal artist portraits.',
  ].join(' ');
  const visualDirection = [
    `Make a three-scene film iteration for ${compact(project.title) || 'Green Monster Ware Haus'} inside ${compact(monster.setting) || 'an old Kaufhaus warehouse in Neukölln, Berlin'}.`,
    `The central protagonist is ${compact(monster.name) || 'The Green Warehouse Organism'}: ${compact(monster.story)}`,
    'Treat the supplied Kaufhaus photos as the fixed physical world for every scene. Preserve their architecture, mirrored columns, open technical ceiling, fluorescent fixtures, concrete floor, elevators, windows, and white partition walls.',
    `Scene arc: 1983 wakes the archive; Kaufhaus/Ware Haus turns the organism's room and body into a moving habitat; Kunstausstellung and Fernsehen synthesize the warehouse into a living broadcast.`,
    `Artist-derived fictional motifs, never literal portraits: ${motifDossier}.`,
    creativeRule,
    'People may appear when the semantic streams naturally call for them; neither add nor exclude them by default.',
    'Keep the film causally linked, visually concrete, poetic, strange but readable. No live camera, modern logos, subtitles, or invented artist biographies.',
  ].join(' ');
  const scenePlanSystemPrompt = [
    'Create exactly three short scene plans for this poster-driven film iteration.',
    `Project: ${compact(project.title)}; source exhibition: ${compact(project.source_exhibition)}; venue: ${compact(project.venue?.name)}, ${compact(project.venue?.city)}.`,
    `Monster dossier: ${compact(monster.story)} Appearance: ${monsterAppearance}.`,
    'Location dossier: real Kaufhaus interior with raw concrete floor, exposed ducts and cables, suspended fluorescent fixtures, mirrored structural columns, elevators, windows, brick walls, and white exhibition partitions. Every scene happens inside this same photographed location.',
    `Artist dossier: ${artistDossier}.`,
    `Use these artist-derived fictional motifs as forces inside the collective protagonist: ${motifDossier}.`,
    `Creative rule: ${creativeRule}`,
    'People may appear when the semantic streams naturally call for them; neither add nor exclude them by default.',
    'The ordered words 1983, Kaufhaus, Kunstausstellung must visibly alter the protagonist, room, gesture, sound-implied rhythm, or camera emphasis across the three scenes.',
    'Build a clear film arc: awakening/archive, embodied warehouse interaction, final exhibition broadcast. Keep the Green Warehouse Organism as protagonist. Return required JSON scene plan only.',
  ].join(' ');

  const manifest = {
    project: 'glas-kaufhaus-shorty-book-trailer',
    loop: 1,
    sourceMode: 'saved-poster-images-no-live-camera',
    words,
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
    scenes: [
      '1983: the Green Monster wakes the old Kaufhaus warehouse',
      'Kaufhaus / Ware Haus: the monster handles the room memory and its objects',
      'Fernsehen / Kunstausstellung: the warehouse becomes a living 1989 broadcast exhibition',
    ],
    outputFolderPrefix: outputPrefix,
  };

  const configuredFolder = process.env.FRESHWEB_FOLDER || outputPrefix;
  const env = {
    ...process.env,
    FRESHWEB_FOLDER: configuredFolder,
    FRESHWEB_CAMERA_IMAGE_PATH: manifest.primaryProtagonistReference,
    FRESHWEB_SCENE_CONTEXT_IMAGE_MAPPING_ENABLED: '1',
    FRESHWEB_SCENE_CONTEXT_IMAGE_PATHS: manifest.sceneLocationImages.join(' | '),
    FRESHWEB_WORDS: words.map(([word, language]) => `${word},${language}`).join(' | '),
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
    scenes: manifest.scenes.length,
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
