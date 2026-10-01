import fs from 'fs-extra';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

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

const buildIterationStructure = ({
  sourceImage = '',
  starterPhotoPrompt = '',
  semanticTopics = [],
  semanticCues = [],
  sourceCueCount,
  sourceCuePattern = [],
  sourceCuePatternTrace = [],
  sourceCueBatches = [],
  sourceCueStreamTrace = [],
  sourceCuePatternSource = 'flat-count',
  sceneCount,
  sceneLengths = [],
  visionStoryContext = null,
  scenePlanSystemPrompt = '',
  scenePlannerTrace = [],
  storyTransportPrompt = '',
  scenePlan = [],
  imageOnly = false,
  completedTransport = null,
} = {}) => ({
  contract: 'input → vision/assets → semantic stream → Taktmuster → GPT scene planner → render prompts → StoryTransport',
  stages: [
    {
      index: 1,
      name: 'input',
      sourceType: 'RUNTIME',
      output: {
        sourceImage: text(sourceImage) || '—',
        starterPhotoPromptPresent: Boolean(text(starterPhotoPrompt)),
      },
    },
    {
      index: 2,
      name: 'vision-and-assets',
      sourceType: 'GENERATED VISION',
      output: {
        visionResultPresent: Boolean(visionStoryContext),
        personAnchors: visionStoryContext?.continuityPersonAnchors || '',
        locationAnchors: visionStoryContext?.continuityLocationAnchors || '',
        people: visionStoryContext?.people || [],
      },
    },
    {
      index: 3,
      name: 'semantic-stream',
      sourceType: 'RAW + GENERATED STREAM',
      output: {
        topics: semanticTopics,
        cueCountRequested: Number(sourceCueCount) || semanticCues.length,
        cueCountReceived: semanticCues.length,
        items: (Array.isArray(sourceCueStreamTrace) ? sourceCueStreamTrace : []).map((item) => ({
          title: item.title || item.currentWord || '',
          linkWord: item.linkWord || '',
          cnt: item.cnt ?? null,
          prev: item.prev || [],
          next: item.next || [],
        })),
      },
    },
    {
      index: 4,
      name: 'taktmuster-allocation',
      sourceType: 'RUNTIME',
      output: {
        source: sourceCuePatternSource,
        pattern: sourceCuePattern,
        calls: sourceCuePatternTrace,
        batches: sourceCueBatches,
      },
    },
    {
      index: 5,
      name: 'gpt-scene-planner',
      sourceType: 'STATIC + RUNTIME',
      output: {
        systemPromptPresent: Boolean(text(scenePlanSystemPrompt)),
        contextPresent: Boolean(text(storyTransportPrompt)),
        requestTraceEntries: scenePlannerTrace.length,
        sceneCount: Number(sceneCount) || scenePlan.length,
        sceneLengths,
      },
    },
    {
      index: 6,
      name: 'scene-render-prompts',
      sourceType: 'GENERATED GPT + RUNTIME',
      output: {
        mode: imageOnly ? 'image-only' : 'image-to-video',
        scenes: (Array.isArray(scenePlan) ? scenePlan : []).map((scene, index) => ({
          index: index + 1,
          title: scene.title || '',
          cueBatch: sourceCueBatches[index] || [],
          beat: scene.beat || scene.storyBeat || '',
          stillPromptPresent: Boolean(text(scene.stillPrompt)),
          imagePromptPresent: Boolean(text(scene.singleImagePrompt || scene.stillPrompt)),
          videoPromptSent: !imageOnly && Boolean(text(scene.videoPrompt || scene.singleImagePrompt)),
        })),
      },
    },
    {
      index: 7,
      name: 'story-transport',
      sourceType: 'RUNTIME + GENERATED GPT',
      output: {
        nextTopic: completedTransport?.nextTopic || '',
        nextWordSource: completedTransport?.nextWordSource || '',
        nextWordReason: completedTransport?.nextWordReason || '',
      },
    },
  ],
});

