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
  storyPremise: string,
  fictionBoundary: string,
  protagonist: object({ name: string, role: string, visualIdentity: string, guernicaId: { type: 'integer', minimum: 1, maximum: 9 } }),
  semanticUse: object({}), // Filled with one relevance decision per stream entry.
  scenes: list(object({
    index: { type: 'integer', minimum: 1, maximum: 7 }, title: string, storyBeat: string,
    protagonistAction: string,
    composition: { type: 'string', enum: ['wide_establishing', 'intimate_close_up', 'oblique_diagonal', 'high_angle', 'low_angle', 'profile_silhouette', 'over_the_shoulder', 'foreground_frame', 'top_down'] },
    guernicaId: { type: 'integer', minimum: 1, maximum: 9 },
    selectionReason: string,
    crocodileAppearance: object({ present: { type: 'boolean' }, role: string, placement: string }),
    stillPrompt: string,
  })),
});

export async function buildPlanRequest({ article, semantic, catalog, sceneCount, visualStyleOptions = { symbolic: true, roomDeepness: false, layering: 0 }, sceneVisualControls = false, images, model, styleReferenceProvided = true, articleImageReferenceProvided = false, continuationPlan = null }) {
  const referenceInstructions = styleReferenceProvided
    ? 'The image API receives two references: reference image 1 is the selected masked character crop, used only for the fictional protagonist’s abstract appearance and gesture; reference image 2 is the complete painting, used only for painterly style. Do not import story content from either reference.'
    : 'The image API receives only reference image 1: the selected masked character crop, used only for the fictional protagonist’s abstract appearance and gesture. No complete painting reference is supplied; follow the written style description. Do not import story content from reference image 1.';
  const articleImageReferenceInstructions = articleImageReferenceProvided
    ? 'The image API also receives the original article photograph as reference image 2 for broad visual orientation only. Never copy its identifiable people, exact composition, logos, or readable text.'
    : 'The article photo is for GPT visual analysis only and is never sent to the image API.';
  const directorFile = sceneVisualControls ? './director.md' : './director-fixed-controls.md';
  const director = (await readFile(new URL(directorFile, import.meta.url), 'utf8'))
    .replaceAll('{{IMAGE_REFERENCE_INSTRUCTIONS}}', referenceInstructions)
    .replaceAll('{{ARTICLE_IMAGE_REFERENCE_INSTRUCTIONS}}', articleImageReferenceInstructions)
    .replaceAll('{{VISUAL_STYLE_CONTROLS}}', sceneVisualControls
      ? `Each scene chooses its own visual controls. Select symbolism, room depth and layering independently for that scene based on its concrete action, setting and story beat; do not copy one scene's settings to the others. Choose symbolism ON only when a specific metaphor makes the article-grounded action clearer; otherwise choose OFF. Choose room depth ON when the scene needs a meaningful foreground-to-background journey; choose OFF for a compressed mural plane. Choose an integer layering value from 0 to 7 based on how many distinct spatial planes this scene needs; use 0 when explicit planes add nothing. Explain each choice briefly in scene.visualControlReason. Put the exact chosen values in scene.visualStyleOptions and make the stillPrompt implement them. Choose freely from the scene rather than applying a run-wide default.`
      : `Visual controls for this run: symbolism=${visualStyleOptions.symbolic ? 'ON' : 'OFF'}; room depth=${visualStyleOptions.roomDeepness ? 'ON' : 'OFF'}; layering=${visualStyleOptions.layering ?? 0} (integer 0–7). Follow each control in every scene and stillPrompt. Symbolism ON means use concrete article-grounded metaphors that visibly change action or spatial relationships; symbolism OFF means depict reported situation and semantic motifs directly without allegorical overlays. Room depth ON means build painterly foreground, middle distance and receding far plane; room depth OFF means compressed shallow mural space without vanishing-point interiors. Layering N above zero means build exactly N distinct, article-grounded spatial planes with different spatial roles, then unify them with one final merge-paint layer of shared marks, pigment and contours; zero means no deliberate stacked planes. These controls work independently.`);
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
  ];
  for (const image of images) {
    content.push({ type: 'text', text: image.label });
    content.push({ type: 'image_url', image_url: { url: image.dataUrl, detail: image.role === 'article' || image.role === 'style' ? 'high' : 'low' } });
  }
  const schema = structuredClone(planSchema);
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
  const relevance = { type: 'string', enum: ['relevant', 'not_relevant'] };
  schema.properties.semanticUse = object(Object.fromEntries(semantic.entries.map((entry) => [entry.id, object({
    relevance, relatedSceneIndices: list({ type: 'integer', minimum: 1, maximum: sceneCount }), visualMotif: string, visibleConsequence: { type: 'string', minLength: 20 },
  })])));
  const request = {
    model, messages: [{ role: 'system', content: director }, { role: 'user', content }],
    response_format: { type: 'json_schema', json_schema: { name: 'eu_news_scene_plan', strict: true, schema } },
    temperature: 0.65, max_completion_tokens: 14000,
  };
  const log = structuredClone(request);
  let index = 0;
  for (const part of log.messages[1].content) {
    if (part.type === 'image_url') part.image_url.url = `local:${images[index++].path}`;
  }
  return { request, log, director, directorHash: hash(director) };
}

