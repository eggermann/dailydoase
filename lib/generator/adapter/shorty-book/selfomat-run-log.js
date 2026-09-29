import fs from 'fs-extra';
import path from 'node:path';

const text = (value) => String(value ?? '').trim();

const section = (title, value) => `## ${title}\n\n${text(value) || '—'}`;

const sceneSection = (scene = {}, index = 0) => [
  `### Scene ${index + 1}: ${text(scene.title) || 'Untitled'}`,
  `- Duration: ${text(scene.durationSeconds)} seconds`,
  `- Current lead / returning FIFO: ${text(scene.castUse) || 'current lead only'}`,
  `- Interaction: ${text(scene.actorsInteraction) || '—'}`,
  section('Still prompt', scene.stillPrompt),
  section('Image description', scene.imageDescription),
  section('Single-image video prompt', scene.singleImagePrompt),
  section('Video prompt', scene.videoPrompt),
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
  `Semantic topics: ${semanticTopics.map(text).filter(Boolean).join(' | ') || '—'}`,
  section('Semantic cues', semanticCues.map(text).filter(Boolean).join('\n')),
  section('Display announcement', announcement),
  section('Vision prompt', visionPrompt),
  section('Vision result', visionResult),
  section('Scene-planner system prompt', scenePlanSystemPrompt),
  section('Scene-planner context', storyTransportPrompt),
  section('Image-only starter-photo prompt', imageOnly ? starterPhotoPrompt : ''),
  section('Video generation', imageOnly ? 'disabled' : 'enabled'),
  '# Final render prompts',
  ...(Array.isArray(scenePlan) ? scenePlan.map(sceneSection) : []),
  '',
].join('\n\n');

export const saveSelfomatRunLog = async ({ outputDir, iteration, ...content } = {}) => {
  const fileName = `iteration-${String(iteration || 0).padStart(4, '0')}.txt`;
  const target = path.join(outputDir, 'selfomat-prompt-log', fileName);
  await fs.outputFile(target, formatSelfomatRunLog({ iteration, ...content }));
  return target;
};
