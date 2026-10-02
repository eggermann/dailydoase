import { normalizeCaptureSource } from '../helpers/scene-generator-helpers.js';

export const SELFOMAT_CAPTURE_SOURCES = Object.freeze({
  pocketPhone: 'pocketPhone',
  cheapCCTV: 'cheapCCTV',
  firstPersonDrone: 'firstPersonDrone',
});

// This is a stable material layer, not a creative scene instruction. It gives
// every Selfomat render the same imperfect consumer-camera texture while GPT
// remains free to decide what visibly happens in the room.
export const SELFOMAT_POCKET_PHONE_STILL_STYLE = [
  'Accidental consumer-phone capture, not a composed photograph.',
  'No centered hero object and no intentional framing.',
  'Slight motion blur from hand movement, clipped highlights, uneven auto-exposure, weak phone sharpening and compression, imperfect white balance, odd tilt, messy crop, subject partly cut off, mundane available light.',
  'Real skin, real fabric, ordinary clutter.',
  'No studio light, commercial polish, product shot, symmetrical composition, cinematic depth of field, or beauty retouching.',
].join(' ');

export const SELFOMAT_POCKET_PHONE_VIDEO_STYLE = [
  SELFOMAT_POCKET_PHONE_STILL_STYLE,
  'Camera movement feels unplanned and reactive, not choreographed.',
  'Autofocus briefly hunts; exposure adjusts imperfectly; framing arrives late.',
].join(' ');

export const SELFOMAT_CHEAP_CCTV_STILL_STYLE = [
  'Cheap 4:3 security-camera capture, not a composed photograph and not a phone shot.',
  'Fixed high-corner wide-angle view, mundane clutter, practical light, weak compression, slight auto-exposure pumping, imperfect white balance, and partial edge framing.',
  'Keep the person real and recognizable through one visible identity anchor: face, hair, distinctive sweater, hand, or characteristic pose.',
  'No handheld movement, studio light, commercial polish, product shot, symmetrical composition, cinematic depth of field, or beauty retouching.',
].join(' ');

export const SELFOMAT_CHEAP_CCTV_VIDEO_STYLE = [
  SELFOMAT_CHEAP_CCTV_STILL_STYLE,
  'Camera stays fixed. Exposure adjusts imperfectly and compression remains visible; no choreographed camera movement.',
].join(' ');

export const SELFOMAT_FIRST_PERSON_DRONE_STILL_STYLE = [
  'Cheap first-person FPV drone capture, not a composed photograph, not a phone shot, and not CCTV.',
  'Low moving viewpoint with a slightly rolling horizon, uneven auto-exposure, weak digital compression, wide-angle edge distortion, and accidental partial framing.',
  'Keep the person real and recognizable through one visible identity anchor: face, hair, distinctive sweater, hand, or characteristic pose.',
  'No smooth cinematic fly-through, studio light, commercial polish, product shot, symmetrical composition, cinematic depth of field, or beauty retouching.',
].join(' ');

export const SELFOMAT_FIRST_PERSON_DRONE_VIDEO_STYLE = [
  SELFOMAT_FIRST_PERSON_DRONE_STILL_STYLE,
  'The small drone drifts and corrects course abruptly; horizon and exposure shift imperfectly. Movement feels improvised and observational, never choreographed.',
].join(' ');

export const defaultSelfomatCaptureSource = (sceneIndex = 0) => (
  Number(sceneIndex) % 5 === 4
    ? SELFOMAT_CAPTURE_SOURCES.cheapCCTV
    : SELFOMAT_CAPTURE_SOURCES.pocketPhone
);

export const resolveSelfomatCaptureSource = (value, sceneIndex = 0) => (
  normalizeCaptureSource(value, defaultSelfomatCaptureSource(sceneIndex))
);

export const buildSelfomatCaptureMaterialStyle = ({
  captureSource,
  sceneIndex = 0,
  video = false,
} = {}) => {
  const source = resolveSelfomatCaptureSource(captureSource, sceneIndex);
  const noVisibleText = 'No visible writing or graphic overlays: no camera labels or source names, captions, subtitles, title cards, timestamps, watermarks, logos, signs, interface elements, or icons. Never render the capture method as text.';
  if (source === SELFOMAT_CAPTURE_SOURCES.cheapCCTV) {
    const style = video ? SELFOMAT_CHEAP_CCTV_VIDEO_STYLE : SELFOMAT_CHEAP_CCTV_STILL_STYLE;
    return `${style} ${noVisibleText}`;
  }
  if (source === SELFOMAT_CAPTURE_SOURCES.firstPersonDrone) {
    const style = video ? SELFOMAT_FIRST_PERSON_DRONE_VIDEO_STYLE : SELFOMAT_FIRST_PERSON_DRONE_STILL_STYLE;
    return `${style} ${noVisibleText}`;
  }
  const style = video ? SELFOMAT_POCKET_PHONE_VIDEO_STYLE : SELFOMAT_POCKET_PHONE_STILL_STYLE;
  return `${style} ${noVisibleText}`;
};

const CHOREOGRAPHED_PHONE_CAMERA = /\b(?:slow\s+(?:handheld\s+)?push-?in|slow\s+zoom|tracking(?:\s+(?:move|shot))?|dolly|crane|orbit|cinematic|final\s+composition|controlled\s+act)\b/i;

export const buildSelfomatCaptureCameraDirection = ({
  captureSource,
  sceneIndex = 0,
  cameraCue = '',
} = {}) => {
  const source = resolveSelfomatCaptureSource(captureSource, sceneIndex);
  const cue = String(cameraCue || '').trim();

  if (source === SELFOMAT_CAPTURE_SOURCES.cheapCCTV) {
    return 'Fixed high-corner 4:3 security-camera view. The camera does not move.';
  }

  if (source === SELFOMAT_CAPTURE_SOURCES.firstPersonDrone) {
    return 'A small first-person drone catches the event from a low, unstable angle with a slightly rolling horizon. It corrects course abruptly; no phone framing and no fixed CCTV view.';
  }

  if (!cue || CHOREOGRAPHED_PHONE_CAMERA.test(cue)) {
    return 'The phone is lifted too late and catches the event from an awkward high edge angle; the person is only partly visible at the frame edge.';
  }

  return `Reactive phone behavior: ${cue} Framing is late and imperfect, never a deliberate camera move.`;
};
