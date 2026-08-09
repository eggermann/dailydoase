import dotenv from 'dotenv';
import fs from 'fs-extra';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Generator from './generator.js';
import { createFrameVisionHelper } from '../helpers/frame-vision.js';
import { buildNeutralFallbackScenePlan } from '../helpers/scene-generator.js';
import {
  compactScenePlanFields,
  validateEnglishScenePlanContent,
} from '../helpers/compact-scene-plan.js';
import { sanitizeViewpointCue, selectWanMotionDirection } from './scene-prompt-selection.js';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '../../../..');
dotenv.config({ path: path.join(projectRoot, '.env') });
const generationRoot = path.join(projectRoot, 'GENRATIONS-KAUFHAUF');
const sourceGenerationFolder = path.resolve(
  process.env.FRESHWEB_TWO_VIDEO_SOURCE_FOLDER
  || path.join(generationRoot, '717-glas-kaufhaus-shorty-book-image-only-test')
);
const outputGenerationFolder = path.resolve(
  process.argv[2]
  || path.join(generationRoot, process.env.FRESHWEB_FOLDER || 'glas-kaufhaus-two-video-preview')
);
const snapshotPath = path.join(
  sourceGenerationFolder,
  'scene-generator.camera-snapshot.live-1.json'
);
const configPath = path.join(sourceGenerationFolder, 'info.json');

for (const requiredFile of [snapshotPath, configPath]) {
  if (!(await fs.pathExists(requiredFile))) {
    throw new Error(`Required two-video preview source is missing: ${requiredFile}`);
  }
}

const snapshot = await fs.readJson(snapshotPath);
const config = await fs.readJson(configPath);
// A verified story plan can replace the historical runtime plan. This lets a
// paid WAN pass use precisely the plan inspected in a prompt-only test,
// without asking the semantic stream or planner a second time.
const explicitScenePlanPath = process.env.FRESHWEB_SNAPSHOT_PLAN_PATH
  ? path.resolve(process.env.FRESHWEB_SNAPSHOT_PLAN_PATH)
  : '';
if (explicitScenePlanPath && !(await fs.pathExists(explicitScenePlanPath))) {
  throw new Error(`Explicit saved scene plan is missing: ${explicitScenePlanPath}`);
}
const explicitScenePlan = explicitScenePlanPath
  ? await fs.readJson(explicitScenePlanPath)
  : null;
const untrustedStoredScenePlan = Array.isArray(explicitScenePlan)
  ? explicitScenePlan
  : (Array.isArray(snapshot.runtimeScenePlan) ? snapshot.runtimeScenePlan : []);
const storedSourceCues = Array.isArray(snapshot.sourceCues)
  ? snapshot.sourceCues
  : [];
const storedSourceCueRecords = Array.isArray(snapshot.sourceCueRecords)
  ? snapshot.sourceCueRecords
  : [];
const storedPlanLanguageValidation = validateEnglishScenePlanContent(untrustedStoredScenePlan);
const storedPlanHasEnglishSemanticTerms = untrustedStoredScenePlan.every((scene) => (
  String(scene?.semanticAnchorEnglish || '').trim()
  && String(scene?.semanticCollisionEnglish || '').trim()
));
const storedScenePlan = storedPlanLanguageValidation.valid && storedPlanHasEnglishSemanticTerms
  ? compactScenePlanFields(untrustedStoredScenePlan)
  : buildNeutralFallbackScenePlan({
      sceneCount: untrustedStoredScenePlan.length,
      sceneLengths: untrustedStoredScenePlan.map((scene) => scene?.durationSeconds),
      sourceCueRecords: storedSourceCueRecords,
  });

if (!storedPlanLanguageValidation.valid || !storedPlanHasEnglishSemanticTerms) {
  console.warn('[two-video-preview] saved runtime plan rejected; using neutral validated fallback');
}

if (storedScenePlan.length < 2) {
  throw new Error(`Video iteration needs at least two saved scenes: ${explicitScenePlanPath || snapshotPath}`);
}

