import fs from 'fs-extra';
import path from 'node:path';

import getIamge from '../../../helper/getIamge.js';
import {
  buildFallbackStillPrompt,
  buildFallbackVideoPrompt,
  createSceneGenerator,
  DEFAULT_SCENE_SYSTEM_PROMPT,
  getScenePlanEntry,
} from '../helpers/scene-generator.js';
import { createFrameVisionHelper } from '../helpers/frame-vision.js';
import {
  buildCameraGroundedPrompt,
  buildVisionAwarePrompt,
  resolveFreshwebVisionPrompt,
  resolveFreshwebVisionProviders,
} from '../helpers/freshweb-vision-prompt.js';

export const DEFAULT_WEBCAM_CAMERA_SCENE_SYSTEM_PROMPT = [
  DEFAULT_SCENE_SYSTEM_PROMPT,
  'When configMode is "camera", keep every scene grounded in the currently visible real camera shot.',
  'In camera mode, source cues must shape the emotional arc and implied off-screen story inside the real shot.',
  'Translate source cues into visible tension, dread, curiosity, suspicion, shock, relief, obsession, or other concrete states that can be read from posture, gaze, expression, framing, and lighting inside the same room.',
  'In camera mode, do not turn the source cues into a generic host presentation, review, explanation, or discussion unless the source cues explicitly call for that format.',
  'When camera-mode vision context is provided, use its location, actor descriptions, and visible-shot description as grounding for every scene beat, stillPrompt, imageDescription, and video prompt.',
  'In camera mode, scene 1 must always start from a fresh live webcam shot.',
  'In camera mode, scene 1 must always use videoMode "singleImage".',
  'For every camera scene, first decide the new story point or subscene moment, then choose frameSource and videoMode to fit that moment.',
  'In camera mode, a different setting means a different visible setup inside the same real shot: a new pose, gaze direction, body position, framing emphasis, relation to the window or artwork, foreground-background balance, or lighting emphasis that is already plausible from the source image.',
  'Respect the image prompt fields: stillPrompt and imageDescription must describe that chosen visible setup clearly and literally.',
  'Do not invent a new location, set, landscape, or props that are not visible in the camera image.',
  'For camera mode, videoPrompt and singleImagePrompt must describe only what can happen inside the visible shot: facial expression, body movement, gaze shift, hand movement, posture change, lighting change, focus change, or camera motion.',
  'In camera mode, keep the same subject identity, room, and overall setting unless a fresh camera shot is explicitly requested.',
  'Choose videoMode "singleImage" when the subscene is mainly one held visual state with believable internal motion.',
  'Choose videoMode "firstLast" when the subscene should travel from the current frame toward a clearly different destination setup in the same real room and subject continuity.',
  'Choose frameSource "lastFrame" when the next subscene should continue naturally from the previous generated ending.',
  'Choose frameSource "newImage" only when the story point needs a fresh webcam re-anchor of the same real person and room.',
  'When you use frameSource "newImage" in camera mode, that new image must be a fresh webcam shot and useCameraShot must be true.',
  'When a later scene uses videoMode "firstLast", treat the previous last frame as the start image and make the destination stillPrompt describe the fresh webcam end state you want to arrive at.',
  'For every later firstLast camera scene, set useCameraShot=true and freshImage=false.',
  'For every later singleImage camera scene that starts from a fresh webcam shot, set frameSource="newImage", useCameraShot=true, and freshImage=true.',
  'For every later singleImage camera scene that continues from the previous ending, set frameSource="lastFrame", useCameraShot=false, and freshImage=false.',
  'For later scenes in camera mode, only these structures are valid: singleImage from lastFrame, singleImage from a fresh webcam shot, or firstLast from lastFrame toward a fresh webcam end shot.',
  'For later scenes in camera mode, useCameraShot=true means a fresh live webcam capture is required.',
  'In camera mode, never use frameSource="newImage" unless it means a fresh webcam shot with useCameraShot=true.',
  'In camera mode, if videoMode is "firstLast", frameSource must be "lastFrame" and the destination should be a fresh webcam end shot.',
  'Across the whole camera plan, vary the subscene logic instead of repeating one pattern: mix continuation beats, re-anchored webcam beats, and destination beats when the story naturally supports them.',
  'In a camera plan with 4 or more scenes, do not make every later scene use the same videoMode.',
  'In a camera plan with 5 or more scenes, include at least one later continuation beat as singleImage from lastFrame and at least one later destination beat as firstLast from lastFrame.',
  'In a camera plan with 6 or more scenes, also include at least one later re-anchored beat as singleImage from a fresh webcam shot.',
  'Choose those three scene types from the story logic: continuation for subtle emotional development, firstLast for a visible shift toward a new setup in the same room, and fresh webcam re-anchor for a reset or punctuation point.',
  'Before you output JSON, check the later scenes and confirm the plan includes the required mix and that every firstLast camera scene has useCameraShot=true.',
  'In a 5 to 6 scene camera plan, usually choose 1 or 2 later scenes with useCameraShot=true to re-anchor the sequence to reality.',
  'Avoid destination scenes like forests, alleyways, theatres, courtrooms, or cinematic set changes unless they are already visible in the source image.',
  'cameraCue and motionCue must be simple, literal, and shot-grounded.',
].join(' ');

