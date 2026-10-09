import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

export const imageModel = 'bytedance:seedream@5.0-flash';
export const defaultWords = [['EU', 'de'], ['EU', 'en'], ['EU', 'ru']];
export const hash = (value) => createHash('sha256').update(value).digest('hex');
const string = { type: 'string' };
const list = (items) => ({ type: 'array', items });
const object = (properties) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });

export const planSchema = object({
  visionAnalysis: string,
  articleFacts: list(string),
  storyPremise: string,
  fictionBoundary: string,
  semanticUse: object({}), // Filled with required stream entry ids for each request.
  scenes: list(object({
    index: { type: 'integer' }, title: string, storyBeat: string,
    durationSeconds: { type: 'integer', minimum: 5, maximum: 15 },
    guernicaId: { type: 'integer', minimum: 1, maximum: 9 },
    selectionReason: string,
    crocodileAppearance: object({ present: { type: 'boolean' }, role: string, placement: string }),
    stillPrompt: string,
  })),
});

export async function buildPlanRequest({ article, semantic, catalog, sceneCount, images, model }) {
  const director = await readFile(new URL('./director.md', import.meta.url), 'utf8');
  const articleInput = Object.fromEntries(['id', 'title', 'publish_date', 'url', 'source_country', 'language', 'summary', 'text']
    .map((key) => [key, String(article[key] ?? '').slice(0, key === 'text' ? 18000 : 4000)]));
  const data = { article: articleInput, semantic, catalog, sceneCount };
  const content = [{ type: 'text', text: JSON.stringify(data) }];
  for (const image of images) {
    content.push({ type: 'text', text: image.label });
    content.push({ type: 'image_url', image_url: { url: image.dataUrl, detail: image.role === 'article' ? 'high' : 'low' } });
  }
  const schema = structuredClone(planSchema);
  schema.properties.semanticUse = object(Object.fromEntries(semantic.entries.map((entry) => [entry.id, object({ interpretation: string, visibleConsequence: string })])));
  const request = {
    model, messages: [{ role: 'system', content: director }, { role: 'user', content }],
    response_format: { type: 'json_schema', json_schema: { name: 'eu_news_scene_plan', strict: true, schema } },
    temperature: 0.65, max_completion_tokens: 7000,
  };
  const log = structuredClone(request);
  let index = 0;
  for (const part of log.messages[1].content) {
    if (part.type === 'image_url') part.image_url.url = `local:${images[index++].path}`;
  }
  return { request, log, director, directorHash: hash(director) };
}

export function validatePlan(response, { sceneCount, catalog, semantic }) {
  const choice = response.choices?.[0];
  if (choice?.message?.refusal) throw new Error(`GPT refusal: ${choice.message.refusal}`);
  if (choice?.finish_reason !== 'stop') throw new Error('GPT did not return a complete plan');
  const plan = JSON.parse(choice.message.content);
  if (!Array.isArray(plan.scenes) || plan.scenes.length !== sceneCount) throw new Error('Incorrect scene count');
  if (!plan.scenes.some((scene) => scene.crocodileAppearance?.present === true)) throw new Error('The recurring crocodile must appear in at least one scene');
  const ids = new Set(catalog.map((item) => item.id));
  for (const [index, scene] of plan.scenes.entries()) {
    if (scene.index !== index + 1 || !ids.has(scene.guernicaId)) throw new Error('Invalid scene index or Guernica id');
    if (!Number.isInteger(scene.durationSeconds) || scene.durationSeconds < 5 || scene.durationSeconds > 15) throw new Error('Invalid scene duration');
    if (typeof scene.stillPrompt !== 'string' || scene.stillPrompt.length < 200 || scene.stillPrompt.length > 10000) throw new Error('Invalid still prompt length');
    if (scene.crocodileAppearance?.present && (!/\bcrocodile\b/i.test(scene.stillPrompt) || !scene.crocodileAppearance.role.trim() || !scene.crocodileAppearance.placement.trim())) throw new Error('A visible crocodile requires a role, placement and description in the image prompt');
  }
  const expected = semantic.entries.map((entry) => entry.id).sort();
  const actual = Object.keys(plan.semanticUse || {}).sort();
  if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error('GPT must account for each semantic entry exactly once');
  return plan;
}

export function buildImageTask(scene, taskUUID, referenceImages) {
  if (referenceImages.length !== 2) throw new Error('Expected news photo and selected Guernica figure');
  return {
    taskType: 'imageInference', taskUUID, model: imageModel,
    positivePrompt: scene.stillPrompt,
    width: 1680, height: 944, numberResults: 1,
    outputType: 'URL', outputFormat: 'JPG', includeCost: true,
    inputs: { referenceImages },
  };
}
