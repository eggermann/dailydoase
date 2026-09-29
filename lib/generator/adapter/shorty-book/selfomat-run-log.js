import fs from 'fs-extra';
import path from 'node:path';

const text = (value) => String(value ?? '').trim();

const section = (title, value, sourceType = '') => [
  `## ${title}`,
  sourceType ? `SOURCE TYPE: ${sourceType}` : '',
  '',
  text(value) || '—',
].filter(Boolean).join('\n\n');

const sceneSection = (scene = {}, index = 0, { imageOnly = false } = {}) => [
  `### Scene ${index + 1}: ${text(scene.title) || 'Untitled'}`,
  'FIELD ORIGIN:',
  '- GENERATED GPT: title, beat, interaction, story event, and image wording.',
  `- RUNTIME/STATIC: duration=${text(scene.durationSeconds) || '—'} seconds; frameSource=${text(scene.frameSource) || '—'}; videoMode=${text(scene.videoMode) || '—'}; freshImage=${scene.freshImage === true ? 'true' : 'false'}; useCameraShot=${scene.useCameraShot === true ? 'true' : 'false'}.`,
  `- GENERATED GPT / FIFO: ${text(scene.castUse) || 'current lead only'}`,
  `- GENERATED GPT interaction: ${text(scene.actorsInteraction) || '—'}`,
  ...(text(scene.semanticCue)
    ? [section('Raw semantic cue for this scene', scene.semanticCue, 'RAW SEMANTIC INPUT — planner material, not image wording')]
    : []),
  section('Still prompt', scene.stillPrompt, 'GENERATED GPT SCENE PROMPT → planned image input'),
  section('Image description', scene.imageDescription, 'GENERATED GPT VISUAL DESCRIPTION → continuity/image input'),
  imageOnly
    ? section('Image render prompt', scene.singleImagePrompt || scene.stillPrompt, 'GENERATED GPT PROMPT → image-only render plan')
    : section('Single-image video prompt', scene.singleImagePrompt, 'GENERATED GPT PROMPT → video renderer'),
  ...(imageOnly ? [] : [section('Video prompt', scene.videoPrompt, 'GENERATED GPT PROMPT → video renderer')]),
].join('\n\n');

export const formatSelfomatRunLog = ({
  iteration,
  sourceImage,
  imageOnly = false,
  starterPhotoPrompt = '',
  semanticTopics = [],
  semanticCues = [],
  visionPrompt,
  visionResult,
  scenePlanSystemPrompt,
  storyTransportPrompt,
  announcement,
  scenePlan = [],
} = {}) => [
  '# Selfomat Prompt Log',
  '',
  `Iteration: ${text(iteration) || '—'}`,
  `Source image: ${text(sourceImage) || '—'}`,
  'PROVENANCE LEGEND:',
  '- RAW = semantic input, shown for traceability; not an image prompt.',
  '- STATIC = configured instruction or runtime rule.',
  '- GENERATED = Vision/GPT output or prompt derived by planner.',
  '- RUNTIME = mode decision applied by Selfomat.',
  `Semantic topics: ${semanticTopics.map(text).filter(Boolean).join(' | ') || '—'}`,
  section('Semantic cues', semanticCues.map(text).filter(Boolean).join('\n'), 'RAW SEMANTIC INPUT → sent to scene planner; not sent verbatim to image renderer'),
  section('Display announcement', announcement, 'GENERATED GPT ANNOUNCEMENT'),
  section('Vision prompt', visionPrompt, 'STATIC CONFIG PROMPT → Vision model'),
  section('Vision result', visionResult, 'GENERATED VISION OUTPUT → scene planner context'),
  section('Scene-planner system prompt', scenePlanSystemPrompt, 'STATIC CONFIG PROMPT → GPT scene planner'),
  section('Scene-planner context', storyTransportPrompt, 'RUNTIME-GENERATED CONTEXT → GPT scene planner'),
  section('Image-only starter-photo prompt', imageOnly ? starterPhotoPrompt : '', 'STATIC/GENERATED STARTER PROMPT → image renderer'),
  section('Video generation', imageOnly ? 'disabled' : 'enabled', 'RUNTIME CONFIG DECISION'),
  '# Final render prompts',
  ...(Array.isArray(scenePlan)
    ? scenePlan.map((scene, index) => sceneSection(scene, index, { imageOnly }))
    : []),
  '',
].join('\n\n');

export const saveSelfomatRunLog = async ({ outputDir, iteration, ...content } = {}) => {
  const fileName = `iteration-${String(iteration || 0).padStart(4, '0')}.txt`;
  const target = path.join(outputDir, 'selfomat-prompt-log', fileName);
  await fs.outputFile(target, formatSelfomatRunLog({ iteration, ...content }));
  return target;
};
