import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

export const imageModel = 'bytedance:seedream@5.0-flash';
export const defaultWords = [['EU', 'de'], ['EU', 'en'], ['EU', 'ru']];
export const hash = (value) => createHash('sha256').update(value).digest('hex');
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const containsUntranslatedStreamTerm = (text, entry) => {
  const [word, language] = entry.seed || [];
  if (!word || language === 'en' || word.length < 4 || /^[A-Z]{2,}$/.test(word)) return false;
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegex(word)}([^\\p{L}\\p{N}]|$)`, 'iu').test(text);
};
const string = { type: 'string' };
const list = (items) => ({ type: 'array', items });
const object = (properties) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });

export const planSchema = object({
  visionAnalysis: string,
  articleFacts: list(string),
  semanticUse: object({}), // Creative associations are developed before the story premise.
  storyPremise: string,
  fictionBoundary: string,
  protagonist: object({ name: string, role: string, visualIdentity: string, guernicaId: { type: 'integer', minimum: 1, maximum: 9 } }),
  scenes: list(object({
    index: { type: 'integer', minimum: 1, maximum: 12 }, title: string, storyBeat: string,
    protagonistAction: string,
    composition: { type: 'string', enum: ['wide_establishing', 'intimate_close_up', 'oblique_diagonal', 'high_angle', 'low_angle', 'profile_silhouette', 'over_the_shoulder', 'foreground_frame', 'top_down', 'extreme_detail', 'rear_view', 'negative_space'] },
    guernicaId: { type: 'integer', minimum: 1, maximum: 9 },
    selectionReason: string,
    crocodileAppearance: object({ present: { type: 'boolean' }, role: string, placement: string }),
    stillPrompt: string,
  })),
});

export async function buildPlanRequest({ article, semantic, catalog, sceneCount, visualStyleOptions = { symbolic: true, roomDeepness: false, layering: 0 }, sceneVisualControls = false, storyClou = false, images, model, styleReferenceProvided = true, locationReferenceProvided = false, articleImageReferenceProvided = false, figureReferenceProvided = true, continuationPlan = null }) {
  const referenceInstructions = figureReferenceProvided
    ? [
      'The image API receives reference image 1: the selected masked character crop, used only for the fictional protagonist’s abstract appearance and gesture.',
      styleReferenceProvided
        ? 'Reference image 2 is the complete painting, used only for painterly style.'
        : locationReferenceProvided
          ? 'Reference image 2 is the complete Guernica painting, supplied only as a subordinate setting and spatial-atmosphere reference; the article and scene action must lead. Do not use the painting as the scene composition or copy its figures, pose, motifs or color balance.'
          : 'No complete painting reference is supplied; follow the written style description.',
      locationReferenceProvided
        ? 'GPT also receives the complete Guernica painting during planning. Extract subtle setting and spatial-atmosphere ideas into the written scene prompts. The image API receives the painting only as a secondary location reference, never as the dominant subject or composition. Do not reproduce its figures, pose, composition, motifs or color balance.'
        : '',
      'Do not import story content from the character or painting references.',
    ].join(' ')
    : 'The image API receives only the original article photograph as reference image 1 for broad subject orientation. No Guernica painting or figure crop is supplied. Never copy identifiable people, exact composition, logos, or readable text.';
  const articleImageReferenceInstructions = figureReferenceProvided && articleImageReferenceProvided
    ? `The image API also receives the original article photograph as reference image ${styleReferenceProvided || locationReferenceProvided ? 3 : 2} for broad visual orientation only. Never copy its identifiable people, exact composition, logos, or readable text.`
    : figureReferenceProvided
      ? 'The article photo is for GPT visual analysis only and is never sent to the image API.'
      : 'The article photo is the only image reference sent to the image API.';
  const directorFile = sceneVisualControls ? './director.md' : './director-fixed-controls.md';
  let baseDirector = (await readFile(new URL(directorFile, import.meta.url), 'utf8'))
    .replaceAll('{{IMAGE_REFERENCE_INSTRUCTIONS}}', referenceInstructions)
    .replaceAll('{{ARTICLE_IMAGE_REFERENCE_INSTRUCTIONS}}', articleImageReferenceInstructions)
    .replaceAll('{{VISUAL_STYLE_CONTROLS}}', sceneVisualControls
      ? `Each scene chooses its own visual controls. Select symbolism, room depth and layering independently for that scene based on its concrete action, setting and story beat; do not copy one scene's settings to the others. Choose symbolism ON only when a specific metaphor makes the article-grounded action clearer; otherwise choose OFF. Choose room depth ON when the scene needs a meaningful foreground-to-background journey; choose OFF for a compressed mural plane. Choose an integer layering value from 0 to 7 based on how many distinct spatial planes this scene needs; use 0 when explicit planes add nothing. Explain each choice briefly in scene.visualControlReason. Put the exact chosen values in scene.visualStyleOptions and make the stillPrompt implement them. Choose freely from the scene rather than applying a run-wide default.`
      : `Visual controls for this run: symbolism=${visualStyleOptions.symbolic ? 'ON' : 'OFF'}; room depth=${visualStyleOptions.roomDeepness ? 'ON' : 'OFF'}; layering=${visualStyleOptions.layering ?? 0} (integer 0–7). Follow each control in every scene and stillPrompt. Symbolism ON means use concrete article-grounded metaphors that visibly change action or spatial relationships; symbolism OFF means depict reported situation and semantic motifs directly without allegorical overlays. Room depth ON means build painterly foreground, middle distance and receding far plane; room depth OFF means compressed shallow mural space without vanishing-point interiors. Layering N above zero means build exactly N distinct, article-grounded spatial planes with different spatial roles, then unify them with one final merge-paint layer of shared marks, pigment and contours; zero means no deliberate stacked planes. These controls work independently.`);
  if (!figureReferenceProvided) {
    baseDirector = baseDirector
      .replace('GPT receives article text, article photo and masked Guernica character catalog to plan the story, choose a stable protagonist identity and assign suitable scene-specific figure references. The image API receives only the selected masked figure for each scene, not the full catalog.', 'GPT receives article text and article photo only. No Guernica painting, figure crop or character catalog is supplied. Invent and keep a stable fictional protagonist identity from the story action; do not assign external figure references.')
      .replace('The selected masked figure reference defines identity cues and painted treatment only. Never copy its arm pose, body pose, silhouette, scale or placement. Use a different suitable figure reference when the scene\'s action calls for another gesture. Choose camera distance, viewing angle, body silhouette and protagonist gesture from the current scene’s action and semantic associations. They may recur when narratively justified. Never impose a stock centered figure with raised arms on unrelated actions.', 'Invent the protagonist’s identity and gesture from the current scene’s action and semantic associations. Keep that identity stable across scenes. Choose camera distance, viewing angle, body silhouette and gesture from the action; never impose a stock centered figure with raised arms on unrelated actions.')
      .replace('When supplied, use only painterly qualities from the full Guernica reference: energetic charcoal contours, fractured brushwork, oil-painted texture, scraped surface, dark tonal range, broad curved silhouettes and organic rounded masses mixed with sharp fractures.', 'Use the written painterly qualities only: energetic charcoal contours, fractured brushwork, oil-painted texture, scraped surface, dark tonal range, broad curved silhouettes and organic rounded masses mixed with sharp fractures. No Guernica image reference is supplied.')
      .replace('The selected masked figure crop may guide only the protagonist\'s abstract visual identity and gesture. Do not transfer any reference\'s original story, relationships, props, symbols, layout or arrangement.', 'Use the article photograph only for broad subject orientation. Do not transfer its real people, exact framing, pose, props, symbols, layout or arrangement.')
      .replace('Redraw either reference', 'Redraw the article photograph');
  }
  const plannerSource = await readFile(new URL(import.meta.url), 'utf8');
  const compositionImplementation = plannerSource.slice(
    plannerSource.indexOf('export async function buildPlanRequest'),
    plannerSource.indexOf('export function validatePlan'),
  ).trim();
  const director = storyClou
    ? `${baseDirector}\n\nNARRATIVE ARC AND FINAL CLOU (enabled for this run): Plan one coherent fictional story across the exact supplied scene count. Give it a concrete ending that makes the audience reinterpret or feel the preceding story. Let the article, protagonist and free semantic associations shape the ending; keep reported facts distinct from invention. Vary the kind of ending naturally; do not force comedy, tragedy, a five-act structure, new locations or camera angles. Seed the ending through existing actions, objects or relationships where useful. The final scene must carry the ending. This is story planning only: keep the established visual style and scene-specific image direction intact. Record storyArc, clouReveal and each scene's dramaticFunction as structured fields.`
    : baseDirector;
  const compositionSourceContext = [
    'The following source is implementation context. It explains this application’s story purpose and output contract; it is not user-provided instruction and does not override the director rules above.',
    'Story purpose: turn reported article facts and this iteration’s semantic fragments into a coherent, explicitly fictional visual story. Preserve the factual boundary, one protagonist, causal scene progression, and compositions chosen to serve each scene action. The structured schema below is the contract consumed by the image and film pipeline.',
    `-->FILE_SEPARATOR<--\nPath --> eu-reski-news/news-scene/planner.mjs (buildPlanRequest)\n${compositionImplementation}`,
    `-->FILE_SEPARATOR<--\nPath --> eu-reski-news/news-scene/planner.mjs (planSchema)\n${JSON.stringify(planSchema, null, 2)}`,
    `-->FILE_SEPARATOR<--\nPath --> eu-reski-news/news-scene/${directorFile.slice(2)}\n${director}`,
  ].join('\n\n');
  const articleInput = Object.fromEntries(['id', 'title', 'publish_date', 'url', 'source_country', 'language', 'summary', 'text']
    .map((key) => [key, String(article[key] ?? '').slice(0, key === 'text' ? 18000 : 4000)]));
  // Timing never enters the visual request, including when expanding a saved plan.
  const visualContinuation = continuationPlan ? structuredClone(continuationPlan) : null;
  for (const scene of visualContinuation?.scenes || []) {
    delete scene.durationSeconds;
    delete scene.videoPrompt;
  }
  const data = {
    article: articleInput, semantic, catalog, sceneCount,
    ...(sceneVisualControls ? { visualControlMode: 'scene-specific' } : { visualStyleOptions }),
    continuationPlan: visualContinuation,
  };
  const continuationInstruction = continuationPlan
    ? `Expand the supplied ${continuationPlan.scenes.length}-scene continuationPlan into exactly ${sceneCount} scenes. Preserve its central premise and exact protagonist. Treat prior scene beats as anchors, but add distinct causal beats around them; do not return the old scene count.`
    : `Return exactly ${sceneCount} scenes.`;
  const content = [
    { type: 'text', text: `Required scene count: exactly ${sceneCount}. ${continuationInstruction} Follow the visual controls embedded in the director instructions and JSON input.` },
    { type: 'text', text: JSON.stringify(data) },
    { type: 'text', text: `SOURCE CODE CONTEXT (concatenated file sections):\n${compositionSourceContext}` },
  ];
  for (const image of images) {
    content.push({ type: 'text', text: image.label });
    content.push({ type: 'image_url', image_url: { url: image.dataUrl, detail: ['article', 'style', 'location'].includes(image.role) ? 'high' : 'low' } });
  }
  const schema = structuredClone(planSchema);
  if (!figureReferenceProvided) {
    schema.properties.protagonist.properties.guernicaId = { type: 'integer', enum: [0] };
    schema.properties.scenes.items.properties.guernicaId = { type: 'integer', enum: [0] };
  }
  schema.properties.scenes.items.properties.index.maximum = sceneCount;
  schema.properties.scenes.minItems = sceneCount;
  schema.properties.scenes.maxItems = sceneCount;
  if (sceneVisualControls) {
    const properties = schema.properties.scenes.items.properties;
    schema.properties.scenes.items.required.push('visualStyleOptions', 'visualControlReason');
    properties.visualStyleOptions = object({
      symbolic: { type: 'boolean' },
      roomDeepness: { type: 'boolean' },
      layering: { type: 'integer', minimum: 0, maximum: 7 },
    });
    properties.visualControlReason = { type: 'string', minLength: 20, maxLength: 1000 };
  }
  if (storyClou) {
    const sceneProperties = schema.properties.scenes.items.properties;
    schema.properties.scenes.items.required.push('dramaticFunction');
    sceneProperties.dramaticFunction = {
      type: 'string',
      enum: ['setup', 'development', 'escalation', 'conflict', 'turning_point', 'revelation', 'resolution', 'final_clou'],
    };
    schema.properties.storyArc = object({
      setup: string,
      protagonistGoal: string,
      centralContradiction: string,
      development: string,
      turningPoint: string,
      finalClou: string,
      clouType: string,
      clouExplanation: string,
      foreshadowing: list(object({ sceneIndex: { type: 'integer', minimum: 1, maximum: sceneCount }, element: string, function: string })),
    });
    schema.properties.clouReveal = object({
      narrativeClou: string,
      intendedVisualChange: string,
      startImageMayContainClou: { type: 'boolean' },
      motionRevealPossible: { type: 'boolean' },
      requiredFinalState: string,
      explanation: string,
    });
    schema.required.push('storyArc', 'clouReveal');
  }
  const relevance = { type: 'string', enum: ['relevant', 'not_relevant'], description: 'Creative use in this fictional story, not factual relevance to the news article.' };
  schema.properties.semanticUse = object(Object.fromEntries(semantic.entries.map((entry) => [entry.id, object({
    relevance, relatedSceneIndices: list({ type: 'integer', minimum: 1, maximum: sceneCount }), visualMotif: string, visibleConsequence: string,
  })])));
  const reasoningModel = /^gpt-6(?:\.1-sol|-luna)(?:-|$)/.test(model);
  const reasoningEffort = model.startsWith('gpt-6-luna') ? 'medium' : 'high';
  const request = {
    model, messages: [{ role: 'system', content: director }, { role: 'user', content }],
    response_format: { type: 'json_schema', json_schema: { name: 'eu_news_scene_plan', strict: true, schema } },
    ...(reasoningModel ? { reasoning_effort: reasoningEffort } : { temperature: 0.65 }),
    max_completion_tokens: Math.max(14000, sceneCount * 2000),
  };
  const log = structuredClone(request);
  let index = 0;
  for (const part of log.messages[1].content) {
    if (part.type === 'image_url') part.image_url.url = `local:${images[index++].path}`;
  }
  return { request, log, director, directorHash: hash(director) };
}

