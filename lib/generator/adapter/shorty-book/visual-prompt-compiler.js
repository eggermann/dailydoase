const MODEL_PROMPT_LIMITS = Object.freeze({
  'runware:106@1': 3000,
  'bfl:6@1': 32000,
  'alibaba:wan@2.6-flash': 1500,
});

const DEFAULT_MODEL_LIMIT = 3000;
const REQUIRED = 0;
const IMPORTANT = 1;
const OPTIONAL = 2;

const normalizeText = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const normalizeList = (value) => (Array.isArray(value) ? value : [])
  .map(normalizeText)
  .filter(Boolean);

const compactText = (value, maxWords = 48) => normalizeText(value)
  .split(' ')
  .filter(Boolean)
  .slice(0, maxWords)
  .join(' ')
  .replace(/[;,]+$/g, '')
  .trim();

const sceneText = (scene = {}) => [
  scene.storyEvent,
  scene.locationAction,
  scene.actorAction,
  scene.stillPrompt,
  scene.imageDescription,
  scene.videoPrompt,
  scene.singleImagePrompt,
].map(normalizeText).filter(Boolean).join(' ');

const inferAppearanceMode = (scene = {}) => {
  const text = sceneText(scene).toLowerCase();
  if (/\b(reflect|reflection|mirror|eyeglass|glasses|lens|lenses|glare)\b/.test(text)) {
    return 'reflection';
  }
  if (/\b(screen|monitor|television|display|projection)\b/.test(text)) {
    return 'screen';
  }
  if (/\b(painting|photograph|poster|artwork|picture|canvas|film strip|film-strip)\b/.test(text)) {
    return 'artwork';
  }
  if (/\b(transform|becomes|turns into|morph|mutat)\b/.test(text)) {
    return 'transformation';
  }
  return 'inRoom';
};

const defaultSurfaceForMode = (mode) => ({
  reflection: 'the existing reflective surface named by the scene',
  screen: 'the existing display surface named by the scene',
  artwork: 'the existing artwork or image surface named by the scene',
  transformation: 'the existing person or object named by the scene',
  inRoom: 'the physical room',
}[mode] || 'the physical room');

const defaultIntegrationForMode = (mode) => ({
  reflection: [
    'follow the surface curvature and perspective',
    'share room glare and partial transparency',
    'remain partly occluded by the surface frame',
    'remain optically contained inside the reflective surface',
    'move only with the reflective surface and viewing angle',
  ],
  screen: [
    'remain contained by the display edges',
    'inherit display brightness, pixels, glare, and viewing angle',
  ],
  artwork: [
    'remain materially embedded in the existing artwork',
    'inherit its surface texture, frame, perspective, and room light',
  ],
  transformation: [
    'grow continuously from the existing subject',
    'preserve contact, scale, perspective, and room lighting',
  ],
  inRoom: [
    'occupy physical floor space with plausible scale and depth',
    'share room light, shadows, reflections, focus, and occlusion',
  ],
}[mode] || []);

const inferAppearanceSubject = (mode, scene = {}) => {
  const text = sceneText(scene);
  if (mode === 'reflection') {
    const match = text.match(/\b((?:(?:single|archival|flickering|high-contrast|1960s(?:-style)?)\s+){0,4}(?:close-up|portrait|face|figure))\b/i);
    return normalizeText(match?.[1]) || 'the reflected story image';
  }
  if (mode === 'screen') {
    return 'the displayed story image';
  }
  if (mode === 'artwork') {
    return 'the depicted story element';
  }
  if (mode === 'transformation') {
    return 'the transforming subject';
  }
  return '';
};

const inferAppearanceSurface = (mode, scene = {}) => {
  const text = sceneText(scene).toLowerCase();
  if (mode === 'reflection' && /\b(eyeglass|glasses|lens|lenses)\b/.test(text)) {
    return 'the existing eyeglass lenses';
  }
  if (mode === 'reflection' && /\b(window|glass)\b/.test(text)) {
    return 'the existing window glass';
  }
  return defaultSurfaceForMode(mode);
};