// This test intentionally reuses the exact semantic collisions which made the
// accepted image test. It never asks Wikipedia for a new stream and therefore
// cannot lose the visual test to a rate-limit before WAN is called.
const requestedSceneCount = Math.min(
  storedScenePlan.length,
  Math.max(2, Number(process.env.FRESHWEB_SNAPSHOT_SCENE_COUNT) || 2)
);
const preserveSceneDurations = process.env.FRESHWEB_SNAPSHOT_KEEP_SCENE_DURATIONS === '1';
const snapshotSceneLengths = String(process.env.FRESHWEB_SNAPSHOT_SCENE_LENGTHS || '')
  .split(',')
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isFinite(value) && value >= 2 && value <= 15)
  .map((value) => Math.round(value));
const preserveStartFrameStrategies = process.env.FRESHWEB_SNAPSHOT_PRESERVE_START_STRATEGIES === '1';
const scenePlan = storedScenePlan.slice(0, requestedSceneCount).map((scene, index) => ({
  ...scene,
  cameraCue: sanitizeViewpointCue(scene.cameraCue, {
    durationSeconds: scene.durationSeconds,
  }),
  viewpointCueSanitized: true,
  acquisitionDeviceLanguageRemoved: true,
  viewpointPromptVersion: 2,
  semanticCue: scene.semanticCue || storedSourceCues[index] || '',
  durationSeconds: snapshotSceneLengths[index]
    || (preserveSceneDurations ? scene.durationSeconds : 2),
  requestedDurationSeconds: snapshotSceneLengths[index]
    || (preserveSceneDurations ? scene.durationSeconds : 2),
  videoMode: 'singleImage',
  startFrameStrategy: preserveStartFrameStrategies
    ? scene.startFrameStrategy
    : (index === 0 ? 'locationReanchor' : 'rawLastFrame'),
  startFrameReason: preserveStartFrameStrategies
    ? scene.startFrameReason
    : (index === 0
    ? 'Create one fresh, semantic Kaufhaus start image for the test.'
    : 'Continue directly from the actual final frame of scene 1; no paid repair in this cheap test.'),
  frameSource: preserveStartFrameStrategies && scene.startFrameStrategy === 'locationReanchor'
    ? 'newImage'
    : (index === 0 ? 'newImage' : 'lastFrame'),
  freshImage: preserveStartFrameStrategies
    ? scene.startFrameStrategy === 'locationReanchor'
    : index === 0,
  useCameraShot: preserveStartFrameStrategies
    ? scene.startFrameStrategy === 'locationReanchor'
    : false,
}));

const partsFolder = path.join(outputGenerationFolder, 'parts');
const existingSceneVideos = await fs.pathExists(partsFolder)
  ? (await fs.readdir(partsFolder))
    .filter((fileName) => fileName.endsWith('-runware-image-video.mp4'))
    .map((fileName) => path.join(partsFolder, fileName))
    .sort()
  : [];
const existingSceneCount = Math.min(existingSceneVideos.length, scenePlan.length);
const resumeFromExistingScenes = existingSceneCount > 0 && existingSceneCount < scenePlan.length;
const existingLastVideo = resumeFromExistingScenes
  ? existingSceneVideos[existingSceneCount - 1]
  : '';
const existingLastFrame = existingLastVideo.replace(/\.mp4$/, '-last-frame.png');
const mergedFolder = path.join(outputGenerationFolder, 'merged');
const existingConcatenatedVideos = await fs.pathExists(mergedFolder)
  ? (await fs.readdir(mergedFolder))
    .filter((fileName) => fileName.endsWith('-concat.mp4'))
    .map((fileName) => path.join(mergedFolder, fileName))
    .sort()
  : [];
const allSceneVideosAlreadyExist = existingSceneVideos.length >= scenePlan.length;
const alreadyCompletedPreview = allSceneVideosAlreadyExist
  && existingConcatenatedVideos.length > 0;

if (resumeFromExistingScenes && !(await fs.pathExists(existingLastFrame))) {
  throw new Error(`Cannot resume scene ${existingSceneCount + 1}; last frame is missing: ${existingLastFrame}`);
}

const activeScenePlan = scenePlan;

