import fs from 'fs-extra';
import path from 'node:path';

const text = (value) => String(value ?? '').trim();

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

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
  section('Creative decision', JSON.stringify(scene.creativeDecision || {}, null, 2), 'GENERATED GPT DECISION LAYER → visual event, body action, transformation, residue, nextWord, reason, camera move'),
  section('Residue', JSON.stringify(scene.creativeDecision?.residue || {}, null, 2), 'GENERATED GPT CONTINUITY STATE → must survive into next scene'),
  `- GENERATED GPT interaction: ${text(scene.actorsInteraction) || '—'}`,
  ...(text(scene.semanticCue)
    ? [section('Raw semantic cue for this scene', scene.semanticCue, 'RAW SEMANTIC INPUT — planner material, not image wording')]
    : []),
  section('Camera cue', scene.cameraCue, 'GENERATED GPT CAMERA DIRECTION → story-motivated perspective and movement'),
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
  sourceCueCount,
  sceneCount,
  sceneLengths = [],
  realityRatio,
  currentWord,
  cameraPolicy = 'stable selfiebox camera; subtle movement only',
  visionPrompt,
  visionResult,
  scenePlanSystemPrompt,
  scenePlannerTrace = [],
  storyTransportPrompt,
  announcement,
  scenePlan = [],
  completedTransport,
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
  section('Iteration runtime config', [
    `currentWord=${text(currentWord) || '—'}`,
    `sourceCueCount=${text(sourceCueCount) || semanticCues.length || '—'}`,
    `sceneCount=${text(sceneCount) || scenePlan.length || '—'}`,
    `sceneLengths=${sceneLengths.map(text).filter(Boolean).join(', ') || '—'}`,
    `realityRatio=${text(realityRatio) || '—'}`,
    `cameraPolicy=${text(cameraPolicy) || '—'}`,
  ].join('\n'), 'RUNTIME CONFIG → rhythm and camera decision; independent from raw cue count'),
  section('Semantic cues', semanticCues.map(text).filter(Boolean).join('\n'), 'RAW SEMANTIC INPUT → sent to scene planner; not sent verbatim to image renderer'),
  section('Display announcement', announcement, 'GENERATED GPT ANNOUNCEMENT'),
  section('Vision prompt', visionPrompt, 'STATIC CONFIG PROMPT → Vision model'),
  section('Vision result', visionResult, 'GENERATED VISION OUTPUT → scene planner context'),
  section('Scene-planner system prompt', scenePlanSystemPrompt, 'STATIC CONFIG PROMPT → GPT scene planner'),
  section(
    'Scene-planner request trace',
    JSON.stringify(scenePlannerTrace, null, 2),
    'RUNTIME CAPTURE → exact GPT request arguments, messages, schema, and response metadata'
  ),
  section('Scene-planner context', storyTransportPrompt, 'RUNTIME-GENERATED CONTEXT → GPT scene planner'),
  section('Final next-word decision', completedTransport
    ? JSON.stringify({
        selectedNextWord: completedTransport.nextTopic,
        finalScenePlannerNextWord: completedTransport.story?.finalScene?.creativeDecision?.nextWord || '',
        source: completedTransport.nextWordSource,
        fallback: completedTransport.nextWordFallback,
        reason: completedTransport.nextWordReason,
        assertion: completedTransport.nextWordFallback
          || completedTransport.nextTopic === completedTransport.story?.finalScene?.creativeDecision?.nextWord,
      }, null, 2)
    : '', 'RUNTIME/GENERATED → final scene consequence becomes StoryTransport.nextTopic'),
  section('Completed StoryTransport', completedTransport ? JSON.stringify(completedTransport, null, 2) : '', 'RUNTIME ARTIFACT → completed narrative state'),
  section('Image-only starter-photo prompt', imageOnly ? starterPhotoPrompt : '', 'STATIC/GENERATED STARTER PROMPT → image renderer'),
  section('Video generation', imageOnly ? 'disabled' : 'enabled', 'RUNTIME CONFIG DECISION'),
  '# Final render prompts',
  ...(Array.isArray(scenePlan)
    ? scenePlan.map((scene, index) => sceneSection(scene, index, { imageOnly }))
    : []),
  '',
].join('\n\n');

const classifyLogLine = (line, activeClass) => {
  if (/RAW SEMANTIC INPUT|^RAW =/.test(line)) return 'raw';
  if (/STATIC CONFIG|^STATIC =/.test(line)) return 'static';
  if (/GENERATED|^GENERATED =/.test(line)) return 'generated';
  if (/RUNTIME|^RUNTIME =/.test(line)) return 'runtime';
  if (/^SOURCE TYPE:/.test(line)) return activeClass;
  if (/^#/.test(line)) return 'heading';
  return activeClass;
};

export const formatSelfomatRunLogHtml = (content = {}) => {
  const plainText = typeof content === 'string'
    ? content
    : formatSelfomatRunLog(content);
  let activeClass = 'neutral';
  const lines = plainText.split('\n').map((line) => {
    const detectedClass = classifyLogLine(line, activeClass);
    if (['raw', 'static', 'generated', 'runtime'].includes(detectedClass)) {
      activeClass = detectedClass;
    }
    return `<span class="log-line ${detectedClass}">${escapeHtml(line) || '&nbsp;'}</span>`;
  }).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Selfomat Prompt Log</title>
<style>
:root { color-scheme: light; }
body { margin: 0; padding: 2rem; background: #f6f7f9; color: #20242a; font: 14px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace; }
main { max-width: 1200px; margin: 0 auto; }
pre { padding: 1.5rem; overflow: auto; border: 1px solid #d9dde5; border-radius: 12px; background: #fff; box-shadow: 0 8px 30px #1f29370d; }
.log-line { display: block; min-height: 1.55em; white-space: pre-wrap; }
.heading { color: #111827; font-weight: 700; }
.raw { color: #b42318; background: #fff1f0; }
.static { color: #175cd3; background: #eff8ff; }
.generated { color: #087443; background: #ecfdf3; }
.runtime { color: #b54708; background: #fffaeb; }
.legend { display: flex; gap: .6rem; flex-wrap: wrap; margin: 0 0 1rem; }
.legend span { padding: .25rem .6rem; border-radius: 999px; font-weight: 700; }
.legend .raw { color: #b42318; background: #fff1f0; }
.legend .static { color: #175cd3; background: #eff8ff; }
.legend .generated { color: #087443; background: #ecfdf3; }
.legend .runtime { color: #b54708; background: #fffaeb; }
</style>
</head>
<body>
<main>
<div class="legend"><span class="raw">RAW semantic</span><span class="static">STATIC prompt/rule</span><span class="generated">GENERATED Vision/GPT</span><span class="runtime">RUNTIME decision</span></div>
<pre>${lines}</pre>
</main>
</body>
</html>`;
};

export const saveSelfomatRunLog = async ({ outputDir, iteration, ...content } = {}) => {
  const fileName = `iteration-${String(iteration || 0).padStart(4, '0')}.txt`;
  const target = path.join(outputDir, 'selfomat-prompt-log', fileName);
  await fs.outputFile(target, formatSelfomatRunLog({ iteration, ...content }));
  await fs.outputFile(
    target.replace(/\.txt$/i, '.html'),
    formatSelfomatRunLogHtml({ iteration, ...content })
  );
  return target;
};