export const normalizeSceneAppearance = (appearance = {}, scene = {}) => {
  const inferredMode = inferAppearanceMode(scene);
  const requestedMode = normalizeText(appearance?.mode);
  const mode = ['inRoom', 'reflection', 'screen', 'artwork', 'transformation']
    .includes(requestedMode)
    ? requestedMode
    : inferredMode;
  const integration = normalizeList(appearance?.integration);

  return {
    subject: normalizeText(appearance?.subject) || inferAppearanceSubject(mode, scene),
    mode,
    surface: normalizeText(appearance?.surface) || inferAppearanceSurface(mode, scene),
    integration: integration.length > 0 ? integration : defaultIntegrationForMode(mode),
    inferred: !requestedMode,
  };
};

export const resolveModelPromptLimit = (model = '') => (
  MODEL_PROMPT_LIMITS[normalizeText(model)] || DEFAULT_MODEL_LIMIT
);

const section = (key, label, text, priority = IMPORTANT) => ({
  key,
  label,
  text: Array.isArray(text)
    ? text.map((entry) => compactText(entry)).filter(Boolean).join(' ')
    : compactText(text),
  priority,
});

const serializeSections = (sections = []) => sections
  .filter((entry) => entry.text)
  .map((entry) => `${entry.label}: ${entry.text}`)
  .join('\n');

export const fitPromptSections = ({ sections = [], limit = DEFAULT_MODEL_LIMIT } = {}) => {
  const selected = sections.filter((entry) => entry?.text);
  const droppedSections = [];

  while (serializeSections(selected).length > limit) {
    const removablePriority = Math.max(...selected.map((entry) => entry.priority));
    if (removablePriority <= REQUIRED) {
      throw new Error(`Required visual prompt exceeds model limit ${limit}`);
    }
    const removeIndex = selected.findLastIndex((entry) => entry.priority === removablePriority);
    droppedSections.unshift(selected[removeIndex].key);
    selected.splice(removeIndex, 1);
  }

  const prompt = serializeSections(selected);
  return {
    prompt,
    sections: selected,
    droppedSections,
    length: prompt.length,
    limit,
  };
};

const describeAppearanceState = (appearance) => {
  const subject = appearance.subject || 'the story-introduced element';
  return `${subject} appears as ${appearance.mode} on or within ${appearance.surface}.`;
};

const describeAppearanceMotion = (appearance) => {
  if (appearance.mode === 'reflection') {
    return `${appearance.subject || 'The reflected figure'} stays attached to ${appearance.surface}, follows its curvature and glare, and shifts only with the viewing angle.`;
  }
  if (appearance.mode === 'screen') {
    return `${appearance.subject || 'The displayed figure'} moves only inside ${appearance.surface} and inherits its glare and refresh texture.`;
  }
  if (appearance.mode === 'artwork') {
    return `${appearance.subject || 'The depicted figure'} moves within ${appearance.surface} while retaining its material surface and frame.`;
  }
  if (appearance.mode === 'transformation') {
    return `${appearance.subject || 'The transformation'} grows continuously from ${appearance.surface} without a cut.`;
  }
  return `${appearance.subject || 'The introduced figure'} moves as a physical presence in the room with grounded contact, depth, light, shadows, and occlusion.`;
};

const sceneNeedsAppearanceInstruction = (scene, appearance) => Boolean(
  appearance.subject
  || appearance.mode !== 'inRoom'
  || /\b(appear|introduc|new person|new figure|transform|morph|mutat|duplicate|double)\b/i.test(sceneText(scene))
);

const normalizeReferenceRoles = (referenceRoles = []) => referenceRoles
  .map((entry) => ({
    role: normalizeText(entry?.role),
    path: normalizeText(entry?.path),
    instruction: normalizeText(entry?.instruction),
  }))
  .filter((entry) => entry.role);