const protagonistReferencePath = path.join(
  projectRoot,
  'lib',
  'Plak-2_images',
  'monster-reference',
  'green-monster-protagonist-realistic-chroma.png'
);
const locationFolder = path.join(projectRoot, 'lib', 'Plak-2_images', 'kaufhaus-location');
const locationImages = [
  'location-central-hall.jpeg',
  'location-mirrored-columns.jpeg',
  'location-elevators.jpeg',
  'location-white-wall.jpeg',
].map((fileName) => ({ path: path.join(locationFolder, fileName) }));

for (const requiredImage of [protagonistReferencePath, ...locationImages.map(({ path: imagePath }) => imagePath)]) {
  if (!(await fs.pathExists(requiredImage))) {
    throw new Error(`Required Kaufhaus preview image is missing: ${requiredImage}`);
  }
}

const endFrameAnalysisEnabled = process.env.FRESHWEB_END_FRAME_ANALYSIS !== '0';
const allowPeople = process.env.FRESHWEB_TWO_VIDEO_ALLOW_PEOPLE === '1';
const useDriftCorrection = process.env.FRESHWEB_SNAPSHOT_ENABLE_DRIFT_CORRECTION === '1';
const mireloMode = String(process.env.FRESHWEB_SNAPSHOT_MIRELO_MODE || 'off').trim();
const endCardEnabled = process.env.FRESHWEB_SNAPSHOT_END_CARD_ENABLED === '1';
const useOpeningFluxContext = process.env.FRESHWEB_SNAPSHOT_OPENING_START_ENABLED === '1';
const getFrameVision = createFrameVisionHelper({
  enabled: endFrameAnalysisEnabled,
  providers: ['openai'],
  logPrefix: 'two-video-preview',
});

config.folderName = path.basename(outputGenerationFolder);
config.model = {
  ...(config.model || {}),
  forceImageToVideoOnly: true,
  retryOnFailure: false,
  maxIterations: 1,
};
config.video2 = {
  ...(config.video2 || {}),
  prompts: {
    // The saved plan already contains the WAN direction. The actual start frame
    // is added by generator.js, including frame-vision continuity for scene 2.
    create: async (_startPrompt, sceneContext, { scenePlan: activeScenePlan } = {}) => {
      const scene = activeScenePlan?.[Math.max(0, Number(sceneContext?.index || 1) - 1)] || {};
      return selectWanMotionDirection({
        scenePlanEntry: scene,
        fallbackPrompt: scene.storyBeat || scene.beat || '',
      });
    },
  },
  model: {
    ...(config.video2?.model || {}),
    type: 'runwareImageToVideo',
    model: 'alibaba:wan@2.6-flash',
    duration_seconds: 2,
    resolution: '720p',
    providerAudio: false,
    fallbacks: [],
  },
};
config.driftCorrection = {
  ...(config.driftCorrection || {}),
  enabled: useDriftCorrection,
};
config.sceneLoop = {
  ...(config.sceneLoop || {}),
  enabled: true,
  imageOnly: { enabled: false },
  mireloMode,
  endCard: {
    ...(config.sceneLoop?.endCard || {}),
    enabled: endCardEnabled,
    dossierPath: path.join(
      projectRoot,
      'lib',
      'Plak-2_images',
      'formen_der_abweichunf_datas.json'
    ),
    durationSeconds: 4,
    width: 1184,
    height: 880,
  },
  collisionTransitions: {
    enabled: true,
    boundaryTrimSeconds: 0.12,
    transitionSeconds: 0.08,
    globalForwardDolly: false,
  },
  firstClipUseSingleImage: true,
  subsequentClipsUseSingleImage: true,
  captureLastFrame: true,
  chainFromPreviousLoopLastFrame: resumeFromExistingScenes,
  restartFromPreviousMovieLastFrame: false,
  independentSceneStarts: false,
  scenePlan: activeScenePlan,
  startFrameStrategy: {
    enabled: true,
    firstSceneStrategy: 'locationReanchor',
    lastSceneStrategy: 'rawLastFrame',
  },
  endFrameAnalysis: {
    enabled: endFrameAnalysisEnabled,
    analyzeFrame: getFrameVision,
  },
  openingImage: {
    ...(config.sceneLoop?.openingImage || {}),
    enabled: useOpeningFluxContext,
    mode: 'fluxContext',
    sourceType: useOpeningFluxContext ? 'fluxContext' : 'cameraShot',
    personaReferencePath: protagonistReferencePath,
    referenceImagePath: protagonistReferencePath,
    imagePath: protagonistReferencePath,
    sceneContextReferencePath: locationImages[0].path,
  },
  sceneContextImage: {
    enabled: true,
    lockActorCount: true,
    allowPeople,
    protagonistAlreadyComposited: false,
    protagonistReferenceMode: 'image',
    semanticReconstructionPass: false,
    images: locationImages,
  },
};

