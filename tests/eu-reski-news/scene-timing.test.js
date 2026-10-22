import { describe, expect, test } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildPlanRequest, hash, validatePlan } from '../../eu-reski-news/news-scene/planner.mjs';
import { applySceneTiming, buildTimingRequest, visualPlanSnapshot } from '../../eu-reski-news/news-scene/scene-timing.mjs';

const settings = { provider: 'GPT dramatic pacing', takt: -1, minimum: 5, maximum: 8 };
const catalog = [1, 2, 3].map((id) => ({ id, name: `Figure ${id}` }));
const semantic = { entries: [{ id: 'stream-1', seed: ['EU', 'en'], item: { title: 'Union' } }] };
const plan = {
  visionAnalysis: 'A workshop with three figures.', articleFacts: ['A workshop opens.'],
  storyPremise: 'An artisan opens a workshop.', fictionBoundary: 'The artisan is fictional.',
  protagonist: { name: 'Mira', role: 'Artisan', visualIdentity: 'A split gray mask.', guernicaId: 1 },
  semanticUse: { 'stream-1': { relevance: 'not_relevant', relatedSceneIndices: [], visualMotif: '', visibleConsequence: 'No coherent connection to this workshop.' } },
  scenes: ['wide_establishing', 'profile_silhouette', 'intimate_close_up'].map((composition, index) => ({
    index: index + 1, title: `Workshop ${index + 1}`, storyBeat: 'The artisan works.',
    protagonistAction: 'Mira assembles a curved wooden panel.', composition, guernicaId: index + 1,
    selectionReason: 'Its curved gesture supports assembly.',
    crocodileAppearance: { present: false, role: '', placement: '' },
    stillPrompt: 'An abstract monochrome cubist mural shows Mira bending a large panel in a busy workshop. Broad curved masses hold the foreground while two assistants hold its edge. Chalk and charcoal surfaces overlap with broken contours and scraped paint. No writing or additional symbols.',
  })),
};
const response = (content, finish_reason = 'stop') => ({
  choices: [{ finish_reason, message: { content: JSON.stringify(content) } }],
  usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
});
const timing = (durations = [5, 7, 8]) => ({ scenes: durations.map((durationSeconds, index) => ({
  index: index + 1, durationSeconds,
  videoPrompt: `Across ${durationSeconds} seconds, Mira slowly bends the existing panel as the assistants steady its edge. The camera follows the visible curve gently and settles on her hands without adding objects.`,
  reason: 'Die sichtbare Handlung erhält Zeit zum Entwickeln und Ausklingen.',
})) });

