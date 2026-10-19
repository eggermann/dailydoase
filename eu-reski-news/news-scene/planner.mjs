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
    durationSeconds: { type: 'integer', minimum: 5, maximum: 15 },
    videoPrompt: { type: 'string', minLength: 80, maxLength: 5000 },
    guernicaId: { type: 'integer', minimum: 1, maximum: 9 },
    selectionReason: string,
    crocodileAppearance: object({ present: { type: 'boolean' }, role: string, placement: string }),
    stillPrompt: string,
  })),
});

export async function buildPlanRequest({ article, semantic, catalog, sceneCount, sceneDurations, sceneDurationSettings, images, model, styleReferenceProvided = true, articleImageReferenceProvided = false, continuationPlan = null }) {
  const referenceInstructions = styleReferenceProvided
    ? 'The image API receives two references: reference image 1 is the selected masked character crop, used only for the fictional protagonist’s abstract appearance and gesture; reference image 2 is the complete painting, used only for painterly style. Do not import story content from either reference.'
    : 'The image API receives only reference image 1: the selected masked character crop, used only for the fictional protagonist’s abstract appearance and gesture. No complete painting reference is supplied; follow the written style description. Do not import story content from reference image 1.';
  const articleImageReferenceInstructions = articleImageReferenceProvided
    ? 'The image API also receives the original article photograph as reference image 2 for broad visual orientation only. Never copy its identifiable people, exact composition, logos, or readable text.'
    : 'The article photo is for GPT visual analysis only and is never sent to the image API.';
  const director = (await readFile(new URL('./director.md', import.meta.url), 'utf8'))
    .replaceAll('{{IMAGE_REFERENCE_INSTRUCTIONS}}', referenceInstructions)
    .replaceAll('{{ARTICLE_IMAGE_REFERENCE_INSTRUCTIONS}}', articleImageReferenceInstructions);
  const articleInput = Object.fromEntries(['id', 'title', 'publish_date', 'url', 'source_country', 'language', 'summary', 'text']
    .map((key) => [key, String(article[key] ?? '').slice(0, key === 'text' ? 18000 : 4000)]));
  const data = { article: articleInput, semantic, catalog, sceneCount, sceneDurations, sceneDurationSettings, continuationPlan };
  const continuationInstruction = continuationPlan
    ? `Expand the supplied ${continuationPlan.scenes.length}-scene continuationPlan into exactly ${sceneCount} scenes. Preserve its central premise and exact protagonist. Treat prior scene beats as anchors, but add distinct causal beats around them; do not return the old scene count.`
    : `Return exactly ${sceneCount} scenes.`;
  const content = [
    { type: 'text', text: `Required scene count: exactly ${sceneCount}. ${continuationInstruction}` },
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

export function validatePlan(response, { sceneCount, catalog, semantic, continuationPlan = null }) {
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
    if (!Number.isInteger(scene.durationSeconds) || scene.durationSeconds < 5 || scene.durationSeconds > 15) throw new Error('Invalid scene duration');
    if (typeof scene.stillPrompt !== 'string' || scene.stillPrompt.length < 200 || scene.stillPrompt.length > 10000) throw new Error('Invalid still prompt length');
    if (typeof scene.videoPrompt !== 'string' || scene.videoPrompt.length < 80 || scene.videoPrompt.length > 5000) throw new Error('Invalid scene video prompt');
    for (const streamEntry of semantic.entries) {
      if (containsUntranslatedStreamTerm(scene.stillPrompt, streamEntry) || containsUntranslatedStreamTerm(scene.videoPrompt, streamEntry)) {
        throw new Error('Image and video prompts must be English; translate semantic-stream terms instead of copying source-language words');
      }
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