if (process.env.FRESHWEB_TWO_VIDEO_PREVIEW_PLAN_ONLY === '1') {
  console.log(JSON.stringify({
    sourceGenerationFolder,
    explicitScenePlanPath: explicitScenePlanPath || null,
    outputGenerationFolder,
    sceneCount: activeScenePlan.length,
    durationSecondsEach: preserveSceneDurations ? 'saved rhythm' : 2,
    existingSceneCount,
    scenePlan: activeScenePlan.map(({ index, title, semanticCue, startFrameStrategy }) => ({
      index,
      title,
      semanticCue,
      startFrameStrategy,
    })),
  }, null, 2));
  process.exit(0);
}

if (alreadyCompletedPreview) {
  console.log(`Two-video preview already complete: ${existingConcatenatedVideos.at(-1)}`);
  process.exit(0);
}

await fs.ensureDir(outputGenerationFolder);
const generator = new Generator(config);
generator.imageDir = outputGenerationFolder;
generator.firstTime = true;
await generator.init();

if (resumeFromExistingScenes) {
  generator.lastEndFRame = {
    image: { path: existingLastFrame },
    json: {
      metadata: {
        prompt: 'Actual final frame of preview scene 1. Continue this exact visible Kaufhaus and Green Monster state.',
      },
    },
  };
}

if (process.env.FRESHWEB_TWO_VIDEO_PREVIEW_INIT_ONLY === '1') {
  console.log('Two-video preview models initialized without generating media.');
  process.exit(0);
}

console.log(`Two-video preview uses saved semantic scenes: ${sourceGenerationFolder}`);
console.log(`Two-video preview output: ${outputGenerationFolder}`);
const existingClipResults = await Promise.all(
  existingSceneVideos.slice(0, existingSceneCount).map(async (videoFile, index) => {
    const promptPath = path.join(
      partsFolder,
      'scene-prompts',
      `${String(index + 1).padStart(2, '0')}-scene-prompt.json`
    );
    const savedPrompt = await fs.pathExists(promptPath)
      ? await fs.readJson(promptPath)
      : {};
    return {
      index,
      sceneContext: {
        index: index + 1,
        total: scenePlan.length,
        durationSeconds: Number(scenePlan[index]?.requestedDurationSeconds)
          || Number(scenePlan[index]?.durationSeconds)
          || null,
      },
      scenePlanEntry: scenePlan[index],
      startFrame: {
        image: {
          path: savedPrompt.startFramePath || protagonistReferencePath,
        },
        json: { metadata: { prompt: savedPrompt.prompt || '' } },
      },
      useSingleImage: true,
      videoFile,
      videoData: { file: videoFile },
      generatedPrompt: savedPrompt.prompt || '',
    };
  })
);
const result = allSceneVideosAlreadyExist
  ? await generator.finalizeSceneLoopResult({
    clipResults: existingClipResults,
    fileName: String(Date.now()),
    sceneLoop: config.sceneLoop,
    options: config,
    startFrame: existingClipResults[0]?.startFrame || generator.lastEndFRame,
  })
  : resumeFromExistingScenes
  ? await generator.continueSceneLoop({
    streams: [],
    options: config,
    fileName: String(Date.now()),
    sceneLoop: config.sceneLoop,
    clipCount: scenePlan.length,
    imageOptions: config.image,
    promptDir: path.join(partsFolder, 'scene-prompts'),
    clipResults: existingClipResults,
    startFrame: generator.lastEndFRame,
    startIndex: existingSceneCount,
    loopStartsFromLastFrame: true,
  })
  : await generator.prompt([], config);
if (!result) {
  throw new Error('Two-video preview returned no successful result.');
}

console.log(`Two-video preview complete: ${result}`);