const normalizeString = (value) => (typeof value === 'string' ? value.trim() : '');

const getFrameVisionReader = (getFrameVision) => (
  typeof getFrameVision === 'function'
    ? getFrameVision
    : async () => null
);

export const resolveWebcamVisionSettings = ({
  middlePrompt,
  testPrompt,
  middleProviders,
  testProviders,
} = {}) => ({
  prompt: resolveFreshwebVisionPrompt(middlePrompt, testPrompt),
  providers: resolveFreshwebVisionProviders(middleProviders, testProviders),
});

export const resolveWebcamScenePlanSystemPrompt = ({
  configMode = 'generated',
  scenePlanSystemPrompt = '',
  cameraScenePlanSystemPrompt = '',
} = {}) => {
  const normalizedScenePrompt = normalizeString(scenePlanSystemPrompt);
  const normalizedCameraPrompt = normalizeString(cameraScenePlanSystemPrompt);

  if (configMode === 'camera') {
    return normalizedCameraPrompt
      || normalizedScenePrompt
      || DEFAULT_WEBCAM_CAMERA_SCENE_SYSTEM_PROMPT;
  }

  return normalizedScenePrompt || DEFAULT_SCENE_SYSTEM_PROMPT;
};

export const createWebcamVisionStoreHandler = ({ prompt = '' } = {}) => async ({
  imagePath,
  outputText,
  result,
}) => {
  const marker = `${path.sep}parts${path.sep}`;
  const markerIndex = String(imagePath || '').indexOf(marker);
  if (markerIndex < 0) {
    return;
  }

  const runRoot = imagePath.slice(0, markerIndex);
  const visionDir = path.join(runRoot, 'parts', 'vision-store');
  await fs.ensureDir(visionDir);
  const targetPath = path.join(
    visionDir,
    `${path.basename(imagePath).replace(path.extname(imagePath), '')}.vision.json`
  );
  await fs.writeJson(targetPath, {
    imagePath,
    outputText,
    provider: result?.provider || '',
    model: result?.model || '',
    prompt,
    timestamp: new Date().toISOString(),
  }, { spaces: 2 });
};

export const saveWebcamScenePlanArtifact = async ({
  outputDir,
  fileName = 'scene-generator.camera-snapshot.live-1.json',
  payload = {},
} = {}) => {
  const resolvedOutputDir = typeof outputDir === 'string' && outputDir.trim().length > 0
    ? path.resolve(outputDir)
    : '';

  if (!resolvedOutputDir) {
    return null;
  }

  await fs.ensureDir(resolvedOutputDir);
  const targetPath = path.join(resolvedOutputDir, fileName);
  await fs.writeJson(targetPath, payload, { spaces: 2 });
  return targetPath;
};

export const createWebcamFrameVision = ({
  enabled,
  prompt,
  providers,
  logPrefix = 'freshweb',
  onResult,
} = {}) => createFrameVisionHelper({
  enabled,
  prompt,
  providers,
  logPrefix,
  onResult,
});

