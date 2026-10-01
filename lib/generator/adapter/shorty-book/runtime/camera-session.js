import fs from 'fs-extra';
import path from 'node:path';

import {
  createCameraPresenceDetector,
  DEFAULT_CAMERA_PRESENCE_PROMPT,
} from '../../helpers/camera-presence.js';
import { createCameraChangeGate } from '../../helpers/camera-change-gate.js';
import { createVisionHelper } from '../../helpers/vision-model.js';
import { extractVisionStoryContext, normalizeVisionText } from '../../helpers/frame-vision.js';
import {
  parseBoolean,
  parseCommaList,
  parseFiniteNumber,
  parsePositiveNumber,
  pickEnvValue,
} from '../LiveContextOrchestrator-config.js';

const PLACEHOLDER_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

/**
 * Resolve a deterministic opening-image queue for placeholder runs.
 *
 * The folder is deliberately sorted by filename: iteration 1 gets the first
 * selfie, iteration 2 the second, and so on. This keeps a dry run reproducible
 * while still giving every iteration a new camera input.
 */
export const resolvePlaceholderImagePaths = async (folderPath) => {
  const resolvedFolder = path.resolve(String(folderPath || ''));
  if (!resolvedFolder || !(await fs.pathExists(resolvedFolder))) {
    return [];
  }

  const entries = await fs.readdir(resolvedFolder, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .filter((entry) => PLACEHOLDER_IMAGE_EXTENSIONS.has(path.extname(entry.name).toLocaleLowerCase()))
    .map((entry) => path.join(resolvedFolder, entry.name))
    .sort((left, right) => path.basename(left).localeCompare(path.basename(right), undefined, {
      numeric: true,
      sensitivity: 'base',
    }));
};

export const createCameraSession = ({
  cameraInput,
  config,
  extractVisionStoryContext: extractStoryContext = extractVisionStoryContext,
  getFrameVision,
  getLatestVisionResult = () => null,
  selfomatSession = null,
  visionPrompt,
  settings = {},
} = {}) => {
  const CONFIG = config;
  const VISION_PROMPT = visionPrompt;
  const {
    TEST_INPUT_IMAGE_MODE,
    TEST_INPUT_IMAGE_PATH,
    TEST_INPUT_IMAGE_FOLDER,
    TEST_INPUT_IMAGE_VISION_TEXT,
    CAMERA_PERSON_QUEUE_PATH,
    CAMERA_PERSON_QUEUE_CONSUMED_PATH,
    ASYNC_WEBCAM_PERSONA_REFERENCE_BURST_COUNT,
    SELFOMAT_ENABLED,
    USE_WEBCAM_PERSONA_REFERENCE,
  } = settings;
  const {
    resolveConfiguredCameraImage,
  } = cameraInput;
  let placeholderImageCursor = 0;
  let placeholderImagePathsPromise = null;

  const resolveNextPlaceholderImagePath = async () => {
    if (TEST_INPUT_IMAGE_FOLDER) {
      placeholderImagePathsPromise ||= resolvePlaceholderImagePaths(TEST_INPUT_IMAGE_FOLDER);
      const imagePaths = await placeholderImagePathsPromise;
      if (imagePaths.length > 0) {
        const imagePath = imagePaths[placeholderImageCursor % imagePaths.length];
        placeholderImageCursor += 1;
        return imagePath;
      }
    }

    if (TEST_INPUT_IMAGE_PATH) {
      return path.resolve(TEST_INPUT_IMAGE_PATH);
    }

    return '';
  };
const CAMERA_CAPTURE_MAX_ATTEMPTS = parsePositiveNumber(
  pickEnvValue('FRESHWEB_CAMERA_CAPTURE_MAX_ATTEMPTS'),
  3
);
const VALIDATE_CAMERA_SHOT = parseBoolean(
  pickEnvValue('FRESHWEB_VALIDATE_CAMERA_SHOT'),
  false
);
const REQUIRE_PERSON_IN_CAMERA = parseBoolean(
  pickEnvValue('FRESHWEB_REQUIRE_PERSON_IN_CAMERA', 'FRESHWEB_CAMERA_REQUIRE_PERSON'),
  false
);
const CAMERA_EMPTY_FRAME_WAIT_MS = parsePositiveNumber(
  pickEnvValue('FRESHWEB_CAMERA_EMPTY_FRAME_WAIT_MS'),
  1500
);
const CAMERA_CHANGE_GATE_ENABLED = parseBoolean(
  pickEnvValue('FRESHWEB_CAMERA_CHANGE_GATE_ENABLED'),
  false
);
const CAMERA_CHANGE_GATE_REQUIRED_FRAMES = parsePositiveNumber(
  pickEnvValue('FRESHWEB_CAMERA_CHANGE_GATE_REQUIRED_FRAMES'),
  2
);
const CAMERA_CHANGE_GATE_HEARTBEAT_MS = parsePositiveNumber(
  pickEnvValue('FRESHWEB_CAMERA_CHANGE_GATE_HEARTBEAT_MS'),
  30000
);
const CAMERA_CHANGE_GATE_MEAN_DIFFERENCE = parseFiniteNumber(
  pickEnvValue('FRESHWEB_CAMERA_CHANGE_GATE_MEAN_DIFFERENCE'),
  0.065
);
const CAMERA_CHANGE_GATE_CHANGED_PIXEL_RATIO = parseFiniteNumber(
  pickEnvValue('FRESHWEB_CAMERA_CHANGE_GATE_CHANGED_PIXEL_RATIO'),
  0.08
);
const CAMERA_PRESENCE_PROMPT = pickEnvValue('FRESHWEB_CAMERA_PRESENCE_PROMPT')
  || DEFAULT_CAMERA_PRESENCE_PROMPT;
const CAMERA_PRESENCE_VISION_PROVIDERS = parseCommaList(
  pickEnvValue('FRESHWEB_CAMERA_PRESENCE_VISION_PROVIDERS'),
  ['lmstudio']
);
const PERSON_DESCRIPTION_PROMPT = pickEnvValue('FRESHWEB_PERSONA_DESCRIPTION_PROMPT')
  || [
    'Check only real visible human people in this live camera frame.',
    'Ignore mirrors, posters, paintings, screens, mannequins, printed faces, and reflections.',
    'Reply with exactly three lines:',
    'PERSON_PRESENT: yes or no',
    'PERSON_STRENGTH: integer 0-100 based on how clearly one real visible person is framed and readable',
    'PERSON_DESCRIPTION: one concise sentence describing the strongest visible real person only',
  ].join(' ');
const PERSON_DESCRIPTION_VISION_PROVIDERS = parseCommaList(
  pickEnvValue('FRESHWEB_PERSONA_DESCRIPTION_VISION_PROVIDERS'),
  ['localMistral']
);
const ANSI_RED = '\x1b[31m';
const ANSI_YELLOW = '\x1b[33m';
const ANSI_RESET = '\x1b[0m';
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const cameraPresenceDetector = REQUIRE_PERSON_IN_CAMERA
  ? createCameraPresenceDetector({
      prompt: CAMERA_PRESENCE_PROMPT,
      providers: CAMERA_PRESENCE_VISION_PROVIDERS,
    })
  : null;
const cameraChangeGate = cameraPresenceDetector && CAMERA_CHANGE_GATE_ENABLED
  ? createCameraChangeGate({
      requiredChangedFrames: CAMERA_CHANGE_GATE_REQUIRED_FRAMES,
      heartbeatMs: CAMERA_CHANGE_GATE_HEARTBEAT_MS,
      meanDifferenceThreshold: CAMERA_CHANGE_GATE_MEAN_DIFFERENCE,
      changedPixelRatioThreshold: CAMERA_CHANGE_GATE_CHANGED_PIXEL_RATIO,
    })
  : null;
const cameraPersonDescriptionHelper = createVisionHelper({
  prompt: PERSON_DESCRIPTION_PROMPT,
  providers: PERSON_DESCRIPTION_VISION_PROVIDERS,
});
let cameraPresenceGuardAvailable = REQUIRE_PERSON_IN_CAMERA;
let hasLoggedCameraPresenceGuardDisable = false;
let cameraChangeGateAvailable = Boolean(cameraChangeGate);
let hasLoggedCameraChangeGateDisable = false;
let cameraPersonDescriptionAvailable = true;
let hasLoggedCameraPersonDescriptionDisable = false;
let lastValidCameraShot = null;

const parsePersonStrength = (value = '') => {
  const match = String(value || '').match(/PERSON_STRENGTH\s*:\s*(\d{1,3})/i);
  if (!match) return 0;
  const score = Number(match[1]);
  return Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0;
};

const parsePersonPresent = (value = '') => /PERSON_PRESENT\s*:\s*yes/i.test(String(value || ''));

const parsePersonDescription = (value = '') => {
  const match = String(value || '').match(/PERSON_DESCRIPTION\s*:\s*(.+)/i);
  return match ? String(match[1]).trim() : '';
};

const describeCameraPerson = async ({ imagePath } = {}) => {
  if (!imagePath || !cameraPersonDescriptionAvailable) {
    return null;
  }

  try {
    const result = await cameraPersonDescriptionHelper({ imagePath });
    const visionText = String(result?.outputText || '').trim();
    return {
      provider: String(result?.provider || '').trim(),
      visionText,
      hasPerson: parsePersonPresent(visionText),
      personStrength: parsePersonStrength(visionText),
      personDescription: parsePersonDescription(visionText),
    };
  } catch (error) {
    cameraPersonDescriptionAvailable = false;
    if (!hasLoggedCameraPersonDescriptionDisable) {
      hasLoggedCameraPersonDescriptionDisable = true;
      console.warn(
        `${ANSI_YELLOW}[freshweb-middle-cost-4-3] local camera person description disabled: ${error?.message || error}${ANSI_RESET}`
      );
    }
    return null;
  }
};

const captureBestPersonaReferenceShot = async ({ burstCount = ASYNC_WEBCAM_PERSONA_REFERENCE_BURST_COUNT } = {}) => {
  const queuedShot = await claimNextQueuedPersonShot();
  if (queuedShot) {
    const described = await describeCameraPerson({ imagePath: queuedShot.imagePath });
    return {
      path: queuedShot.imagePath,
      metadata: {
        personDescription: described?.personDescription || '',
        personStrength: described?.hasPerson ? (described?.personStrength || 0) : 0,
        provider: described?.provider || '',
        queueEntryId: queuedShot.queueEntryId,
        visionText: described?.visionText || '',
      },
    };
  }
  const totalCaptures = Math.max(1, Number(burstCount) || 1);
  let bestShot = null;

  for (let index = 0; index < totalCaptures; index += 1) {
    const captured = await captureValidatedCameraShot({
      waitForPerson: false,
      fallbackToLastValid: false,
    });
    if (!captured?.imagePath) {
      continue;
    }
    const described = await describeCameraPerson({ imagePath: captured.imagePath });
    const currentShot = {
      path: captured.imagePath,
      metadata: {
        personDescription: described?.personDescription || '',
        personStrength: described?.hasPerson ? (described?.personStrength || 0) : 0,
        provider: described?.provider || '',
        visionText: described?.visionText || '',
      },
    };
    if (!bestShot || currentShot.metadata.personStrength > bestShot.metadata.personStrength) {
      bestShot = currentShot;
    }
  }

  return bestShot;
};

const looksLikeBadCameraShot = (visionText = '') => {
  const text = normalizeVisionText(visionText).toLowerCase();
  if (!text) {
    return true;
  }

  const badSignals = [
    '(none visible)',
    'none visible',
    'interior room ceiling detail',
    'underside of a ceiling',
    'exposed pipes',
    'upper wall segments',
    'no visible person',
    'no visible actor',
  ];
  if (badSignals.some((signal) => text.includes(signal))) {
    return true;
  }

  const goodSignals = [
    'person',
    'actor',
    'man',
    'woman',
    'face',
    'portrait',
    'selfie',
    'shoulders up',
    'glasses',
    'smile',
    'gaze',
  ];
  return !goodSignals.some((signal) => text.includes(signal));
};
const readJsonOr = async (filePath, fallback) => {
  try {
    return await fs.readJson(filePath);
  } catch {
    return fallback;
  }
};

const claimNextQueuedPersonShot = async () => {
  if (!CAMERA_PERSON_QUEUE_PATH || !CAMERA_PERSON_QUEUE_CONSUMED_PATH) {
    return null;
  }
  const queue = await readJsonOr(CAMERA_PERSON_QUEUE_PATH, { entries: [] });
  const consumed = await readJsonOr(CAMERA_PERSON_QUEUE_CONSUMED_PATH, { ids: [] });
  const consumedIds = new Set(Array.isArray(consumed?.ids) ? consumed.ids : []);
  const candidates = (Array.isArray(queue?.entries) ? queue.entries : [])
    .filter((candidate) => (
      candidate?.id
      && candidate?.imagePath
      && !consumedIds.has(candidate.id)
    ));
  let entry = null;
  for (const candidate of candidates) {
    if (await fs.pathExists(candidate.imagePath)) {
      entry = candidate;
      break;
    }
  }
  if (!entry) {
    return null;
  }
  const ids = [...consumedIds, entry.id].slice(-128);
  await fs.outputJson(CAMERA_PERSON_QUEUE_CONSUMED_PATH, {
    ids,
    updatedAt: new Date().toISOString(),
  }, { spaces: 2 });
  console.log(`[freshweb-middle-cost-4-3] claimed queued person ${entry.id}`);
  return {
    imagePath: path.resolve(entry.imagePath),
    imageSource: `queued-person-${entry.id}`,
    queueEntryId: entry.id,
    visionText: '',
  };
};

const rememberValidCameraShot = (shot = {}) => {
  if (shot?.imagePath) {
    lastValidCameraShot = { ...shot };
  }
  return shot;
};

const reuseLastValidCameraShot = (reason = 'no-person') => {
  if (!lastValidCameraShot?.imagePath) {
    return null;
  }
  console.warn(
    `${ANSI_YELLOW}[freshweb-middle-cost-4-3] running iteration keeps last valid camera reference (${reason}); no wait${ANSI_RESET}`
  );
  return {
    ...lastValidCameraShot,
    imageSource: `last-valid-${reason}`,
    reusedLastValid: true,
  };
};

const evaluateCameraChangeGate = async (imagePath) => {
  if (!cameraChangeGate || !cameraChangeGateAvailable) {
    return { shouldCheckVision: true, reason: 'not-enabled' };
  }

  try {
    return await cameraChangeGate.evaluate({ imagePath });
  } catch (error) {
    cameraChangeGateAvailable = false;
    if (!hasLoggedCameraChangeGateDisable) {
      hasLoggedCameraChangeGateDisable = true;
      console.warn(
        `${ANSI_YELLOW}[freshweb-middle-cost-4-3] camera change gate disabled; using direct local vision: ${error?.message || error}${ANSI_RESET}`
      );
    }
    return { shouldCheckVision: true, reason: 'gate-error' };
  }
};

const logCameraChangeGate = (gateResult = {}) => {
  const meanDifference = Number(gateResult.meanDifference);
  const changedPixelRatio = Number(gateResult.changedPixelRatio);
  const detail = [
    `reason=${gateResult.reason || 'unknown'}`,
    Number.isFinite(meanDifference) ? `mean=${meanDifference.toFixed(3)}` : '',
    Number.isFinite(changedPixelRatio) ? `pixels=${changedPixelRatio.toFixed(3)}` : '',
    Number.isFinite(Number(gateResult.pendingChangedFrames))
      ? `changedFrames=${gateResult.pendingChangedFrames}`
      : '',
  ].filter(Boolean).join(' | ');
  console.log(`[freshweb-middle-cost-4-3] camera change gate: ${detail}`);
};

const captureValidatedCameraShot = async ({
  attempts = CAMERA_CAPTURE_MAX_ATTEMPTS,
  waitForPerson = true,
  fallbackToLastValid = false,
} = {}) => {
  let fallbackPath = '';
  let emptyFrameCount = 0;
  let usableShotAttempts = 0;

  while (true) {
    const captured = await resolveConfiguredCameraImage();
    const imagePath = captured.imagePath;
    fallbackPath = imagePath;

    if (cameraPresenceDetector && cameraPresenceGuardAvailable) {
      try {
        const gateResult = await evaluateCameraChangeGate(imagePath);
        logCameraChangeGate(gateResult);
        if (!gateResult.shouldCheckVision) {
          emptyFrameCount += 1;
          if (!waitForPerson) {
            return fallbackToLastValid
              ? reuseLastValidCameraShot('unchanged-camera-frame')
              : null;
          }
          console.warn(
            `${ANSI_YELLOW}[freshweb-middle-cost-4-3] empty webcam frame ${emptyFrameCount}: unchanged frame, local vision skipped`
            + `${CAMERA_EMPTY_FRAME_WAIT_MS > 0 ? `, waiting ${CAMERA_EMPTY_FRAME_WAIT_MS}ms` : ''}${ANSI_RESET}`
          );
          if (CAMERA_EMPTY_FRAME_WAIT_MS > 0) {
            await wait(CAMERA_EMPTY_FRAME_WAIT_MS);
          }
          continue;
        }
        const presence = await cameraPresenceDetector({ imagePath });
        cameraChangeGate?.recordVisionDecision({
          gateResult,
          hasPerson: presence.hasPerson,
        });
        if (!presence.hasPerson) {
          emptyFrameCount += 1;
          if (!waitForPerson) {
            return fallbackToLastValid
              ? reuseLastValidCameraShot('no-person')
              : null;
          }
          const detail = presence.outputText ? ` | ${presence.outputText}` : '';
          console.warn(
            `${ANSI_RED}[freshweb-middle-cost-4-3] empty webcam frame ${emptyFrameCount}: no person detected by local vision`
            + `${CAMERA_EMPTY_FRAME_WAIT_MS > 0 ? `, waiting ${CAMERA_EMPTY_FRAME_WAIT_MS}ms` : ''}`
            + `${detail}${ANSI_RESET}`
          );
          if (CAMERA_EMPTY_FRAME_WAIT_MS > 0) {
            await wait(CAMERA_EMPTY_FRAME_WAIT_MS);
          }
          continue;
        }
      } catch (error) {
        cameraPresenceGuardAvailable = false;
        if (!hasLoggedCameraPresenceGuardDisable) {
          hasLoggedCameraPresenceGuardDisable = true;
          console.warn(
            `${ANSI_YELLOW}[freshweb-middle-cost-4-3] local camera presence guard disabled: ${error?.message || error}${ANSI_RESET}`
          );
        }
      }
    }

    if (!VALIDATE_CAMERA_SHOT) {
      return rememberValidCameraShot({
        imagePath,
        visionText: '',
        imageSource: emptyFrameCount > 0 ? `captured-waited-${emptyFrameCount}` : captured.imageSource,
      });
    }

    const visionText = String(TEST_INPUT_IMAGE_VISION_TEXT || '').trim()
      || await getFrameVision(
        { image: { path: imagePath } },
        { prompt: VISION_PROMPT }
      );

    if (!looksLikeBadCameraShot(visionText)) {
      return rememberValidCameraShot({
        imagePath,
        visionText,
        imageSource: usableShotAttempts === 0
          ? (emptyFrameCount > 0 ? `captured-waited-${emptyFrameCount}` : captured.imageSource)
          : `captured-retry-${usableShotAttempts + 1}`,
      });
    }

    usableShotAttempts += 1;
    console.warn(
      `[freshweb-middle-cost-4-3] rejected webcam capture ${usableShotAttempts}/${attempts}: frame does not show a usable visible subject`
    );
    if (usableShotAttempts >= attempts) {
      break;
    }
    if (!waitForPerson) {
      return fallbackToLastValid
        ? reuseLastValidCameraShot('unusable-shot')
        : null;
    }
    if (CAMERA_EMPTY_FRAME_WAIT_MS > 0) {
      await wait(CAMERA_EMPTY_FRAME_WAIT_MS);
    }
  }

  if (fallbackToLastValid) {
    const reusedShot = reuseLastValidCameraShot('unusable-shot');
    if (reusedShot) {
      return reusedShot;
    }
  }

  return {
    imagePath: fallbackPath,
    visionText: '',
    imageSource: 'captured-fallback',
  };
};

const resolveOpeningCameraShot = async () => {
  if (TEST_INPUT_IMAGE_MODE && (TEST_INPUT_IMAGE_FOLDER || TEST_INPUT_IMAGE_PATH)) {
    const imagePath = await resolveNextPlaceholderImagePath();
    if (!imagePath) {
      throw new Error(`No placeholder images found in: ${path.resolve(TEST_INPUT_IMAGE_FOLDER || '.')}`);
    }
    if (!(await fs.pathExists(imagePath))) {
      throw new Error(`Test input image not found: ${imagePath}`);
    }
    const visionText = String(TEST_INPUT_IMAGE_VISION_TEXT || '').trim()
      || await getFrameVision(
        { image: { path: imagePath } },
        { prompt: VISION_PROMPT }
      );
    console.log(`[freshweb-middle-cost-4-3] test input image: ${imagePath}`);
    return rememberValidCameraShot({
      imagePath,
      imageSource: TEST_INPUT_IMAGE_FOLDER ? 'test-placeholder-folder' : 'test-placeholder',
      visionText,
    });
  }

  if (!selfomatSession) {
    return await claimNextQueuedPersonShot() || captureValidatedCameraShot();
  }
  await selfomatSession.publish({ phase: 'waiting', message: 'Ich warte auf die nächste Aufnahme mit Menschen.' });
  while (true) {
    try {
      const shot = await claimNextQueuedPersonShot() || await resolveConfiguredCameraImage();
      const visionText = await getFrameVision({ image: { path: shot.imagePath } }, { prompt: VISION_PROMPT });
      if (!visionText) throw new Error('No reliable camera description');
      const context = extractStoryContext(visionText);
      // Missing actor metadata never counts as a human image.
      if (!Array.isArray(context?.actors)) throw new Error('No structured actor count');
      const accepted = await selfomatSession.accept(shot, context.actors.length);
      if (accepted) return rememberValidCameraShot({ ...accepted, visionText });
    } catch (error) {
      console.warn('[selfomat] waiting for a verifiable new person image:', error.message);
    }
    await wait(Math.max(2000, CAMERA_EMPTY_FRAME_WAIT_MS));
  }
};

const resolveRunningIterationCameraShot = async () => SELFOMAT_ENABLED
  ? reuseLastValidCameraShot('selfomat-fixed-lead')
  : captureValidatedCameraShot({
  waitForPerson: false,
  fallbackToLastValid: true,
});

const buildOpeningVisionPayload = (openingCameraShot, openingVisionText) => {
  if (!openingVisionText) {
    return {
      imagePath: openingCameraShot,
      outputText: '',
      provider: '',
      model: '',
    };
  }

  const latestVisionResult = getLatestVisionResult();
  if (latestVisionResult?.imagePath === openingCameraShot) {
    return { ...latestVisionResult };
  }

  return {
    imagePath: openingCameraShot,
    outputText: openingVisionText,
    provider: '',
    model: '',
  };
};

const persistOpeningPersonaReference = async ({
  outputDir,
  openingCameraShot,
} = {}) => {
  const resolvedOpeningCameraShot = String(openingCameraShot || '').trim();
  if (!resolvedOpeningCameraShot) {
    return '';
  }

  const absoluteOpeningCameraShot = path.resolve(resolvedOpeningCameraShot);
  if (!USE_WEBCAM_PERSONA_REFERENCE || !outputDir) {
    return absoluteOpeningCameraShot;
  }

  const resolvedOutputDir = path.resolve(outputDir);
  const targetDir = path.join(resolvedOutputDir, 'parts');
  const ext = path.extname(absoluteOpeningCameraShot) || '.jpg';
  const targetPath = path.join(targetDir, `opening-persona-reference${ext}`);

  await fs.ensureDir(targetDir);
  if (targetPath !== absoluteOpeningCameraShot) {
    await fs.copy(absoluteOpeningCameraShot, targetPath, { overwrite: true });
  }
  return targetPath;
};

  return {
    captureBestPersonaReferenceShot,
    resolveOpeningCameraShot,
    resolveRunningIterationCameraShot,
    buildOpeningVisionPayload,
    persistOpeningPersonaReference,
  };
};

export default createCameraSession;
