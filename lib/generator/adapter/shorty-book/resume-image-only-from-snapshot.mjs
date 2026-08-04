import 'dotenv/config';

import fs from 'fs-extra';
import path from 'node:path';

import Generator from './generator.js';

const projectRoot = path.resolve(process.cwd());
const defaultGenerationFolder = path.join(
  projectRoot,
  'GENRATIONS-KAUFHAUF',
  '717-glas-kaufhaus-shorty-book-image-only-test'
);
const generationFolder = path.resolve(process.argv[2] || defaultGenerationFolder);
const snapshotPath = path.join(
  generationFolder,
  'scene-generator.camera-snapshot.live-1.json'
);
const configPath = path.join(generationFolder, 'info.json');

const requiredFiles = [snapshotPath, configPath];
for (const requiredFile of requiredFiles) {
  if (!(await fs.pathExists(requiredFile))) {
    throw new Error(`Required image-only resume file is missing: ${requiredFile}`);
  }
}

const snapshot = await fs.readJson(snapshotPath);
const config = await fs.readJson(configPath);
const completeSavedScenePlan = Array.isArray(snapshot.runtimeScenePlan)
  ? snapshot.runtimeScenePlan
  : [];
const savedSourceCues = Array.isArray(snapshot.sourceCues) ? snapshot.sourceCues : [];
const scenePlanWithSemanticCues = completeSavedScenePlan.map((scene, index) => ({
  ...scene,
  semanticCue: scene?.semanticCue || savedSourceCues[index] || '',
}));
const requestedStartScene = Math.max(
  1,
  Number(process.env.IMAGE_ONLY_RESUME_START_SCENE) || 1
);
const requestedSceneLimit = Number(process.env.IMAGE_ONLY_RESUME_SCENE_LIMIT);
const firstRequestedSceneIndex = requestedStartScene - 1;
const lastRequestedSceneIndex = Number.isFinite(requestedSceneLimit)
  && requestedSceneLimit > 0
  ? firstRequestedSceneIndex + Math.floor(requestedSceneLimit)
  : undefined;
const savedScenePlan = scenePlanWithSemanticCues.slice(
  firstRequestedSceneIndex,
  lastRequestedSceneIndex
);
const requestedRunIndex = Math.max(
  1,
  Number(process.env.IMAGE_ONLY_RESUME_RUN_INDEX) || 2
);

if (savedScenePlan.length === 0) {
  throw new Error(`Saved snapshot contains no scene plan: ${snapshotPath}`);
}

const protagonistReferencePath = path.join(
  projectRoot,
  'lib',
  'Plak-2_images',
  'monster-reference',
  'green-monster-protagonist-realistic-chroma.png'
);
const locationFolder = path.join(
  projectRoot,
  'lib',
  'Plak-2_images',
  'kaufhaus-location'
);
const locationImageNames = [
  'location-central-hall.jpeg',
  'location-mirrored-columns.jpeg',
  'location-elevators.jpeg',
  'location-white-wall.jpeg',
];
const configuredContextImagePath = String(
  process.env.IMAGE_ONLY_RESUME_CONTEXT_IMAGE_PATH || ''
).trim();
const locationImages = configuredContextImagePath
  ? [{ path: path.resolve(configuredContextImagePath) }]
  : locationImageNames.map((fileName) => ({
    path: path.join(locationFolder, fileName),
  }));

for (const locationImage of locationImages) {
  if (!(await fs.pathExists(locationImage.path))) {
    throw new Error(`Kaufhaus location image is missing: ${locationImage.path}`);
  }
}

config.sceneLoop = config.sceneLoop || {};
config.sceneLoop.imageOnly = {
  enabled: true,
  runIndex: requestedRunIndex,
  sceneNumberOffset: firstRequestedSceneIndex,
  previousScenePath: String(
    process.env.IMAGE_ONLY_RESUME_PREVIOUS_SCENE_PATH || ''
  ).trim(),
};
config.sceneLoop.endCard = {
  enabled: requestedStartScene === 1,
  dossierPath: path.join(
    projectRoot,
    'lib',
    'Plak-2_images',
    'formen_der_abweichunf_datas.json'
  ),
  durationSeconds: 4,
  width: 1184,
  height: 880,
};
config.sceneLoop.scenePlan = savedScenePlan;
config.sceneLoop.sceneContextImage = {
  enabled: true,
  lockActorCount: true,
  allowPeople: false,
  protagonistAlreadyComposited: process.env.IMAGE_ONLY_RESUME_PROTAGONIST_COMPOSITED === '1',
  protagonistReferenceMode: 'image',
  semanticReconstructionPass: process.env.IMAGE_ONLY_RESUME_SEMANTIC_RECONSTRUCTION_PASS === '1',
  images: locationImages,
};
config.sceneLoop.openingImage = {
  ...(config.sceneLoop.openingImage || {}),
  personaReferencePath: protagonistReferencePath,
  referenceImagePath: protagonistReferencePath,
};

const generator = new Generator(config);
generator.imageDir = generationFolder;
generator.firstTime = true;
await generator.init();

console.log(`Resuming ${savedScenePlan.length} saved scenes in: ${generationFolder}`);
const result = await generator.prompt([], config);
if (!result) {
  throw new Error('Image-only snapshot resume returned no successful result.');
}

console.log(
  `Image-only snapshot resume complete: ${path.join(generationFolder, 'parts', 'image-only-scenes')}`
);