export const createWebcamSceneGenerator = ({
  openai,
  model,
  systemPrompt,
  temperature = 0.45,
  top_p = 0.9,
} = {}) => createSceneGenerator({
  openai,
  model,
  systemPrompt,
  temperature,
  top_p,
});

export const createWebcamImagePromptHandler = async (prompt, sceneContext, scenePlanEntry) => {
  if (scenePlanEntry?.stillPrompt) {
    return scenePlanEntry.stillPrompt;
  }
  if (scenePlanEntry?.imageDescription) {
    return scenePlanEntry.imageDescription;
  }
  return buildFallbackStillPrompt(prompt);
};

export const createWebcamFirstLastPrompt = ({
  configMode,
  getFrameVision,
  getContinuityFrameVision,
  setActiveSceneDuration,
  nextSceneDuration,
} = {}) => async (startFramePrompt, endFramePrompt, sceneContext, frameContext = {}) => {
  const scenePlanEntry = getScenePlanEntry(frameContext.scenePlan, sceneContext);
  if (typeof setActiveSceneDuration === 'function') {
    setActiveSceneDuration(scenePlanEntry?.durationSeconds ?? nextSceneDuration?.());
  }

  const readFrameVision = getFrameVisionReader(getFrameVision);
  const readContinuityFrameVision = getFrameVisionReader(getContinuityFrameVision);
  const continuityVision = await readContinuityFrameVision(frameContext.startFrame, {
    sceneContext,
    frameContext,
    role: 'continuity',
  });
  const startVision = continuityVision || await readFrameVision(frameContext.startFrame);
  const endVision = await readFrameVision(frameContext.endFrame);
  // First-last prompts are built in two stages:
  // 1. Prefer the planner's ready-to-use `videoPrompt`; if it is missing, synthesize a fallback
  //    from the scene beat plus motion/camera cues and the start/end prompt text.
  // 2. Wrap that base prompt with vision context from the current start and end frames so the
  //    final text keeps subject/room continuity. In camera mode this wrapper is stricter and
  //    limits the motion to what is believable inside the real webcam shot.
  const plannedPrompt = scenePlanEntry?.videoPrompt || buildFallbackVideoPrompt(
    scenePlanEntry,
    `${startFramePrompt} ${endFramePrompt}` || 'Continue into the next destination scene.'
  );

  if (configMode === 'camera') {
    return buildCameraGroundedPrompt({
      basePrompt: plannedPrompt,
      storyBeat: scenePlanEntry?.storyBeat || scenePlanEntry?.beat,
      stillPrompt: scenePlanEntry?.stillPrompt,
      imageDescription: scenePlanEntry?.imageDescription,
      durationSeconds: scenePlanEntry?.durationSeconds,
      motionCue: scenePlanEntry?.motionCue,
      cameraCue: scenePlanEntry?.cameraCue,
      startVision,
      endVision,
      useSingleImage: false,
    });
  }

  if (plannedPrompt) {
    return buildVisionAwarePrompt({
      basePrompt: plannedPrompt,
      startVision,
      endVision,
      durationSeconds: scenePlanEntry?.durationSeconds,
      useSingleImage: false,
    });
  }

  return buildVisionAwarePrompt({
    basePrompt: buildFallbackVideoPrompt(
      scenePlanEntry,
      `${startFramePrompt} ${endFramePrompt}` || 'Continue into the next destination scene.'
    ),
    startVision,
    endVision,
    durationSeconds: scenePlanEntry?.durationSeconds,
    useSingleImage: false,
  });
};