export const compileFluxEditPrompt = ({
  scene = {},
  currentState = '',
  model = 'runware:106@1',
  cameraStyle = '',
  referenceRoles = [],
} = {}) => {
  const appearance = normalizeSceneAppearance(scene.appearance, scene);
  const roles = normalizeReferenceRoles(referenceRoles);
  const structuredDelta = [
    scene.actorAction,
    scene.actorsInteraction,
    scene.locationAction,
  ].map(normalizeText).filter(Boolean);
  const fallbackDelta = scene.singleImagePrompt || scene.stillPrompt || scene.imageDescription;
  const visibleDelta = [
    ...(structuredDelta.length > 0 ? structuredDelta : [fallbackDelta]),
    ...(sceneNeedsAppearanceInstruction(scene, appearance)
      ? [describeAppearanceState(appearance)]
      : []),
  ].filter(Boolean);
  const roleText = roles.map((entry, index) => (
    `Reference ${index + 1} is ${entry.role}${entry.instruction ? `: ${entry.instruction}` : ''}.`
  ));
  const sections = [
    section('intent', 'EDIT INTENT', 'Continue the supplied current frame into the next visible story state.', REQUIRED),
    section('references', 'REFERENCE ROLES', roleText, REQUIRED),
    section('preserve', 'PRESERVE', 'Treat reference 1 as composition truth. Keep person identity, clothing, room geometry, camera position, left-right orientation, persistent furniture, openings, and existing objects unchanged unless NEXT VISIBLE CHANGE explicitly changes them.', REQUIRED),
    section('currentState', 'CURRENT VISUAL STATE', currentState || 'The supplied current frame is the visual truth; do not reconstruct it from prose.', REQUIRED),
    section('nextChange', 'NEXT VISIBLE CHANGE', visibleDelta, REQUIRED),
    section('integration', 'PHYSICAL INTEGRATION', sceneNeedsAppearanceInstruction(scene, appearance) ? appearance.integration : '', REQUIRED),
    section('cameraStyle', 'CAMERA REALITY', cameraStyle || 'Same fixed low-cost webcam, ordinary exposure, focus, compression, perspective, room light, shadows, reflections, and occlusion.', IMPORTANT),
    section('storyContext', 'OPTIONAL STORY CONTEXT', scene.storyBeat || scene.beat, OPTIONAL),
  ];
  const fitted = fitPromptSections({
    sections,
    limit: resolveModelPromptLimit(model),
  });

  return {
    kind: 'flux-image-state',
    model,
    appearance,
    referenceRoles: roles,
    ...fitted,
  };
};

export const compileWanMotionPrompt = ({
  scene = {},
  model = 'alibaba:wan@2.6-flash',
  cameraStyle = '',
  frameRoles = [],
} = {}) => {
  const appearance = normalizeSceneAppearance(scene.appearance, scene);
  const subjectMotion = normalizeText(scene.actorAction)
    || normalizeText(scene.actorsInteraction)
    || normalizeText(scene.motionCue)
    || normalizeText(scene.singleImagePrompt)
    || 'Keep subject movement restrained and physically continuous.';
  const environmentMotion = normalizeText(scene.locationAction);
  const camera = normalizeText(scene.cameraCue) || 'Fixed webcam; no operator movement and no cut.';
  const motionQuality = normalizeText(scene.motionCue)
    || 'Restrained realistic motion with natural inertia and no frozen hold.';
  const sections = [
    section('subjectMotion', 'SUBJECT MOTION', subjectMotion, REQUIRED),
    section('environmentMotion', 'ENVIRONMENT MOTION', environmentMotion, REQUIRED),
    section('appearanceMotion', 'INTEGRATED ELEMENT', sceneNeedsAppearanceInstruction(scene, appearance) ? describeAppearanceMotion(appearance) : '', REQUIRED),
    section('camera', 'CAMERA', camera, REQUIRED),
    section('motionQuality', 'MOTION QUALITY', motionQuality, IMPORTANT),
    section('continuity', 'CONTINUITY', 'Keep identity, anatomy, room layout, lighting, framing, lens behavior, and image texture stable. Every invented or transformed person remains physically integrated into the same webcam image.', REQUIRED),
    section('cameraStyle', 'CAPTURE STYLE', cameraStyle, OPTIONAL),
  ];
  const fitted = fitPromptSections({
    sections,
    limit: resolveModelPromptLimit(model),
  });

  return {
    kind: 'wan-motion',
    model,
    appearance,
    frameRoles: normalizeReferenceRoles(frameRoles),
    ...fitted,
  };
};

export const VISUAL_PROMPT_MODEL_LIMITS = MODEL_PROMPT_LIMITS;
