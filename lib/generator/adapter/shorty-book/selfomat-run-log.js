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
  sceneAspectCues = [],
  sceneAspectTrace = [],
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
  audioAdapter = '',
  finalMedia = null,
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
        sceneAspectCues,
        sceneAspectTrace,
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
        audioAdapter: text(audioAdapter) || '—',
        scenes: (Array.isArray(scenePlan) ? scenePlan : []).map((scene, index) => ({
          index: index + 1,
          title: scene.title || '',
          cueBatch: sourceCueBatches[index] || [],
          sceneAspectCue: sceneAspectCues[index] || '',
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
    {
      index: 8,
      name: 'final-music-and-mux',
      sourceType: 'GENERATED MUSIC + RUNTIME',
      output: {
        adapter: text(finalMedia?.adapter) || (text(audioAdapter).toLowerCase() === 'minimax' ? 'minimax-music3 (pending)' : '—'),
        status: text(finalMedia?.status) || 'pending',
        sourceVideo: text(finalMedia?.sourceVideo),
        audioPath: text(finalMedia?.audioPath),
        mergedFilePath: text(finalMedia?.mergedFilePath),
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
    sceneAspectCue = '',
    sceneAspectTrace = null,
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
  section('Semantic scene aspect: extra getNext()', JSON.stringify({
    cue: sceneAspectCue,
    trace: sceneAspectTrace,
    plannerUse: 'Private environment cue. May reshape room, location, object, light, texture, or atmosphere; never cast. Raw source text is not copied into visible prompts.',
  }, null, 2), 'GENERATED SEMANTIC STREAM TRACE → one extra stream item for surrounding/location/aspect'),
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
  sceneAspectCues = [],
  sceneAspectTrace = [],
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
  audioAdapter = '',
  finalMedia = null,
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
    `sceneAspectCues=${sceneAspectCues.length > 0 ? JSON.stringify(sceneAspectCues) : 'none'}`,
    `sceneAspectTrace=${sceneAspectTrace.length > 0 ? JSON.stringify(sceneAspectTrace) : 'none'}`,
    `sceneCount=${text(sceneCount) || scenePlan.length || '—'}`,
    `sceneLengths=${sceneLengths.map(text).filter(Boolean).join(', ') || '—'}`,
    `realityRatio=${text(realityRatio) || '—'}`,
    `cameraPolicy=${text(cameraPolicy) || '—'}`,
    `audioAdapter=${text(audioAdapter) || '—'}`,
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
    sceneAspectCues,
    sceneAspectTrace,
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
    audioAdapter,
    finalMedia,
  }), null, 2), 'RUNTIME PIPELINE MAP → ordered stage outputs and provenance'),
  section('Semantic cues', semanticCues.map(text).filter(Boolean).join('\n'), 'RAW SEMANTIC INPUT → sent to scene planner; not sent verbatim to image renderer'),
  section('Scene aspect cues', sceneAspectCues.map(text).filter(Boolean).join('\n'), 'RAW SEMANTIC INPUT → one extra getNext per scene; planner may reshape room/location/objects/light/atmosphere'),
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
  ...(text(starterPhotoPrompt)
    ? [section('Generated opening/start-image prompt', starterPhotoPrompt, 'GENERATED SCENE 1 PROMPT → image renderer before video scene 1')]
    : []),
  section('Video generation', imageOnly ? 'disabled' : 'enabled', 'RUNTIME CONFIG DECISION'),
  ...(text(audioAdapter).toLowerCase() === 'minimax' || finalMedia
    ? [section('Final Music-3 generation and mux', JSON.stringify(finalMedia || {
        adapter: 'minimax-music3',
        status: 'pending until all scene clips are concatenated',
      }, null, 2), 'GENERATED MUSIC + RUNTIME → one music track is created after video concat, then muxed into the final film')]
    : []),
  '# Final render prompts',
  ...(Array.isArray(scenePlan)
    ? scenePlan.map((scene, index) => sceneSection(scene, index, {
        imageOnly,
        sourceImage,
        visionResult,
        sourceCueBatch: sourceCueBatches[index] || [],
        sourceCueStreamTraceBatch: sourceCueStreamTraceBatches[index] || [],
        sceneAspectCue: sceneAspectCues[index] || '',
        sceneAspectTrace: sceneAspectTrace[index] || null,
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

const mediaTypeFromPath = (mediaPath) => {
  const value = text(mediaPath);
  const extension = path.extname(value).replace(/^\./, '').toLowerCase();
  return extension ? `video/${extension === 'm4v' ? 'mp4' : extension}` : 'video/unknown';
};

const renderImagePreview = ({ label, imagePath, emptyMessage }) => {
  const url = imageUrl(imagePath);
  if (!url) {
    return `<div class="image-preview empty"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(emptyMessage)}</span></div>`;
  }
  return `<figure class="image-preview"><figcaption>${escapeHtml(label)}</figcaption><img src="${escapeHtml(url)}" alt="${escapeHtml(label)}" loading="lazy"></figure>`;
};

const renderVideoPreview = ({ label, videoPath, emptyMessage }) => {
  const url = imageUrl(videoPath);
  if (!url) {
    return `<div class="video-preview empty"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(emptyMessage)}</span></div>`;
  }
  return `<figure class="video-preview"><figcaption>${escapeHtml(label)}</figcaption><video controls preload="metadata" src="${escapeHtml(url)}"></video></figure>`;
};

const renderAudioPreview = ({ label, audioPath, emptyMessage }) => {
  const url = imageUrl(audioPath);
  if (!url) {
    return `<div class="audio-preview empty"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(emptyMessage)}</span></div>`;
  }
  return `<figure class="audio-preview"><figcaption>${escapeHtml(label)}</figcaption><audio controls preload="metadata" src="${escapeHtml(url)}"></audio></figure>`;
};

const renderMusicGeneration = ({ audioAdapter = '', finalMedia = null } = {}) => {
  const isMiniMax = text(audioAdapter).toLowerCase() === 'minimax' || text(finalMedia?.adapter) === 'minimax-music3';
  if (!isMiniMax) return '';

  const status = text(finalMedia?.status) || 'pending';
  const explanation = status === 'completed'
    ? 'All scene clips were concatenated first. MiniMax Music 3 then generated one track from the completed StoryTransport, and the track was muxed into the final MP4.'
    : status === 'failed'
      ? 'Video concat completed, but Music 3 generation or the final mux failed. The error below is retained; no silent-audio fallback is substituted.'
      : 'This final step waits until every scene clip is rendered and concatenated. It then generates one Music 3 track and muxes it into the merged film.';
  return `<section class="music-generation">
<h2>Music generation and final video mux</h2>
<p>${escapeHtml(explanation)}</p>
${renderAudioPreview({
    label: 'MiniMax Music 3 generated track',
    audioPath: finalMedia?.audioPath,
    emptyMessage: status === 'pending' ? 'Music has not been generated yet.' : 'No local audio file was recorded.',
  })}
${renderVideoPreview({
    label: 'Final merged video with MiniMax Music 3',
    videoPath: finalMedia?.mergedFilePath,
    emptyMessage: status === 'pending' ? 'Final mux has not run yet.' : 'No final muxed video was recorded.',
  })}
${renderJsonDetails('Music-3 request and mux info', finalMedia || {
    adapter: 'minimax-music3',
    status: 'pending',
  }, 'music-info')}
</section>`;
};

const renderVideoInfo = ({ scene = {}, renderedAsset = {}, videoFile = '', imageOnly = false }) => {
  const type = text(renderedAsset.videoType)
    || text(scene.videoMode)
    || (imageOnly ? 'image-only (no video)' : 'video');
  const provider = text(renderedAsset.videoProvider) || text(renderedAsset.videoModel) || '—';
  const duration = renderedAsset.videoDurationSeconds ?? renderedAsset.durationSeconds ?? scene.durationSeconds;
  const endFrame = text(renderedAsset.endFramePath) || text(renderedAsset.lastFramePath) || '—';
  const status = videoFile
    ? 'rendered'
    : imageOnly
      ? 'not rendered (image-only run)'
      : 'planned only';
  const rows = [
    ['status', status],
    ['type', type],
    ['media type', videoFile ? mediaTypeFromPath(videoFile) : '—'],
    ['provider/model', provider],
    ['duration (seconds)', duration === undefined || duration === null || duration === '' ? '—' : duration],
    ['start frame', renderedAsset.startFramePath || renderedAsset.originalImagePath || '—'],
    ['end frame', endFrame],
    ['output', videoFile || '—'],
  ];
  return `<details class="video-info"><summary>Video type and render info</summary><dl>${rows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl></details>`;
};

const renderVideoSceneStep = ({ scene = {}, index, isLast, renderedAsset = {}, imageOnly = false }) => {
  const sceneNumber = index + 1;
  const plannedWanPrompt = text(scene.videoPrompt) || text(scene.singleImagePrompt);
  const nextLabel = isLast
    ? 'final frame / iteration consequence'
    : `Scene ${sceneNumber + 1} start frame`;
  const videoFile = text(renderedAsset.videoFile) || text(renderedAsset.videoPath);
  const startFrameLabel = renderedAsset.startFrameIsGeneratedOpening
    ? 'generated opening image'
    : renderedAsset.startFramePath || renderedAsset.originalImagePath
      ? `Scene ${sceneNumber} reference/start frame`
      : `last frame from Scene ${sceneNumber - 1} (not rendered in this image-only run)`;
  const result = videoFile
    ? `Rendered video: ${videoFile}`
    : imageOnly
      ? 'Image-only run: this prompt is shown for comparison, not sent to WAN.'
      : 'Dry run: this prompt was planned, not sent to WAN.';

  return `<details class="scene-video-step">
<summary>Video scene ${sceneNumber}: WAN motion prompt → ${escapeHtml(nextLabel)}</summary>
<p class="video-step-explanation">Start frame: ${escapeHtml(startFrameLabel)}. ${escapeHtml(result)}</p>
${renderVideoPreview({
    label: `Scene ${sceneNumber} rendered video`,
    videoPath: videoFile,
    emptyMessage: imageOnly
      ? 'No video: this run was image-only.'
      : 'No rendered video file was recorded for this scene.',
  })}
${renderVideoInfo({ scene, renderedAsset, videoFile, imageOnly })}
<pre class="wan-prompt">${escapeHtml(plannedWanPrompt || 'No video prompt was generated.')}</pre>
</details>`;
};

const renderVisualReview = ({
  sourceImage = '',
  starterPhotoPrompt = '',
  imageOnly = false,
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
${text(starterPhotoPrompt) ? `<details class="opening-image-step" open>
<summary>Generated opening image: input selfie + Scene 1 meaning</summary>
<p class="video-step-explanation">This image starts Scene 1. Scene 1's visual event and transformation shape this image prompt; its WAN prompt carries the movement.</p>
<pre class="wan-prompt">${escapeHtml(starterPhotoPrompt)}</pre>
${renderImagePreview({
      label: 'Generated opening image used as Scene 1 start frame',
      imagePath: assetsByScene.get(1)?.startFrameIsGeneratedOpening
        ? assetsByScene.get(1)?.startFramePath
        : '',
      emptyMessage: 'Prompt is ready; no opening image was rendered in this dry run.',
    })}
</details>` : ''}
${scenes.map((scene, index) => {
    const asset = assetsByScene.get(index + 1) || {};
    const generatedImagePath = asset.generatedImagePath
      || asset.outputImagePath
      || scene.generatedImagePath
      || scene.outputImagePath
      || '';
    const visualScene = `<details class="scene-visual">
<summary>Scene ${index + 1}: image description + images</summary>
<p class="image-description">${escapeHtml(text(scene.imageDescription) || text(scene.stillPrompt) || 'No image description was generated.')}</p>
<div class="image-grid">
${renderImagePreview({
      label: asset.startFrameIsGeneratedOpening && index === 0
        ? 'Scene 1 generated opening/start image'
        : `Scene ${index + 1} reference/start image`,
      imagePath: asset.startFramePath || asset.originalImagePath || (index === 0 ? sourceImage : ''),
      emptyMessage: index === 0
        ? 'No source image was recorded.'
        : 'No start frame was generated or recorded for this scene.',
    })}
${renderImagePreview({
      label: `Scene ${index + 1} generated image`,
      imagePath: generatedImagePath,
      emptyMessage: 'No generated image in this run. Dry-runs do not render images.',
    })}
</div>
</details>`;
    const videoScene = renderVideoSceneStep({
      scene,
      index,
      isLast: index === scenes.length - 1,
      renderedAsset: asset,
      imageOnly,
    });
    return `${visualScene}\n${videoScene}`;
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
  const musicGeneration = typeof content === 'string'
    ? ''
    : renderMusicGeneration(content);

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
.video-preview { margin: .7rem .9rem; overflow: hidden; border: 1px solid #fdb022; border-radius: 8px; background: #fff; }
.video-preview figcaption, .video-preview strong, .video-preview span { display: block; padding: .55rem .7rem; font: 700 12px/1.35 ui-sans-serif, system-ui, sans-serif; }
.video-preview video { display: block; width: 100%; max-height: 460px; background: #111827; }
.video-preview.empty { min-height: 5rem; color: #667085; background: #fffcf5; }
.video-preview.empty span { font-weight: 400; }
.audio-preview { margin: .7rem .9rem; overflow: hidden; border: 1px solid #86efac; border-radius: 8px; background: #fff; }
.audio-preview figcaption, .audio-preview strong, .audio-preview span { display: block; padding: .55rem .7rem; font: 700 12px/1.35 ui-sans-serif, system-ui, sans-serif; }
.audio-preview audio { display: block; width: calc(100% - 1.4rem); margin: .4rem .7rem .7rem; }
.audio-preview.empty { min-height: 4rem; color: #667085; background: #f0fdf4; }
.audio-preview.empty span { font-weight: 400; }
.music-generation { margin: 1rem 0 1.5rem; padding: 1rem; border: 2px solid #16a34a; border-radius: 12px; background: #f0fdf4; }
.music-generation h2 { margin: 0 0 .5rem; color: #15803d; font: 700 1.1rem/1.3 ui-sans-serif, system-ui, sans-serif; }
.music-generation > p { margin: .5rem 0; color: #166534; font: 14px/1.5 ui-sans-serif, system-ui, sans-serif; }
.music-info { border-color: #86efac; background: #f7fee7; }
.music-info > summary { color: #15803d; }
.video-info { margin: .7rem .9rem; border: 1px solid #fedf89; border-radius: 7px; background: #fffdf5; }
.video-info summary { cursor: pointer; padding: .6rem .7rem; color: #92400e; font-weight: 700; }
.video-info dl { display: grid; grid-template-columns: minmax(9rem, 0.35fr) minmax(0, 1fr); margin: 0; padding: .6rem .7rem .8rem; gap: .35rem .8rem; font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace; }
.video-info dl div { display: contents; }
.video-info dt { color: #92400e; font-weight: 700; }
.video-info dd { margin: 0; overflow-wrap: anywhere; color: #57320f; }
.scene-video-step { margin: .6rem 1.3rem 1rem; border: 1px solid #fdb022; border-radius: 8px; background: #fffaeb; }
.scene-video-step summary { cursor: pointer; padding: .7rem .9rem; color: #b54708; font-weight: 700; }
.video-step-explanation { margin: .7rem .9rem; color: #7a2e0e; font: 13px/1.5 ui-sans-serif, system-ui, sans-serif; }
.wan-prompt { margin: .7rem .9rem .9rem; padding: .8rem; white-space: pre-wrap; border: 1px solid #fedf89; border-radius: 6px; background: #fff; color: #7a2e0e; font: 13px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
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
${musicGeneration}
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
  const html = formatSelfomatRunLogHtml({ iteration, ...content });
  await Promise.all([
    fs.outputFile(target, html),
    fs.outputFile(path.join(outputDir, fileName), html),
  ]);
  return target;
};