export const createWebcamSingleImagePrompt = ({
  configMode,
  getFrameVision,
  getContinuityFrameVision,
  setActiveSceneDuration,
  nextSceneDuration,
} = {}) => async (startFramePrompt, sceneContext, frameContext = {}) => {
  const scenePlanEntry = getScenePlanEntry(frameContext.scenePlan, sceneContext);
  if (typeof setActiveSceneDuration === 'function') {
    setActiveSceneDuration(scenePlanEntry?.durationSeconds ?? nextSceneDuration?.());
  }

  const readFrameVision = getFrameVisionReader(getFrameVision);
  const readContinuityFrameVision = getFrameVisionReader(getContinuityFrameVision);
  const continuityVision = await readContinuityFrameVision(frameContext.startFrame, {
    sceneContext,
    frameContext,
    role: 'continuity',
  });
  const startVision = continuityVision || await readFrameVision(frameContext.startFrame);
  // Single-image prompts use the scene-plan prompt as the source of truth for the action inside
  // one held shot. The priority is `singleImagePrompt`, then `videoPrompt`, then a generated
  // fallback from beat/motion/camera cues. That base text is then wrapped with start-frame vision
  // so the final prompt keeps the same visible subject and setting; camera mode uses the stricter
  // webcam-grounded wrapper, non-camera mode uses the generic vision-aware wrapper.
  const plannedPrompt = scenePlanEntry?.singleImagePrompt
    || scenePlanEntry?.videoPrompt
    || buildFallbackVideoPrompt(
      scenePlanEntry,
      startFramePrompt || 'Continue the current frame with subtle motion.'
    );

  if (configMode === 'camera') {
    return buildCameraGroundedPrompt({
      basePrompt: plannedPrompt,
      storyBeat: scenePlanEntry?.storyBeat || scenePlanEntry?.beat,
      stillPrompt: scenePlanEntry?.stillPrompt,
      imageDescription: scenePlanEntry?.imageDescription,
      durationSeconds: scenePlanEntry?.durationSeconds,
      motionCue: scenePlanEntry?.motionCue,
      cameraCue: scenePlanEntry?.cameraCue,
      startVision,
      useSingleImage: true,
    });
  }

  if (plannedPrompt) {
    return buildVisionAwarePrompt({
      basePrompt: plannedPrompt,
      startVision,
      durationSeconds: scenePlanEntry?.durationSeconds,
      useSingleImage: true,
    });
  }

  return buildVisionAwarePrompt({
    basePrompt: buildFallbackVideoPrompt(
      scenePlanEntry,
      startFramePrompt || 'Continue the current frame with subtle motion.'
    ),
    startVision,
    durationSeconds: scenePlanEntry?.durationSeconds,
    useSingleImage: true,
  });
};

export const captureWebcamImage = ({
  cameraOutputDir,
  cameraFallbackImagePath = '',
  captureOptions = {},
} = {}) => getIamge({
  outputDir: cameraOutputDir,
  ...captureOptions,
  fallbackImagePath: cameraFallbackImagePath || undefined,
});

