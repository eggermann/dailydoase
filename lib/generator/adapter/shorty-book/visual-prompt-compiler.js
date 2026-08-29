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

const removeFreezeLanguage = (value) => normalizeText(value)
  .replace(/\b(?:and\s+)?(?:then\s+)?(?:holds?|remains?|stays?)\s+(?:still|static|steady)\b[^,.;!?]*/gi, '')
  .replace(/\s+([,.;!?])/g, '$1')
  .replace(/[,;]\s*([.!?])/g, '$1')
  .replace(/\s{2,}/g, ' ')
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

export const normalizeSceneAppearance = (appearance = {}, scene = {}) => {
  // `appearance` is authored scene data. It is passed through; the renderer
  // never classifies it into a visual mode or supplies its own image grammar.
  return {
    subject: normalizeText(appearance?.subject),
    surface: normalizeText(appearance?.surface),
    integration: normalizeList(appearance?.integration),
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
  if (!appearance.subject) return '';
  return appearance.surface
    ? `${appearance.subject} is visibly present at ${appearance.surface}.`
    : `${appearance.subject} is visibly present.`;
};

const describeAppearanceMotion = (appearance) => {
  return describeAppearanceState(appearance);
};

const sceneNeedsAppearanceInstruction = (scene, appearance) => Boolean(
  appearance.subject
  || appearance.surface
  || appearance.integration.length > 0
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

export const compileWanFirstLastMotionPrompt = ({
  scene = {},
  model = 'alibaba:wan@2.6-flash',
  frameRoles = [],
} = {}) => {
  const plannedMotion = [
    scene.actorsInteraction,
    scene.motionCue,
    scene.actorAction,
    scene.locationAction,
    scene.videoPrompt,
  ].map(removeFreezeLanguage).find(Boolean);
  const motion = compactText(
    plannedMotion || 'People and objects move continuously toward the end-frame state.',
    28
  );
  const prompt = `Locked-off CCTV view. ${motion}`;

  return {
    kind: 'wan-first-last-motion',
    model,
    frameRoles: normalizeReferenceRoles(frameRoles),
    prompt,
    sections: [
      section('motion', 'MOTION', motion, REQUIRED),
    ],
    droppedSections: [],
    length: prompt.length,
    limit: resolveModelPromptLimit(model),
  };
};

export const VISUAL_PROMPT_MODEL_LIMITS = MODEL_PROMPT_LIMITS;