export function validatePlan(response, { sceneCount, catalog, semantic, continuationPlan = null, visualStyleOptions = null, sceneDurationSettings = null, visualOnly = false, sceneVisualControls = false, storyClou = false, figureReferenceProvided = true }) {
  const choice = response.choices?.[0];
  if (choice?.message?.refusal) throw new Error(`GPT refusal: ${choice.message.refusal}`);
  if (choice?.finish_reason !== 'stop') throw new Error('GPT did not return a complete plan');
  const plan = JSON.parse(choice.message.content);
  if (!Array.isArray(plan.scenes) || plan.scenes.length !== sceneCount) throw new Error('Incorrect scene count');
  if (storyClou) {
    const arc = plan.storyArc;
    const reveal = plan.clouReveal;
    const arcTextFields = ['setup', 'protagonistGoal', 'centralContradiction', 'development', 'turningPoint', 'finalClou', 'clouType', 'clouExplanation'];
    if (!arc || arcTextFields.some((field) => typeof arc[field] !== 'string' || !arc[field].trim())
      || !Array.isArray(arc.foreshadowing)
      || !reveal || ['narrativeClou', 'intendedVisualChange', 'requiredFinalState', 'explanation'].some((field) => typeof reveal[field] !== 'string' || !reveal[field].trim())
      || typeof reveal.startImageMayContainClou !== 'boolean' || typeof reveal.motionRevealPossible !== 'boolean') {
      throw new Error('Invalid story arc or clou reveal structure');
    }
    for (const setup of arc.foreshadowing) {
      if (!setup || !Number.isInteger(setup.sceneIndex) || setup.sceneIndex < 1 || setup.sceneIndex > sceneCount
        || typeof setup.element !== 'string' || !setup.element.trim()
        || typeof setup.function !== 'string' || !setup.function.trim()) {
        throw new Error('Invalid story foreshadowing scene reference');
      }
    }
    if (plan.scenes.at(-1)?.dramaticFunction !== 'final_clou') {
      throw new Error('The final scene must carry the final_clou dramatic function');
    }
    if (plan.scenes.some((scene) => !['setup', 'development', 'escalation', 'conflict', 'turning_point', 'revelation', 'resolution', 'final_clou'].includes(scene.dramaticFunction))) {
      throw new Error('Every scene needs a valid dramatic function');
    }
  }
  const figureIds = new Set(catalog.map((item) => item.id));
  const validProtagonistReference = figureReferenceProvided
    ? figureIds.has(plan.protagonist?.guernicaId)
    : plan.protagonist?.guernicaId === 0;
  if (!plan.protagonist?.name?.trim() || !plan.protagonist.role?.trim() || !plan.protagonist.visualIdentity?.trim() || !validProtagonistReference) {
    throw new Error(figureReferenceProvided
      ? 'The story needs one named protagonist with a valid Guernica character reference'
      : 'The story needs one named protagonist and guernicaId 0 when no figure reference is supplied');
  }
  if (continuationPlan && (plan.protagonist.name !== continuationPlan.protagonist?.name || plan.protagonist.guernicaId !== continuationPlan.protagonist?.guernicaId)) {
    throw new Error('An expanded plan must preserve the original protagonist and figure reference');
  }
  for (const [index, scene] of plan.scenes.entries()) {
    const protagonistName = plan.protagonist.name.toLocaleLowerCase();
    const protagonistGivenName = protagonistName.split(/\s+/)[0];
    const protagonistAction = scene.protagonistAction?.toLocaleLowerCase() || '';
    const namesProtagonist = protagonistAction.includes(protagonistName)
      || protagonistAction.includes(protagonistGivenName);
    if (scene.index !== index + 1) throw new Error(`Scene ${index + 1} must use its matching scene index`);
    if (figureReferenceProvided ? !figureIds.has(scene.guernicaId) : scene.guernicaId !== 0) {
      throw new Error(figureReferenceProvided
        ? `Scene ${scene.index} must select a Guernica figure reference from the supplied catalog`
        : `Scene ${scene.index} must use guernicaId 0 because no figure reference is supplied`);
    }
    if (!namesProtagonist) throw new Error(`Scene ${scene.index} protagonistAction must repeat the protagonist name "${plan.protagonist.name}" instead of using a pronoun or omission`);
    if (!scene.selectionReason?.trim()) throw new Error(`Scene ${scene.index} must explain why its selected figure reference fits the action`);
    if (!planSchema.properties.scenes.items.properties.composition.enum.includes(scene.composition)) throw new Error('Each scene needs a supported composition');
    if (sceneVisualControls) {
      const controls = scene.visualStyleOptions;
      if (!controls || typeof controls.symbolic !== 'boolean' || typeof controls.roomDeepness !== 'boolean' || !Number.isInteger(controls.layering) || controls.layering < 0 || controls.layering > 7 || typeof scene.visualControlReason !== 'string' || scene.visualControlReason.trim().length < 20) {
        throw new Error('Every scene needs its own valid visual controls and a reason for choosing them');
      }
    }
    if (visualOnly) {
      if (Object.hasOwn(scene, 'durationSeconds') || Object.hasOwn(scene, 'videoPrompt')) throw new Error('Visual planning must not assign timing or video prompts');
    } else {
      const minimumSceneSeconds = sceneDurationSettings?.minimum ?? 5;
      const maximumSceneSeconds = sceneDurationSettings?.maximum ?? 15;
      if (!Number.isInteger(scene.durationSeconds) || scene.durationSeconds < minimumSceneSeconds || scene.durationSeconds > maximumSceneSeconds) throw new Error('Invalid scene duration');
      if (typeof scene.videoPrompt !== 'string' || scene.videoPrompt.length < 80 || scene.videoPrompt.length > 5000) throw new Error('Invalid scene video prompt');
    }
    if (typeof scene.stillPrompt !== 'string' || scene.stillPrompt.length < 200 || scene.stillPrompt.length > 10000) throw new Error('Invalid still prompt length');
    for (const streamEntry of semantic.entries) {
      if (containsUntranslatedStreamTerm(scene.stillPrompt, streamEntry) || (!visualOnly && containsUntranslatedStreamTerm(scene.videoPrompt, streamEntry))) {
        throw new Error('Image and video prompts must be English; translate semantic-stream terms instead of copying source-language words');
      }
    }
  }
  const expected = semantic.entries.map((entry) => entry.id).sort();
  const actual = Object.keys(plan.semanticUse || {}).sort();
  if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error('GPT must assess each semantic entry exactly once');
  // Validate structure only. GPT owns the creative connection and wording.
  for (const entry of Object.values(plan.semanticUse)) {
    if (!entry || !['relevant', 'not_relevant'].includes(entry.relevance)
      || !Array.isArray(entry.relatedSceneIndices) || typeof entry.visualMotif !== 'string'
      || typeof entry.visibleConsequence !== 'string'
      || entry.relatedSceneIndices.some((index) => !Number.isInteger(index) || index < 1 || index > sceneCount)) {
      throw new Error('Invalid semantic metadata format or scene index');
    }
  }
  return plan;
}

export function buildImageTask(scene, taskUUID, referenceImages) {
  if (referenceImages.length < 1 || referenceImages.length > 3) throw new Error('Expected protagonist figure reference, optionally with full-painting and article-photo references');
  return {
    taskType: 'imageInference', taskUUID, model: imageModel,
    positivePrompt: scene.stillPrompt,
    width: 1680, height: 944, numberResults: 1,
    outputType: 'URL', outputFormat: 'JPG', includeCost: true,
    inputs: { referenceImages },
  };
}