export const describeWebcamCameraScenePlanIssues = (scenePlan = []) => {
  const issues = [];
  const laterScenes = scenePlan.slice(1);

  scenePlan.forEach((scene, index) => {
    const sceneNumber = index + 1;
    const sceneLabel = `scene ${sceneNumber}`;
    const videoMode = normalizeString(scene?.videoMode);
    const frameSource = normalizeString(scene?.frameSource);
    const useCameraShot = scene?.useCameraShot === true;
    const freshImage = scene?.freshImage === true;

    if (index === 0) {
      if (videoMode !== 'singleImage') {
        issues.push(`${sceneLabel}: opening camera scene must use videoMode "singleImage"`);
      }
      if (frameSource !== 'newImage') {
        issues.push(`${sceneLabel}: opening camera scene must start from frameSource "newImage"`);
      }
      if (!useCameraShot) {
        issues.push(`${sceneLabel}: opening camera scene must set useCameraShot=true`);
      }
      if (!freshImage) {
        issues.push(`${sceneLabel}: opening camera scene must set freshImage=true`);
      }
      return;
    }

    if (videoMode === 'firstLast') {
      if (frameSource !== 'lastFrame') {
        issues.push(`${sceneLabel}: firstLast camera scene must start from frameSource "lastFrame"`);
      }
      if (!useCameraShot) {
        issues.push(`${sceneLabel}: firstLast camera scene must set useCameraShot=true for the fresh webcam destination`);
      }
      return;
    }

    if (videoMode !== 'singleImage') {
      issues.push(`${sceneLabel}: camera scene must use videoMode "singleImage" or "firstLast"`);
      return;
    }

    if (frameSource === 'newImage') {
      if (!useCameraShot) {
        issues.push(`${sceneLabel}: singleImage camera scene with frameSource "newImage" must set useCameraShot=true`);
      }
      if (!freshImage) {
        issues.push(`${sceneLabel}: singleImage camera scene with frameSource "newImage" must set freshImage=true`);
      }
      return;
    }

    if (frameSource === 'lastFrame') {
      if (useCameraShot) {
        issues.push(`${sceneLabel}: singleImage camera scene with frameSource "lastFrame" must set useCameraShot=false`);
      }
      if (freshImage) {
        issues.push(`${sceneLabel}: singleImage camera scene with frameSource "lastFrame" must set freshImage=false`);
      }
      return;
    }

    issues.push(`${sceneLabel}: camera scene has unsupported frameSource "${frameSource || 'unknown'}"`);
  });

  if (laterScenes.length >= 3) {
    const laterVideoModes = new Set(
      laterScenes
        .map((scene) => normalizeString(scene?.videoMode))
        .filter(Boolean)
    );

    if (laterVideoModes.size < 2) {
      issues.push('camera plan: later scenes must not all use the same videoMode when scene count is 4 or more');
    }
  }

  if (laterScenes.length >= 4) {
    const hasContinuationSingleImage = laterScenes.some((scene) => (
      normalizeString(scene?.videoMode) === 'singleImage'
      && normalizeString(scene?.frameSource) === 'lastFrame'
    ));
    const hasDestinationFirstLast = laterScenes.some((scene) => (
      normalizeString(scene?.videoMode) === 'firstLast'
      && normalizeString(scene?.frameSource) === 'lastFrame'
    ));

    if (!hasContinuationSingleImage) {
      issues.push('camera plan: for 5 or more scenes, include at least one later continuation beat using singleImage from lastFrame');
    }
    if (!hasDestinationFirstLast) {
      issues.push('camera plan: for 5 or more scenes, include at least one later destination beat using firstLast from lastFrame');
    }
  }

  if (laterScenes.length >= 5) {
    const hasFreshReanchorSingleImage = laterScenes.some((scene) => (
      normalizeString(scene?.videoMode) === 'singleImage'
      && normalizeString(scene?.frameSource) === 'newImage'
      && scene?.useCameraShot === true
    ));

    if (!hasFreshReanchorSingleImage) {
      issues.push('camera plan: for 6 or more scenes, include at least one later re-anchored beat using singleImage from a fresh webcam shot');
    }
  }

  return issues;
};

export const sanitizeWebcamCameraScenePlan = (scenePlan = []) => scenePlan.map((scene, index) => {
  const normalized = { ...scene };
  const isFirst = index === 0;

  if (isFirst) {
    return {
      ...normalized,
      videoMode: 'singleImage',
      frameSource: 'newImage',
      freshImage: true,
      useCameraShot: true,
    };
  }

  if (normalized.videoMode === 'firstLast') {
    return {
      ...normalized,
      frameSource: 'lastFrame',
      useCameraShot: true,
    };
  }

  if (normalized.frameSource === 'newImage') {
    return {
      ...normalized,
      freshImage: true,
      useCameraShot: true,
    };
  }

  return {
    ...normalized,
    frameSource: 'lastFrame',
    freshImage: false,
    useCameraShot: false,
  };
});

export const normalizeWebcamCameraScenePlan = sanitizeWebcamCameraScenePlan;

export const applyWebcamScenePlanVideoModeDefaults = (
  scenePlan = [],
  {
    resolveConfiguredVideoMode,
    scenePlanControlsVideoMode = true,
    firstClipVideoMode = 'singleImage',
  } = {}
) => scenePlan.map((scene, index) => {
  const sceneIndex = index + 1;
  const total = scenePlan.length;
  const isFirst = sceneIndex === 1;
  const isLast = sceneIndex === total;
  const configuredVideoMode = typeof resolveConfiguredVideoMode === 'function'
    ? resolveConfiguredVideoMode({
        index: sceneIndex,
        total,
        isFirst,
        isLast,
      })
    : scene.videoMode;

  return {
    ...scene,
    videoMode: isFirst
      ? firstClipVideoMode
      : (scenePlanControlsVideoMode
        ? scene.videoMode
        : configuredVideoMode),
  };
});
