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
  semanticUse: object({}), // Filled with one relevance decision per stream entry.
  scenes: list(object({
    index: { type: 'integer', minimum: 1, maximum: 3 }, title: string, storyBeat: string,
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
  schema.properties.scenes.items.properties.index.maximum = sceneCount;
  const relevance = { type: 'string', enum: ['relevant', 'not_relevant'] };
  schema.properties.semanticUse = object(Object.fromEntries(semantic.entries.map((entry) => [entry.id, object({
    relevance, relatedSceneIndices: list({ type: 'integer', minimum: 1, maximum: sceneCount }), visualMotif: string, visibleConsequence: { type: 'string', minLength: 20 },
  })])));
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
  const ids = new Set(catalog.map((item) => item.id));
  for (const [index, scene] of plan.scenes.entries()) {
    if (scene.index !== index + 1 || !ids.has(scene.guernicaId)) throw new Error('Invalid scene index or Guernica id');
    if (!Number.isInteger(scene.durationSeconds) || scene.durationSeconds < 5 || scene.durationSeconds > 15) throw new Error('Invalid scene duration');
    if (typeof scene.stillPrompt !== 'string' || scene.stillPrompt.length < 200 || scene.stillPrompt.length > 10000) throw new Error('Invalid still prompt length');
    if (typeof scene.videoPrompt !== 'string' || scene.videoPrompt.length < 80 || scene.videoPrompt.length > 5000) throw new Error('Invalid scene video prompt');
    if (typeof scene.videoPrompt !== 'string' || scene.videoPrompt.length < 80 || scene.videoPrompt.length > 5000) throw new Error('Invalid scene video prompt');
    if (!scene.crocodileAppearance?.present && (scene.crocodileAppearance?.role || scene.crocodileAppearance?.placement)) throw new Error('An absent crocodile must not have a role or placement');
    if (scene.crocodileAppearance?.present && (!/\bcrocodile\b/i.test(scene.stillPrompt) || !scene.crocodileAppearance.role.trim() || !scene.crocodileAppearance.placement.trim())) throw new Error('A chosen crocodile requires a meaningful role and visible description in the image prompt');
  }
  const expected = semantic.entries.map((entry) => entry.id).sort();
  const actual = Object.keys(plan.semanticUse || {}).sort();
  if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error('GPT must assess each semantic entry exactly once');
  const relevantEntries = Object.values(plan.semanticUse);
  const relevant = relevantEntries.filter((entry) => entry.relevance === 'relevant');
  if (!relevant.length) throw new Error('No semantic word was judged relevant to this story');
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
  if (referenceImages.length !== 2) throw new Error('Expected news photo and selected Guernica figure');
  return {
    taskType: 'imageInference', taskUUID, model: imageModel,
    positivePrompt: scene.stillPrompt,
    width: 1680, height: 944, numberResults: 1,
    outputType: 'URL', outputFormat: 'JPG', includeCost: true,
    inputs: { referenceImages },
  };
}