describe('scene timing cannot influence locked visual planning', () => {
  test('both timing modes and bounds produce identical visual requests and schemas', async () => {
    const input = { article: { title: 'Workshop', text: 'A workshop opens.' }, semantic, catalog, sceneCount: 3, images: [], model: 'gpt-4.1-mini' };
    const takt = await buildPlanRequest({ ...input, sceneDurations: [8, 5, 6], sceneDurationSettings: { ...settings, provider: 'Selfomat', takt: 4 } });
    const gpt = await buildPlanRequest({ ...input, sceneDurations: null, sceneDurationSettings: { ...settings, maximum: 15 } });
    expect(gpt.request).toEqual(takt.request);
    const data = JSON.parse(gpt.request.messages[1].content[1].text);
    expect(data).not.toHaveProperty('sceneDurationSettings');
    expect(data).not.toHaveProperty('sceneDurations');
    expect(gpt.request.response_format.json_schema.schema.properties.scenes.items.properties).not.toHaveProperty('durationSeconds');
    expect(gpt.request.response_format.json_schema.schema.properties.scenes.items.properties).not.toHaveProperty('videoPrompt');
  });

  test('per-scene controls are requested and validated independently', async () => {
    const input = { article: { title: 'Workshop', text: 'A workshop opens.' }, semantic, catalog, sceneCount: 3, images: [], model: 'gpt-4.1-mini', sceneVisualControls: true };
    const built = await buildPlanRequest(input);
    const sceneSchema = built.request.response_format.json_schema.schema.properties.scenes.items;
    expect(sceneSchema.required).toContain('visualStyleOptions');
    expect(sceneSchema.required).toContain('visualControlReason');
    expect(JSON.parse(built.request.messages[1].content[1].text).visualControlMode).toBe('scene-specific');
    expect(built.director).toContain('Each scene chooses its own visual controls');
    expect(built.director).not.toContain('mural in compressed shallow space');
    expect(built.director).not.toContain('Layer a near foreground, an active middle ground');

    const variedPlan = structuredClone(plan);
    variedPlan.scenes[0].visualStyleOptions = { symbolic: true, roomDeepness: false, layering: 2 };
    variedPlan.scenes[1].visualStyleOptions = { symbolic: false, roomDeepness: true, layering: 7 };
    variedPlan.scenes[2].visualStyleOptions = { symbolic: true, roomDeepness: true, layering: 4 };
    variedPlan.scenes.forEach((scene) => { scene.visualControlReason = 'The chosen settings match this scene action and space.'; });
    expect(validatePlan(response(variedPlan), { sceneCount: 3, catalog, semantic, visualOnly: true, sceneVisualControls: true })).toEqual(variedPlan);

    const invalidPlan = structuredClone(variedPlan);
    invalidPlan.scenes[1].visualStyleOptions.layering = 8;
    expect(() => validatePlan(response(invalidPlan), { sceneCount: 3, catalog, semantic, visualOnly: true, sceneVisualControls: true })).toThrow('visual controls');
  });

  test('a continuation cannot leak its previous timing into image planning', async () => {
    const input = { article: {}, semantic, catalog, sceneCount: 3, images: [], model: 'gpt-4.1-mini' };
    const first = await buildPlanRequest({ ...input, continuationPlan: applySceneTiming(plan, response(timing()), { sceneDurationSettings: settings }).plan });
    const second = await buildPlanRequest({ ...input, continuationPlan: applySceneTiming(plan, response(timing([8, 6, 5])), { sceneDurationSettings: settings }).plan });
    expect(first.request).toEqual(second.request);
  });

  test('GPT timing preserves every visual field and does not mutate the source plan', () => {
    const original = structuredClone(plan);
    const timed = applySceneTiming(plan, response(timing()), { sceneDurationSettings: settings });
    expect(plan).toEqual(original);
    expect(visualPlanSnapshot(timed.plan)).toEqual(plan);
    expect(timed.plan.scenes.map((scene) => scene.durationSeconds)).toEqual([5, 7, 8]);
    expect(validatePlan(response(plan), { sceneCount: 3, catalog, semantic, visualOnly: true })).toEqual(plan);
    expect(validatePlan(response(timed.plan), { sceneCount: 3, catalog, semantic, sceneDurationSettings: settings })).toEqual(timed.plan);
  });

  test.each([
    ['new image prompt', (x) => { x.scenes[0].stillPrompt = 'Changed painting'; }],
    ['new protagonist', (x) => { x.protagonist = { name: 'Changed' }; }],
    ['changed figure', (x) => { x.scenes[0].guernicaId = 9; }],
    ['changed order', (x) => { x.scenes[0].index = 2; }],
    ['missing scene', (x) => { x.scenes.pop(); }],
    ['out-of-bounds duration', (x) => { x.scenes[0].durationSeconds = 9; }],
    ['fractional duration', (x) => { x.scenes[0].durationSeconds = 5.5; }],
    ['incomplete motion', (x) => { x.scenes[0].videoPrompt = 'Move'; }],
  ])('rejects %s without changing the locked plan', (_, change) => {
    const output = timing();
    change(output);
    const original = structuredClone(plan);
    expect(() => applySceneTiming(plan, response(output), { sceneDurationSettings: settings })).toThrow();
    expect(plan).toEqual(original);
  });

  test('Taktmuster timing keeps every supplied duration exactly', () => {
    const options = { sceneDurations: [8, 5, 6], sceneDurationSettings: { ...settings, provider: 'Selfomat', takt: 4 } };
    expect(() => applySceneTiming(plan, response(timing()), options)).toThrow('fixed Taktmuster duration');
    expect(applySceneTiming(plan, response(timing(options.sceneDurations)), options).plan.scenes.map((scene) => scene.durationSeconds)).toEqual(options.sceneDurations);
    expect(JSON.parse(buildTimingRequest({ plan, ...options, model: 'gpt-4.1-mini' }).messages[1].content).sceneDurations).toEqual(options.sceneDurations);
  });

  test('truncated timing is rejected rather than applied partially', () => {
    expect(() => applySceneTiming(plan, response(timing(), 'length'), { sceneDurationSettings: settings })).toThrow('complete scene timing');
  });
});

