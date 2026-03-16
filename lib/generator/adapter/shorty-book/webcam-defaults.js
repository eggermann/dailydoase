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
  'In camera mode, let the source cues drive the storybook progression mainly through title, beat, storyBeat, motionCue, cameraCue, and emotional change, not by replacing the visible shot with literal off-screen objects.',
  'If a source cue refers to an unseen object, meal, title, location, or event, show the subject reacting to it, remembering it, craving it, or fearing it inside the real shot instead of inserting that unseen thing into the frame.',
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
  'In camera mode, keep the location static across the sequence and follow the beat through expression, gesture, props, framing, and lighting inside that same space.',
  'Default to videoMode "singleImage" in camera mode when in doubt, especially for small emotional or gestural changes that should preserve actor and background continuity.',
  'Choose videoMode "singleImage" when the subscene is mainly one held visual state with believable internal motion.',
  'Choose videoMode "firstLast" only when the subscene should travel from the current frame toward a small, clearly believable destination setup in the same real room and subject continuity.',
  'Choose frameSource "lastFrame" when the next subscene should continue naturally from the previous generated ending.',
  'After scene 1, keep later camera scenes chained from the previous generated last frame instead of restarting from a fresh webcam shot.',
  'When a later scene uses videoMode "firstLast", treat the previous last frame as the start image and make the destination stillPrompt describe the fresh webcam end state you want to arrive at.',
  'For every later firstLast camera scene, set useCameraShot=true and freshImage=false.',
  'For every later singleImage camera scene, set frameSource="lastFrame", useCameraShot=false, and freshImage=false.',
  'For later scenes in camera mode, only these structures are valid: singleImage from lastFrame or firstLast from lastFrame toward a fresh webcam end shot.',
  'For later scenes in camera mode, useCameraShot=true is only for the fresh webcam destination of a firstLast scene.',
  'In camera mode, if videoMode is "firstLast", frameSource must be "lastFrame" and the destination should be a fresh webcam end shot.',
  'Across the whole camera plan, vary the subscene logic through expression, gesture, gaze, framing emphasis, and emotional progression even if several consecutive scenes all use singleImage.',
  'Do not force firstLast just to create variety; continuity is more important than mode variety in camera mode.',
  'Do not let the last two scenes repeat the same confrontation, determination, or payoff beat. In the final stretch, each scene must change the dominant body action, framing emphasis, or end-state.',
  'Before you output JSON, check that every later singleImage scene starts from lastFrame and that every firstLast camera scene has useCameraShot=true.',
  'Avoid destination scenes like forests, alleyways, theatres, courtrooms, or cinematic set changes unless they are already visible in the source image.',
  'cameraCue and motionCue must be simple, literal, and shot-grounded.',
].join(' ');

const normalizeString = (value) => (typeof value === 'string' ? value.trim() : '');

const getFrameVisionReader = (getFrameVision) => (
  typeof getFrameVision === 'function'
    ? getFrameVision
    : async () => null
);

const resolveScenePromptDurationSeconds = ({
  scenePlanEntry,
  sceneContext,
  nextSceneDuration,
} = {}) => {
  const contextDuration = Number(sceneContext?.durationSeconds);
  if (Number.isFinite(contextDuration) && contextDuration > 0) {
    return contextDuration;
  }

  const requestedDuration = Number(scenePlanEntry?.requestedDurationSeconds);
  if (Number.isFinite(requestedDuration) && requestedDuration > 0) {
    return requestedDuration;
  }

  const plannedDuration = Number(scenePlanEntry?.durationSeconds);
  if (Number.isFinite(plannedDuration) && plannedDuration > 0) {
    return plannedDuration;
  }

  const fallbackDuration = Number(
    typeof nextSceneDuration === 'function' ? nextSceneDuration() : null
  );
  if (Number.isFinite(fallbackDuration) && fallbackDuration > 0) {
    return fallbackDuration;
  }

  return null;
};

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
  const resolvedDurationSeconds = resolveScenePromptDurationSeconds({
    scenePlanEntry,
    sceneContext,
    nextSceneDuration,
  });
  if (typeof setActiveSceneDuration === 'function') {
    setActiveSceneDuration(resolvedDurationSeconds);
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
      durationSeconds: resolvedDurationSeconds,
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
      durationSeconds: resolvedDurationSeconds,
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
    durationSeconds: resolvedDurationSeconds,
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
  const resolvedDurationSeconds = resolveScenePromptDurationSeconds({
    scenePlanEntry,
    sceneContext,
    nextSceneDuration,
  });
  if (typeof setActiveSceneDuration === 'function') {
    setActiveSceneDuration(resolvedDurationSeconds);
  }

  const readFrameVision = getFrameVisionReader(getFrameVision);
  const readContinuityFrameVision = getFrameVisionReader(getContinuityFrameVision);
  const continuityVision = await readContinuityFrameVision(frameContext.startFrame, {
    sceneContext,
    frameContext,
    role: 'continuity',
  });
  const startVision = continuityVision || await readFrameVision(frameContext.startFrame);
  const wasTransitionBeat = scenePlanEntry?.originalVideoMode === 'firstLast'
    && scenePlanEntry?.videoMode === 'singleImage';
  // Single-image prompts use the scene-plan prompt as the source of truth for the action inside
  // one held shot. The priority is `singleImagePrompt`, then `videoPrompt`, then a generated
  // fallback from beat/motion/camera cues. That base text is then wrapped with start-frame vision
  // so the final prompt keeps the same visible subject and setting; camera mode uses the stricter
  // webcam-grounded wrapper, non-camera mode uses the generic vision-aware wrapper.
  const plannedPrompt = (wasTransitionBeat
    ? scenePlanEntry?.videoPrompt || scenePlanEntry?.singleImagePrompt
    : scenePlanEntry?.singleImagePrompt || scenePlanEntry?.videoPrompt)
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
      durationSeconds: resolvedDurationSeconds,
      motionCue: scenePlanEntry?.motionCue,
      cameraCue: scenePlanEntry?.cameraCue,
      startVision,
      useSingleImage: true,
      preferDynamicSingleImage: wasTransitionBeat,
    });
  }

  if (plannedPrompt) {
    return buildVisionAwarePrompt({
      basePrompt: plannedPrompt,
      startVision,
      durationSeconds: resolvedDurationSeconds,
      useSingleImage: true,
    });
  }

  return buildVisionAwarePrompt({
    basePrompt: buildFallbackVideoPrompt(
      scenePlanEntry,
      startFramePrompt || 'Continue the current frame with subtle motion.'
    ),
    startVision,
    durationSeconds: resolvedDurationSeconds,
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
      issues.push(`${sceneLabel}: later singleImage camera scene must start from frameSource "lastFrame"`);
      if (useCameraShot) {
        issues.push(`${sceneLabel}: later singleImage camera scene must set useCameraShot=false`);
      }
      if (freshImage) {
        issues.push(`${sceneLabel}: later singleImage camera scene must set freshImage=false`);
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

  return issues;
};

export const sanitizeWebcamCameraScenePlan = (scenePlan = []) => {
  const sanitizedPlan = scenePlan.map((scene, index) => {
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

    return {
      ...normalized,
      frameSource: 'lastFrame',
      freshImage: false,
      useCameraShot: false,
    };
  });
  return sanitizedPlan;
};

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
    originalVideoMode: normalizeString(scene?.originalVideoMode) || normalizeString(scene?.videoMode),
    videoMode: isFirst
      ? firstClipVideoMode
      : (scenePlanControlsVideoMode
        ? scene.videoMode
        : configuredVideoMode),
  };
});