const sceneSection = (
  scene = {},
  index = 0,
  {
    imageOnly = false,
    sourceImage = '',
    visionResult = '',
    sourceCueBatch = [],
    sourceCueStreamTraceBatch = [],
    previousScene = null,
  } = {},
) => [
  `### Scene ${index + 1}: ${text(scene.title) || 'Untitled'}`,
  'FIELD ORIGIN:',
  '- GENERATED GPT: title, beat, interaction, story event, and image wording.',
  `- RUNTIME/STATIC: duration=${text(scene.durationSeconds) || '—'} seconds; frameSource=${text(scene.frameSource) || '—'}; videoMode=${text(scene.videoMode) || '—'}; freshImage=${scene.freshImage === true ? 'true' : 'false'}; useCameraShot=${scene.useCameraShot === true ? 'true' : 'false'}.`,
  `- GENERATED GPT / FIFO: ${text(scene.castUse) || 'current lead only'}`,
  section('BEFORE → planner input', JSON.stringify({
    previousScene: previousScene
      ? {
          title: previousScene.title || '',
          residue: previousScene.creativeDecision?.residue || {},
          imageDescription: previousScene.imageDescription || '',
        }
      : {
          sourceImage,
          visionResult,
          openingState: 'No previous scene; this is the opening frame.',
        },
    sourceCueBatch,
    rawSceneCue: scene.semanticCue || '',
  }, null, 2), 'RUNTIME INPUT → state carried into this scene; semantic fragments remain planner-only'),
  section('Semantic stream getNext: source context + current title', JSON.stringify({
    plannerUse: 'title identifies the current item; prev and next provide local context; explicit linkWord is the only continuation candidate; cnt is a counter only. It has no emphasis or weighting meaning. These fields guide the scene planner and are not copied verbatim into image prompts.',
    records: sourceCueStreamTraceBatch,
  }, null, 2), 'GENERATED SEMANTIC STREAM TRACE → actual stream.getNext() context; not the Taktmuster count'),
  section('Creative decision', JSON.stringify(scene.creativeDecision || {}, null, 2), 'GENERATED GPT DECISION LAYER → visual event, body action, transformation, residue, nextWord, reason, camera move'),
  section('Residue', JSON.stringify(scene.creativeDecision?.residue || {}, null, 2), 'GENERATED GPT CONTINUITY STATE → must survive into next scene'),
  `- GENERATED GPT interaction: ${text(scene.actorsInteraction) || '—'}`,
  ...(text(scene.semanticCue)
    ? [section('Raw semantic cue for this scene', scene.semanticCue, 'RAW SEMANTIC INPUT — planner material, not image wording')]
    : []),
  section('Camera cue', scene.cameraCue, 'GENERATED GPT CAMERA DIRECTION → story-motivated perspective and movement'),
  section('Still-frame prompt', scene.stillPrompt, 'GENERATED GPT SCENE PROMPT → one visible image state; not a video prompt'),
  section('Image description', scene.imageDescription, 'GENERATED GPT VISUAL DESCRIPTION → continuity/image input'),
  imageOnly
    ? section('Image render prompt', scene.singleImagePrompt || scene.stillPrompt, 'GENERATED GPT PROMPT → image-only render plan')
    : section('Single-image video prompt', scene.singleImagePrompt, 'GENERATED GPT PROMPT → video renderer'),
  imageOnly
    ? section('Media mode', JSON.stringify({
        mode: 'image-only',
        stillImageRender: 'enabled',
        videoGeneration: 'disabled',
        videoPromptSent: false,
        videoPromptTraceOnly: Boolean(text(scene.videoPrompt)),
      }, null, 2), 'RUNTIME DECISION → no video call is made')
    : section('Video prompt', scene.videoPrompt, 'GENERATED GPT PROMPT → video renderer'),
  section('AFTER → carried to next scene', JSON.stringify({
    residue: scene.creativeDecision?.residue || {},
    nextWord: scene.creativeDecision?.nextWord || '',
    nextWordReason: scene.creativeDecision?.nextWordReason || '',
    visibleEndState: scene.imageDescription || scene.stillPrompt || '',
  }, null, 2), 'GENERATED/RUNTIME OUTPUT → this scene becomes the next scene input'),
].join('\n\n');