describe('generator recovery with separate timing', () => {
  test.each([false, true])('group resume preserves scene-specific mode %s from the previous iteration', (sceneSpecific) => {
    const directory = mkdtempSync(join(tmpdir(), 'eu-reski-run-controls-'));
    try {
      const previous = join(directory, 'iteration-001');
      const news = join(directory, 'news');
      mkdirSync(previous);
      mkdirSync(news);
      const defaults = { symbolic: false, roomDeepness: true, layering: 7 };
      writeFileSync(join(previous, 'record.json'), JSON.stringify({ sceneVisualControls: sceneSpecific, visualStyleOptions: defaults }));
      writeFileSync(join(directory, 'run.json'), JSON.stringify({ iterations: [{ directory: 'iteration-001' }] }));
      writeFileSync(join(news, 'all-test.json'), JSON.stringify({ news: [{ id: 1, title: 'Workshop', text: 'A workshop opens.', image: 'https://fixture.invalid/article.png' }] }));
      writeFileSync(join(directory, 'semantic.json'), JSON.stringify(semantic));
      writeFileSync(join(directory, 'stop-fetch.mjs'), "globalThis.fetch = async () => { throw new Error('STOP_BEFORE_API'); };\n");
      const args = ['--import', join(directory, 'stop-fetch.mjs'), resolve('eu-reski-news/scripts/run-news-scene-image-iteration.mjs'), `--resume-run=${directory}`, '--iterations=2', '--scenes=3', '--scene-length-takt=-1', '--prompt-only', '--no-style-reference', `--stream-file=${join(directory, 'semantic.json')}`, `--news-dir=${news}`];
      expect(() => execFileSync(process.execPath, args, { env: { ...process.env, OPENAI_API_KEY: 'offline-fixture' }, stdio: 'pipe' })).toThrow();
      const saved = JSON.parse(readFileSync(join(directory, 'iteration-002/record.json')));
      expect(saved.error).toContain('STOP_BEFORE_API');
      expect(saved.sceneVisualControls).toBe(sceneSpecific);
      expect(saved.visualStyleOptions).toEqual(defaults);
      expect(JSON.parse(readFileSync(join(directory, 'run.json'))).visualControls).toEqual({ sceneSpecific, defaults });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test.each(['GPT dramatic pacing', 'Selfomat'])('%s creates visual and timing plans in separate API calls', (provider) => {
    const directory = mkdtempSync(join(tmpdir(), 'eu-reski-planning-'));
    try {
      const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jna8AAAAASUVORK5CYII=', 'base64');
      writeFileSync(join(directory, 'image.png'), image);
      const imageInfo = { path: 'image.png', mimeType: 'image/png', sha256: hash(image) };
      const fixedDurations = provider === 'Selfomat' ? [8, 5, 6] : null;
      const scenePlan = structuredClone(plan);
      const sceneOptions = [
        { symbolic: true, roomDeepness: false, layering: 2 },
        { symbolic: false, roomDeepness: true, layering: 7 },
        { symbolic: true, roomDeepness: true, layering: 4 },
      ];
      scenePlan.scenes.forEach((scene, index) => {
        scene.visualStyleOptions = sceneOptions[index];
        scene.visualControlReason = `These controls fit the visible action in scene ${index + 1}.`;
      });
      const record = {
        generator: 'semantic-news-v1', planningVersion: 2, createdAt: '2026-10-21T00:00:00Z',
        status: 'preparing', article: { title: 'Workshop', text: 'A workshop opens.' },
        articleImage: imageInfo, semantic, catalog: catalog.map((entry) => ({ ...entry, ...imageInfo })),
        results: [], sceneCount: 3, storyModel: 'gpt-4.1-mini',
        sceneVisualControls: true,
        visualStyleOptions: { symbolic: true, roomDeepness: false, layering: 3 },
        sceneDurations: fixedDurations, sceneDurationSettings: { ...settings, provider },
      };
      writeFileSync(join(directory, 'record.json'), JSON.stringify(record));
      writeFileSync(join(directory, 'visual-fixture.json'), JSON.stringify(response(scenePlan)));
      writeFileSync(join(directory, 'timing-fixture.json'), JSON.stringify(response(timing(fixedDurations || [5, 7, 8]))));
      writeFileSync(join(directory, 'mock-fetch.mjs'), `import fs from 'node:fs';
globalThis.fetch = async (url, init) => {
  const request = JSON.parse(init.body);
  const name = request.response_format.json_schema.name;
  if (url !== 'https://api.openai.com/v1/chat/completions' || !['eu_news_scene_plan', 'eu_news_scene_timing'].includes(name)) throw new Error('Unexpected API request');
  fs.appendFileSync(process.env.TIMING_TEST_DIRECTORY + '/calls', name + '\\n');
  const fixture = name === 'eu_news_scene_plan' ? 'visual-fixture.json' : 'timing-fixture.json';
  return new Response(fs.readFileSync(process.env.TIMING_TEST_DIRECTORY + '/' + fixture), {status: 200, headers: {'Content-Type': 'application/json'}});
};`);
      const args = ['--import', join(directory, 'mock-fetch.mjs'), resolve('eu-reski-news/scripts/run-news-scene-image-iteration.mjs'), `--resume=${directory}`, '--prompt-only', '--no-style-reference', '--image-provider=hf-flux-klein', '--scene-length-takt=-1'];
      const env = { ...process.env, OPENAI_API_KEY: 'offline-fixture', TIMING_TEST_DIRECTORY: directory };
      execFileSync(process.execPath, args, { env, stdio: 'pipe' });
      execFileSync(process.execPath, args, { env, stdio: 'pipe' });
      const saved = JSON.parse(readFileSync(join(directory, 'record.json')));
      const visual = JSON.parse(readFileSync(join(directory, 'visual-plan.json')));
      const request = JSON.parse(readFileSync(join(directory, 'gpt-request.json')));
      expect(readFileSync(join(directory, 'calls'), 'utf8')).toBe('eu_news_scene_plan\neu_news_scene_timing\n');
      expect(visualPlanSnapshot(saved.plan)).toEqual(visual);
      expect(hash(JSON.stringify(visual))).toBe(saved.visualPlanHash);
      expect(saved.plan.scenes.map((scene) => scene.visualStyleOptions)).toEqual(sceneOptions);
      expect(saved.plan.scenes[0].stillPrompt).toContain('LAYERING 2');
      expect(saved.plan.scenes[1].stillPrompt).toContain('SYMBOLISM OFF');
      expect(saved.plan.scenes[1].stillPrompt).toContain('ROOM DEEPNESS ON');
      expect(visual.scenes.every((scene) => !Object.hasOwn(scene, 'durationSeconds') && !Object.hasOwn(scene, 'videoPrompt'))).toBe(true);
      expect(JSON.parse(request.messages[1].content[1].text)).toMatchObject({ visualControlMode: 'scene-specific' });
      expect(JSON.parse(request.messages[1].content[1].text)).not.toHaveProperty('sceneDurationSettings');
      expect(saved.plan.scenes.map((scene) => scene.durationSeconds)).toEqual(fixedDurations || [5, 7, 8]);
      expect(saved.usage.total_tokens).toBe(30);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test.each(['GPT dramatic pacing', 'Selfomat', 'legacy'])('%s resumes without regenerating or changing visuals', (provider) => {
    const directory = mkdtempSync(join(tmpdir(), 'eu-reski-timing-'));
    try {
      const old = provider === 'legacy';
      const fixedDurations = provider === 'Selfomat' ? [8, 5, 6] : null;
      const initialPlan = old ? applySceneTiming(plan, response(timing()), { sceneDurationSettings: settings }).plan : plan;
      const record = {
        generator: 'semantic-news-v1', ...(old ? {} : { planningVersion: 2 }),
        createdAt: '2026-10-21T00:00:00Z', status: 'preparing', article: { title: 'Workshop', text: 'A workshop opens.' },
        plan: initialPlan, planHash: hash(JSON.stringify(initialPlan)), visualPlanHash: hash(JSON.stringify(plan)),
        semantic, catalog, results: [], sceneCount: 3, storyModel: 'gpt-4.1-mini',
        articleImage: { path: 'article.png' }, visualStyleOptions: { symbolic: true, roomDeepness: false, layering: 3 },
        sceneDurations: fixedDurations, sceneDurationSettings: { ...settings, provider },
        usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
      };
      writeFileSync(join(directory, 'record.json'), JSON.stringify(record));
      writeFileSync(join(directory, 'fixture.json'), JSON.stringify(response(timing(fixedDurations || [5, 7, 8]))));
      writeFileSync(join(directory, 'mock-fetch.mjs'), `import fs from 'node:fs';
globalThis.fetch = async (url, init) => {
  const request = JSON.parse(init.body);
  if (url !== 'https://api.openai.com/v1/chat/completions' || request.response_format.json_schema.name !== 'eu_news_scene_timing') throw new Error('Unexpected API request');
  fs.appendFileSync(process.env.TIMING_TEST_DIRECTORY + '/calls', 'timing\\n');
  return new Response(fs.readFileSync(process.env.TIMING_TEST_DIRECTORY + '/fixture.json'), {status: 200, headers: {'Content-Type': 'application/json'}});
};`);
      const args = ['--import', join(directory, 'mock-fetch.mjs'), resolve('eu-reski-news/scripts/run-news-scene-image-iteration.mjs'), `--resume=${directory}`, '--prompt-only', '--no-style-reference', '--image-provider=hf-flux-klein', '--scene-length-takt=-1'];
      const env = { ...process.env, OPENAI_API_KEY: 'offline-fixture', TIMING_TEST_DIRECTORY: directory };
      execFileSync(process.execPath, args, { env, stdio: 'pipe' });
      execFileSync(process.execPath, args, { env, stdio: 'pipe' });
      const saved = JSON.parse(readFileSync(join(directory, 'record.json')));
      expect(visualPlanSnapshot(saved.plan)).toEqual(plan);
      expect(saved.status).toBe('Prompts erstellt');
      if (!old) {
        expect(readFileSync(join(directory, 'calls'), 'utf8')).toBe('timing\n');
        expect(saved.usage.total_tokens).toBe(45);
        expect(saved.plan.scenes.map((scene) => scene.durationSeconds)).toEqual(fixedDurations || [5, 7, 8]);
        expect(saved.sceneTiming.scenes).toHaveLength(3);
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