export function validatePlan(response, { sceneCount, catalog, semantic, continuationPlan = null, visualStyleOptions = null, sceneDurationSettings = null, visualOnly = false, sceneVisualControls = false }) {
  const choice = response.choices?.[0];
  if (choice?.message?.refusal) throw new Error(`GPT refusal: ${choice.message.refusal}`);
  if (choice?.finish_reason !== 'stop') throw new Error('GPT did not return a complete plan');
  const plan = JSON.parse(choice.message.content);
  if (!Array.isArray(plan.scenes) || plan.scenes.length !== sceneCount) throw new Error('Incorrect scene count');
  const figureIds = new Set(catalog.map((item) => item.id));
  if (!plan.protagonist?.name?.trim() || !plan.protagonist.role?.trim() || !plan.protagonist.visualIdentity?.trim() || !figureIds.has(plan.protagonist.guernicaId)) {
    throw new Error('The story needs one named protagonist with a valid Guernica character reference');
  }
  if (continuationPlan && (plan.protagonist.name !== continuationPlan.protagonist?.name || plan.protagonist.guernicaId !== continuationPlan.protagonist?.guernicaId)) {
    throw new Error('An expanded plan must preserve the original protagonist and figure reference');
  }
  for (const [index, scene] of plan.scenes.entries()) {
    if (scene.index !== index + 1 || !figureIds.has(scene.guernicaId) || !scene.protagonistAction?.toLocaleLowerCase().includes(plan.protagonist.name.toLocaleLowerCase()) || !scene.selectionReason?.trim()) throw new Error('Every scene needs the same named protagonist and a valid, justified figure reference');
    if (!scene.composition || new Set(plan.scenes.slice(0, index).map((item) => item.composition)).has(scene.composition)) throw new Error('Each scene needs a distinct composition');
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
    if (scene.crocodileAppearance?.present && (scene.visualStyleOptions?.symbolic ?? visualStyleOptions?.symbolic) === false && !/\bcrocodile\b/i.test(scene.stillPrompt)) {
      scene.crocodileAppearance = { present: false, role: '', placement: '' };
    }
    if (!scene.crocodileAppearance?.present && (scene.crocodileAppearance?.role || scene.crocodileAppearance?.placement)) throw new Error('An absent crocodile must not have a role or placement');
    if (scene.crocodileAppearance?.present && (!/\bcrocodile\b/i.test(scene.stillPrompt) || !scene.crocodileAppearance.role.trim() || !scene.crocodileAppearance.placement.trim())) throw new Error('A chosen crocodile requires a meaningful role and visible description in the image prompt');
  }
  const sceneFigureIds = plan.scenes.map((scene) => scene.guernicaId);
  if (new Set(sceneFigureIds).size < Math.min(sceneCount, 3) || sceneFigureIds.some((id, index) => index > 0 && id === sceneFigureIds[index - 1])) {
    throw new Error('Choose multiple scene-specific figure references and avoid repeating the same one in neighboring scenes');
  }
  const expected = semantic.entries.map((entry) => entry.id).sort();
  const actual = Object.keys(plan.semanticUse || {}).sort();
  if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error('GPT must assess each semantic entry exactly once');
  const relevantEntries = Object.values(plan.semanticUse);
  const relevant = relevantEntries.filter((entry) => entry.relevance === 'relevant');
  for (const entry of relevant) {
    if (!entry.relatedSceneIndices.length || !entry.visualMotif.trim() || entry.visibleConsequence.trim().length < 30) throw new Error('A relevant semantic word needs a concrete visual motif and scene');
    for (const sceneIndex of entry.relatedSceneIndices) {
      const scene = plan.scenes[sceneIndex - 1];
      if (!scene || !scene.stillPrompt.toLocaleLowerCase().includes(entry.visualMotif.toLocaleLowerCase())) throw new Error('The assigned semantic motif must appear in that scene prompt verbatim');
    }
  }
  for (const entry of relevantEntries.filter((item) => item.relevance === 'not_relevant')) {
    if (entry.relatedSceneIndices.length || entry.visualMotif || entry.visibleConsequence.trim().length < 20) throw new Error('An irrelevant stream word needs a reason, not a scene motif');
  }
  return plan;
}

export function buildImageTask(scene, taskUUID, referenceImages) {
  if (referenceImages.length < 1 || referenceImages.length > 2) throw new Error('Expected protagonist figure reference, optionally with full-painting style reference');
  return {
    taskType: 'imageInference', taskUUID, model: imageModel,
    positivePrompt: scene.stillPrompt,
    width: 1680, height: 944, numberResults: 1,
    outputType: 'URL', outputFormat: 'JPG', includeCost: true,
    inputs: { referenceImages },
  };
}