export const formatSelfomatRunLog = ({
  iteration,
  sourceImage,
  imageOnly = false,
  starterPhotoPrompt = '',
  semanticTopics = [],
  semanticCues = [],
  sourceCueCount,
  sourceCuePattern = [],
  sourceCuePatternTrace = [],
  sourceCueBatches = [],
  sourceCueStreamTrace = [],
  sourceCueStreamTraceBatches = [],
  sourceCuePatternSource = 'flat-count',
  sceneCount,
  sceneLengths = [],
  realityRatio,
  currentWord,
  visionStoryContext = null,
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
    `sourceCuePattern=${sourceCuePattern.length > 0 ? sourceCuePattern.join(' | ') : 'flat'}`,
    `sourceCuePatternSource=${text(sourceCuePatternSource) || 'flat-count'}`,
    `sourceCuePatternTrace=${sourceCuePatternTrace.length > 0 ? JSON.stringify(sourceCuePatternTrace) : 'none'}`,
    `sourceCueBatches=${sourceCueBatches.length > 0 ? JSON.stringify(sourceCueBatches) : 'flat'}`,
    `sourceCueStreamTrace=${sourceCueStreamTrace.length > 0 ? JSON.stringify(sourceCueStreamTrace) : 'none'}`,
    `sceneCount=${text(sceneCount) || scenePlan.length || '—'}`,
    `sceneLengths=${sceneLengths.map(text).filter(Boolean).join(', ') || '—'}`,
    `realityRatio=${text(realityRatio) || '—'}`,
    `cameraPolicy=${text(cameraPolicy) || '—'}`,
  ].join('\n'), 'RUNTIME CONFIG → rhythm and camera decision; independent from raw cue count'),
  section('Iteration structure', JSON.stringify(buildIterationStructure({
    sourceImage,
    starterPhotoPrompt,
    semanticTopics,
    semanticCues,
    sourceCueCount,
    sourceCuePattern,
    sourceCuePatternTrace,
    sourceCueBatches,
    sourceCueStreamTrace,
    sourceCuePatternSource,
    sceneCount,
    sceneLengths,
    visionStoryContext,
    scenePlanSystemPrompt,
    scenePlannerTrace,
    storyTransportPrompt,
    scenePlan,
    imageOnly,
    completedTransport,
  }), null, 2), 'RUNTIME PIPELINE MAP → ordered stage outputs and provenance'),
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
  ...(imageOnly ? [section('Image-only interpretation', [
        'The iteration produced still-image prompts only.',
        'stillPrompt = the visible destination frame for this scene.',
        'singleImagePrompt = the prompt sent to the image renderer.',
        'videoPrompt fields, when present inside the transport JSON, are trace-only and were not sent.',
      ].join('\n'), 'RUNTIME EXPLANATION → no video was generated')] : []),
  section('Image-only starter-photo prompt', imageOnly ? starterPhotoPrompt : '', 'STATIC/GENERATED STARTER PROMPT → image renderer'),
  section('Video generation', imageOnly ? 'disabled' : 'enabled', 'RUNTIME CONFIG DECISION'),
  '# Final render prompts',
  ...(Array.isArray(scenePlan)
    ? scenePlan.map((scene, index) => sceneSection(scene, index, {
        imageOnly,
        sourceImage,
        visionResult,
        sourceCueBatch: sourceCueBatches[index] || [],
        sourceCueStreamTraceBatch: sourceCueStreamTraceBatches[index] || [],
        previousScene: scenePlan[index - 1] || null,
      }))
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

const renderJsonDetails = (summary, value, className = 'trace-json') => (
  `<details class="${className}"><summary>${escapeHtml(summary)}</summary><pre>${escapeHtml(JSON.stringify(value ?? {}, null, 2))}</pre></details>`
);

const imageUrl = (imagePath) => {
  const value = text(imagePath);
  if (!value) return '';
  if (/^(?:https?:|file:)/i.test(value)) return value;
  return pathToFileURL(path.resolve(value)).href;
};

const renderImagePreview = ({ label, imagePath, emptyMessage }) => {
  const url = imageUrl(imagePath);
  if (!url) {
    return `<div class="image-preview empty"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(emptyMessage)}</span></div>`;
  }
  return `<figure class="image-preview"><figcaption>${escapeHtml(label)}</figcaption><img src="${escapeHtml(url)}" alt="${escapeHtml(label)}" loading="lazy"></figure>`;
};

const renderVisualReview = ({
  sourceImage = '',
  scenePlan = [],
  renderedSceneAssets = [],
} = {}) => {
  const assetsByScene = new Map((Array.isArray(renderedSceneAssets) ? renderedSceneAssets : [])
    .map((asset) => [Number(asset?.sceneIndex), asset]));
  const scenes = Array.isArray(scenePlan) ? scenePlan : [];

  return `<section class="visual-review">
<h2>Images and image descriptions</h2>
<details open>
<summary>Original input image</summary>
${renderImagePreview({
    label: 'Original input image',
    imagePath: sourceImage,
    emptyMessage: 'No input image was recorded.',
  })}
</details>
${scenes.map((scene, index) => {
    const asset = assetsByScene.get(index + 1) || {};
    const generatedImagePath = asset.generatedImagePath
      || asset.outputImagePath
      || scene.generatedImagePath
      || scene.outputImagePath
      || '';
    return `<details class="scene-visual">
<summary>Scene ${index + 1}: image description + images</summary>
<p class="image-description">${escapeHtml(text(scene.imageDescription) || text(scene.stillPrompt) || 'No image description was generated.')}</p>
<div class="image-grid">
${renderImagePreview({
      label: `Scene ${index + 1} original/reference image`,
      imagePath: asset.originalImagePath || sourceImage,
      emptyMessage: 'No source image was recorded.',
    })}
${renderImagePreview({
      label: `Scene ${index + 1} generated image`,
      imagePath: generatedImagePath,
      emptyMessage: 'No generated image in this run. Dry-runs do not render images.',
    })}
</div>
</details>`;
  }).join('\n')}
</section>`;
};

const renderSemanticIntegrationDetails = ({
  sourceCuePattern = [],
  sourceCuePatternTrace = [],
  sourceCueBatches = [],
  sourceCueStreamTraceBatches = [],
  scenePlan = [],
} = {}) => {
  const sceneCount = Math.max(
    sourceCueStreamTraceBatches.length,
    sourceCueBatches.length,
    Array.isArray(scenePlan) ? scenePlan.length : 0,
  );
  if (sceneCount === 0) return '';

  const sceneDetails = Array.from({ length: sceneCount }, (_, index) => {
    const trace = Array.isArray(sourceCueStreamTraceBatches[index])
      ? sourceCueStreamTraceBatches[index]
      : [];
    const scene = Array.isArray(scenePlan) ? scenePlan[index] || {} : {};
    const first = trace[0] || {};
    const last = trace[trace.length - 1] || {};
    const before = first.prev?.[0] || '—';
    const after = last.next?.[0] || '—';
    const current = trace.map((entry) => entry.title).filter(Boolean);
    const nextObligation = scene.creativeDecision?.nextWord || scene.nextWord || '—';
    const integration = {
      prev: first.prev || [],
      title: current,
      next: last.next || [],
      nextSceneObligation: nextObligation,
      generatedBeat: scene.beat || scene.storyBeat || '—',
      generatedStillPrompt: scene.stillPrompt || '—',
    };
    return `<details class="scene-integration"${index === 0 ? ' open' : ''}>
<summary>Scene ${index + 1}: ${escapeHtml(before)} → ${escapeHtml(current.join(' → ') || '—')} → ${escapeHtml(after)}</summary>
${renderJsonDetails('1. Taktmuster allocation', {
  patternValue: sourceCuePattern[index] ?? null,
  getNextCall: sourceCuePatternTrace[index] || null,
  cueBatch: sourceCueBatches[index] || [],
})}
${renderJsonDetails('2. semanticStream.getNext() — prev / title / next', trace)}
${renderJsonDetails('3. How the semantic fragments become the scene', integration, 'trace-result')}
</details>`;
  }).join('\n');

  return `<section class="semantic-integration">
<h2>Semantic integration — where AFTER/NEXT is used</h2>
<p class="integration-explanation"><code>prev</code>/<code>next</code> are passed through as the semantic provider's source-text snippets. <code>title</code> is the current stream item. Empty values remain empty; no fallback sentence is invented.</p>
${sceneDetails}
</section>`;
};

export const formatSelfomatRunLogHtml = (content = {}) => {
  const plainText = typeof content === 'string'
    ? content
    : content.rawText || formatSelfomatRunLog(content);
  let activeClass = 'neutral';
  const lines = plainText.split('\n').map((line) => {
    const detectedClass = classifyLogLine(line, activeClass);
    if (['raw', 'static', 'generated', 'runtime'].includes(detectedClass)) {
      activeClass = detectedClass;
    }
    return `<span class="log-line ${detectedClass}">${escapeHtml(line) || '&nbsp;'}</span>`;
  }).join('\n');

  const structuredIntegration = typeof content === 'string'
    ? ''
    : renderSemanticIntegrationDetails(content);
  const visualReview = typeof content === 'string'
    ? ''
    : renderVisualReview(content);

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
.semantic-integration { margin: 1rem 0 1.5rem; padding: 1rem; border: 2px solid #7f56d9; border-radius: 12px; background: #fbfaff; }
.semantic-integration h2 { margin: 0 0 .5rem; color: #6941c6; font: 700 1.1rem/1.3 ui-sans-serif, system-ui, sans-serif; }
.integration-explanation { margin: 0 0 1rem; color: #53389e; font: 14px/1.5 ui-sans-serif, system-ui, sans-serif; }
.scene-integration { margin: .7rem 0; border: 1px solid #b692f6; border-radius: 8px; background: #fff; }
.scene-integration > summary, .trace-json > summary { cursor: pointer; padding: .7rem .9rem; color: #53389e; font-weight: 700; }
.scene-integration > summary::marker, .trace-json > summary::marker { color: #7f56d9; }
.trace-json { margin: .5rem .7rem; border: 1px solid #d6bbfb; border-radius: 7px; background: #fcfaff; }
.trace-json pre { margin: 0; padding: .8rem; border: 0; border-radius: 0; box-shadow: none; background: transparent; }
.trace-result { border-color: #84ca9c; background: #f0fdf4; }
.trace-result > summary { color: #067647; }
.semantic-integration code { font-family: inherit; color: #6941c6; }
.visual-review { margin: 1rem 0 1.5rem; padding: 1rem; border: 2px solid #2e90fa; border-radius: 12px; background: #f5faff; }
.visual-review h2 { margin: 0 0 .8rem; color: #175cd3; font: 700 1.1rem/1.3 ui-sans-serif, system-ui, sans-serif; }
.visual-review details { margin: .6rem 0; border: 1px solid #84adff; border-radius: 8px; background: #fff; }
.visual-review summary { cursor: pointer; padding: .7rem .9rem; color: #175cd3; font-weight: 700; }
.image-description { margin: .7rem .9rem; font: 14px/1.5 ui-sans-serif, system-ui, sans-serif; }
.image-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: .8rem; padding: .8rem; }
.image-preview { margin: 0; overflow: hidden; border: 1px solid #d0d5dd; border-radius: 8px; background: #fff; }
.image-preview figcaption, .image-preview strong, .image-preview span { display: block; padding: .55rem .7rem; font: 700 12px/1.35 ui-sans-serif, system-ui, sans-serif; }
.image-preview img { display: block; width: 100%; max-height: 420px; object-fit: contain; background: #eaecf0; }
.image-preview.empty { min-height: 7rem; color: #667085; background: #f9fafb; }
.image-preview.empty span { font-weight: 400; }
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
${structuredIntegration}
${visualReview}
<details><summary>Full linear trace</summary>
<pre>${lines}</pre>
</details>
</main>
</body>
</html>`;
};

export const saveSelfomatRunLog = async ({ outputDir, iteration, ...content } = {}) => {
  const fileName = `iteration-${String(iteration || 0).padStart(4, '0')}.html`;
  const target = path.join(outputDir, 'selfomat-prompt-log', fileName);
  await fs.outputFile(target, formatSelfomatRunLogHtml({ iteration, ...content }));
  return target;
};
