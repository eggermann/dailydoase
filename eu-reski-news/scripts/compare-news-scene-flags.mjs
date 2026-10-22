import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, readdir, copyFile, rename } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { randomUUID } from 'node:crypto';
import { createSemanticSource } from '../news-scene/semantic-source.mjs';
import { hash } from '../news-scene/planner.mjs';
import { visualPlanSnapshot } from '../news-scene/scene-timing.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const { values: options } = parseArgs({ options: {
  resume: { type: 'string' }, 'output-dir': { type: 'string' },
  'news-dir': { type: 'string', default: join(root, 'eu-reski-news/news/A') },
  'stream-module': { type: 'string' },
  iterations: { type: 'string', default: '3' }, scenes: { type: 'string', default: '5' },
  layerings: { type: 'string', default: '3,7' }, 'scene-length-takt': { type: 'string', default: '-1' },
} });
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const save = async (path, value) => {
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, path);
};
const exists = async (path) => {
  try { await readFile(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
};
const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const url = (path) => encodeURI(path).replaceAll('#', '%23');
const sourcePaths = [
  'eu-reski-news/scripts/run-news-scene-image-iteration.mjs',
  'eu-reski-news/scripts/compare-news-scene-flags.mjs',
  ...(await readdir(join(root, 'eu-reski-news/news-scene'))).filter((name) => /\.(mjs|md)$/.test(name)).map((name) => `eu-reski-news/news-scene/${name}`),
];
const output = options.resume ? resolve(options.resume) : resolve(options['output-dir'] || join(root, 'eu-reski-news/GENERATIONS/news', `flags-linear-${new Date().toISOString().replace(/[:.]/g, '-')}`));
let manifest;

async function prepare() {
  if (options.resume) {
    manifest = await readJson(join(output, 'comparison.json'));
    for (const [file, digest] of Object.entries(manifest.sourceHashes)) {
      if (hash(await readFile(join(root, file))) !== digest) throw new Error(`Source changed since batch started: ${file}`);
    }
    return;
  }
  const iterations = Number(options.iterations);
  const scenes = Number(options.scenes);
  const layerings = options.layerings.split(',').map(Number);
  if (!Number.isInteger(iterations) || iterations < 1 || !Number.isInteger(scenes) || scenes < 1 || scenes > 7 || !layerings.length || layerings.some((n) => !Number.isInteger(n) || n < 0 || n > 7)) throw new Error('Invalid iteration, scene or layering counts');
  await mkdir(output);
  await mkdir(join(output, 'input/news'), { recursive: true });
  const newsDirectory = resolve(options['news-dir']);
  const aggregateName = (await readdir(newsDirectory)).filter((name) => /^all-.*\.json$/.test(name)).sort().at(-1);
  if (!aggregateName) throw new Error('No saved news aggregate found');
  const aggregate = await readJson(join(newsDirectory, aggregateName));
  const articles = aggregate.news.filter((article) => /^https?:\/\//i.test(article.image || '') && (article.text || article.summary));
  if (articles.length < iterations) throw new Error('Not enough distinct eligible articles');
  await copyFile(join(newsDirectory, aggregateName), join(output, 'input/news', aggregateName));
  const stream = await createSemanticSource({ 'stream-module': options['stream-module'] });
  const snapshots = [];
  for (let index = 0; index < iterations; index += 1) {
    const snapshot = await stream.next();
    snapshots.push(snapshot);
    console.log(`Shared input ${index + 1}: ${articles[index].title}\nSemantic: ${snapshot.entries.map((entry) => entry.item.title).join(' | ')}`);
  }
  await save(join(output, 'input/semantic-sequence.json'), { snapshots });
  const sourceHashes = {};
  for (const file of sourcePaths) {
    const savedPath = join(output, 'input/source', file);
    await mkdir(dirname(savedPath), { recursive: true });
    await copyFile(join(root, file), savedPath);
    sourceHashes[file] = hash(await readFile(savedPath));
  }
  const settings = [
    { name: 'symbolic-on-depth-off', flags: ['--symbolic', '--no-room-deepness'] },
    { name: 'symbolic-on-depth-on', flags: ['--symbolic', '--room-deepness'] },
    { name: 'symbolic-off-depth-on', flags: ['--no-symbolic', '--room-deepness'] },
  ];
  manifest = {
    profile: 'Identische lineare Eingaben · drei volle Iterationen pro Variante',
    startedAt: new Date().toISOString(), status: 'running', iterations, scenes,
    aggregateHash: hash(await readFile(join(output, 'input/news', aggregateName))),
    imageSeed: 424242, sourceHashes, takt: options['scene-length-takt'],
    inputs: snapshots.map((semantic, index) => ({ articleId: articles[index].id, articleHash: hash(JSON.stringify(articles[index])), articleTitle: articles[index].title, semanticHash: hash(JSON.stringify(semantic)), semanticTitles: semantic.entries.map((entry) => entry.item.title) })),
    variants: layerings.flatMap((layering) => settings.map((setting) => ({ name: `${setting.name}-layer-${layering}`, flags: [...setting.flags, `--layering=${layering}`], layering, status: 'pending' }))),
  };
}

async function reports() {
  const records = [];
  for (const variant of manifest.variants) {
    for (let index = 1; index <= manifest.iterations; index += 1) {
      const directory = `${variant.name}/run-001/iteration-${String(index).padStart(3, '0')}`;
      if (await exists(join(output, directory, 'record.json'))) records.push({ variant, index, directory, record: await readJson(join(output, directory, 'record.json')) });
    }
  }
  return records;
}

async function refresh() {
  const records = await reports();
  const completed = records.filter(({ record }) => record.status === 'Abgeschlossen').length;
  const images = records.reduce((sum, { record }) => sum + (record.results?.filter((result) => result?.path).length || 0), 0);
  const rows = [];
  const sceneRows = [];
  for (let iteration = 1; iteration <= manifest.iterations; iteration += 1) {
    for (const variant of manifest.variants) {
      const saved = records.find((entry) => entry.variant.name === variant.name && entry.index === iteration);
      const record = saved?.record;
      const input = manifest.inputs[iteration - 1];
      rows.push(`<tr><th><b>${escape(variant.flags.join(' '))}</b><p>Iteration ${iteration} · ${escape(record?.status || 'wartet')}</p><p>${escape(input.articleTitle)}</p><p class="muted">${input.semanticTitles.map(escape).join(' · ')}</p>${saved ? `<a href="${url(saved.directory)}/index.html">Einzelbericht</a>` : ''}${record?.error ? `<p class="error">${escape(record.error)}</p>` : ''}</th>${Array.from({ length: manifest.scenes }, (_, i) => {
        const scene = record?.plan?.scenes?.[i];
        const result = record?.results?.[i];
        return `<td>${scene ? `<h3>${i + 1}. ${escape(scene.title)}</h3>` : ''}${result?.path ? `<a href="${url(`${saved.directory}/${result.path}`)}"><img loading="lazy" src="${url(`${saved.directory}/${result.path}`)}" alt="${escape(scene?.title)}"></a>` : '<p class="muted">Bild folgt</p>'}${scene ? `<p>${escape(scene.durationSeconds)} s · Figur ${scene.guernicaId}</p><p>${escape(scene.protagonistAction)}</p><details><summary>Bildprompt</summary><p>${escape(scene.stillPrompt)}</p></details><details><summary>Video-Prompt</summary><p>${escape(scene.videoPrompt)}</p></details>` : ''}</td>`;
      }).join('')}</tr>`);
    }
    for (let sceneIndex = 0; sceneIndex < manifest.scenes; sceneIndex += 1) {
      const aligned = manifest.variants.map((variant) => {
        const saved = records.find((entry) => entry.variant.name === variant.name && entry.index === iteration);
        const scene = saved?.record.plan?.scenes?.[sceneIndex];
        const result = saved?.record.results?.[sceneIndex];
        const imagePath = result?.path && saved ? url(`${saved.directory}/${result.path}`) : '';
        return `<td><h3>${escape(variant.flags.join(' '))}</h3>${imagePath ? `<a href="${imagePath}"><img loading="lazy" src="${imagePath}" alt="Iteration ${iteration}, Szene ${sceneIndex + 1}, ${escape(variant.name)}"></a>` : '<p class="muted">Bild folgt</p>'}${scene ? `<p>${escape(scene.durationSeconds)} s · Figur ${scene.guernicaId}</p><p>${escape(scene.protagonistAction)}</p><details><summary>Bildprompt</summary><p>${escape(scene.stillPrompt)}</p></details><details><summary>Video-Prompt</summary><p>${escape(scene.videoPrompt)}</p></details>` : ''}</td>`;
      }).join('');
      const commonScene = manifest.variants.map((variant) => records.find((entry) => entry.variant.name === variant.name && entry.index === iteration)?.record.plan?.scenes?.[sceneIndex]).find(Boolean);
      sceneRows.push(`<tr><th><b>Iteration ${iteration} · Szene ${sceneIndex + 1}</b><p>${escape(input.articleTitle)}</p><p>${escape(commonScene?.title || 'Wartet')}</p><p class="muted">${input.semanticTitles.map(escape).join(' · ')}</p></th>${aligned}</tr>`);
    }
  }
  const html = `<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EU-RESKI · gleiche Szenen nebeneinander</title><style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#181918;color:#e5e1d7;font:16px/1.5 system-ui}header,main{padding:24px}header{background:#142d39}h1{margin:0;font-size:34px}a,summary{color:#dfc987}summary{cursor:pointer}h3{font-size:15px;overflow-wrap:anywhere}table{border-collapse:collapse;min-width:1900px;width:100%}th,td{vertical-align:top;text-align:left;padding:12px;border:1px solid #49483f;min-width:285px;max-width:340px}th{position:sticky;left:0;z-index:1;background:#252623;width:330px}thead th{position:sticky;top:0;z-index:2;background:#252623}td img{display:block;width:100%;height:auto}td p{font-size:13px;overflow-wrap:anywhere}.scroll{overflow:auto;max-height:calc(100vh - 100px)}.muted{color:#bab6aa}.error{color:#ffa292}details p{white-space:pre-wrap;overflow-wrap:anywhere}code{overflow-wrap:anywhere}</style><header><h1>${manifest.variants.length} Varianten · gleiche Szenen nebeneinander</h1><p>${escape(manifest.status)} · ${completed}/${manifest.variants.length * manifest.iterations} Iterationen abgeschlossen · ${images}/${manifest.variants.length * manifest.iterations * manifest.scenes} Bilder</p><p>Gemeinsame Nachrichtenfolge und identische vollständige Begriffssätze pro Iterationsnummer. Layering ${[...new Set(manifest.variants.map((variant) => variant.layering))].join(' / ')} · Zeitmodus ${escape(manifest.takt)} · ${manifest.scenes} Szenen.</p></header><main><p>Jede Tabellenzeile zeigt dieselbe Nachricht und Szenennummer. Die sechs Flagkombinationen stehen direkt nebeneinander. Jede Variante durchläuft alle ${manifest.iterations} Eingaben in derselben Reihenfolge; Bild-Seeds sind pro Iteration und Szene identisch.</p><p><a href="input/semantic-sequence.json">Gemeinsame Begriffsfolge</a> · <a href="comparison.json">Eingaben, Argumente und Quellcode-Hashes</a> · <a href="comparison-by-variant.html">Ansicht nach Variante</a></p>${manifest.verification ? `<p><b>Geprüft:</b> ${escape(manifest.verification)}</p>` : ''}<div class="scroll"><table><thead><tr><th>Nachricht · Szene</th>${manifest.variants.map((variant) => `<th>${escape(variant.flags.join(' '))}</th>`).join('')}</tr></thead><tbody>${sceneRows.join('')}</tbody></table></div></main></html>`;
  await save(join(output, 'comparison.json'), manifest);
  await save(join(output, 'comparison-strips.html'), html);
  await save(join(output, 'index.html'), html);
  await save(join(output, 'comparison-by-variant.html'), `<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EU-RESKI · Ansicht nach Variante</title><style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#181918;color:#e5e1d7;font:16px/1.5 system-ui}header,main{padding:24px}header{background:#142d39}h1{margin:0;font-size:34px}a,summary{color:#dfc987}summary{cursor:pointer}h3{font-size:16px}table{border-collapse:collapse;min-width:1850px;width:100%}th,td{vertical-align:top;text-align:left;padding:14px;border:1px solid #49483f;min-width:285px;max-width:340px}th{position:sticky;left:0;z-index:1;background:#252623;width:330px}thead{background:#252623}td img{display:block;width:100%;height:auto}td p{font-size:13px}.scroll{overflow:auto}.muted{color:#bab6aa}.error{color:#ffa292}details p{white-space:pre-wrap}code{overflow-wrap:anywhere}</style><header><h1>Ansicht nach Variante</h1></header><main><p><a href="comparison-strips.html">Zur Szenenansicht</a></p><div class="scroll"><table><thead><tr><th>Flags · Nachricht · Begriffe</th>${Array.from({ length: manifest.scenes }, (_, i) => `<th>Szene ${i + 1}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div></main></html>`);
}

function run(args) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [join(root, 'eu-reski-news/scripts/run-news-scene-image-iteration.mjs'), ...args], { cwd: root, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code, signal) => code === 0 ? resolveRun() : reject(new Error(`Generator stopped: ${signal || code}`)));
  });
}

async function executeVariant(variant) {
  const variantRoot = join(output, variant.name);
  await mkdir(variantRoot, { recursive: true });
  const runRoot = join(variantRoot, 'run-001');
  const common = [
    `--iterations=${manifest.iterations}`, `--scenes=${manifest.scenes}`, '--pause-ms=0', '--article-order=linear',
    `--output-dir=${variantRoot}`, `--news-dir=${join(output, 'input/news')}`,
    `--stream-sequence-file=${join(output, 'input/semantic-sequence.json')}`,
    '--image-provider=hf-flux-klein', '--no-style-reference', '--article-image-reference', '--fixed-visual-controls',
    `--scene-length-takt=${manifest.takt}`, '--min-scene-seconds=5', '--max-scene-seconds=8',
    `--image-seed=${manifest.imageSeed}`, ...variant.flags,
  ];
  if (await exists(join(runRoot, 'run.json'))) {
    const runManifest = await readJson(join(runRoot, 'run.json'));
    // An interrupted iteration may finish via --resume before the group manifest is updated.
    for (const name of (await readdir(runRoot)).filter((name) => /^iteration-\d+$/.test(name)).sort()) {
      const recordPath = join(runRoot, name, 'record.json');
      if (!await exists(recordPath)) continue;
      let record = await readJson(recordPath);
      if (record.status !== 'Abgeschlossen') {
        await run([`--resume=${join(runRoot, name)}`, '--image-provider=hf-flux-klein', '--no-style-reference']);
        record = await readJson(recordPath);
      }
      if (!runManifest.iterations.some((iteration) => iteration.directory === name)) runManifest.iterations.push({ index: runManifest.iterations.length + 1, directory: name, report: `${name}/index.html` });
    }
    await save(join(runRoot, 'run.json'), runManifest);
    if (runManifest.iterations.length < manifest.iterations) await run([...common, `--resume-run=${runRoot}`]);
  } else await run(common);
}

async function verify() {
  for (const [file, digest] of Object.entries(manifest.sourceHashes)) {
    if (hash(await readFile(join(root, file))) !== digest) throw new Error(`Source changed during batch: ${file}`);
  }
  const records = await reports();
  if (records.length !== manifest.variants.length * manifest.iterations) throw new Error('Missing comparison iterations');
  for (const { record, index, variant, directory } of records) {
    const expected = manifest.inputs[index - 1];
    if (record.status !== 'Abgeschlossen' || record.results.length !== manifest.scenes) throw new Error(`Incomplete: ${directory}`);
    if (record.planningVersion !== 2 || record.sceneDurationSettings.takt !== Number(manifest.takt)) throw new Error(`Wrong timing pipeline: ${directory}`);
    if (record.aggregateHash !== manifest.aggregateHash || hash(JSON.stringify(record.article)) !== expected.articleHash || hash(JSON.stringify(record.semantic)) !== expected.semanticHash) throw new Error(`Input sequence differs: ${directory}`);
    if (record.visualPlanHash !== hash(JSON.stringify(visualPlanSnapshot(record.plan)))) throw new Error(`Timing altered visuals: ${directory}`);
    if (record.visualStyleOptions.layering !== variant.layering || record.visualStyleOptions.symbolic !== variant.flags.includes('--symbolic') || record.visualStyleOptions.roomDeepness !== variant.flags.includes('--room-deepness')) throw new Error(`Wrong flags: ${directory}`);
    for (const [sceneIndex, result] of record.results.entries()) {
      const expectedSeed = (manifest.imageSeed + (index - 1) * manifest.scenes + sceneIndex) % 2_147_483_647;
      if (Number(result.seed) !== expectedSeed || !await exists(join(output, directory, result.path))) throw new Error(`Image missing or seed differs: ${directory}`);
    }
  }
  for (let index = 1; index <= manifest.iterations; index += 1) {
    if (new Set(records.filter((entry) => entry.index === index).map(({ record }) => record.articleImage.sha256)).size !== 1) throw new Error(`Article photograph changed for input ${index}`);
  }
  manifest.verification = 'Alle Varianten: identische Artikel und vollständige Stream-Snapshots pro Iteration, gleiche Nachrichtenfotos und Bild-Seeds, korrekte Flags und unveränderte Bildpläne nach der Zeitwahl.';
}

let timer;
let refreshing = false;
try {
  await prepare();
  await refresh();
  console.log(`Comparison HTML: ${join(output, 'comparison-strips.html')}`);
  timer = setInterval(async () => {
    if (refreshing) return;
    refreshing = true;
    try { await refresh(); } catch (error) { console.error(`Report update: ${error.message}`); }
    finally { refreshing = false; }
  }, 2000);
  for (const variant of manifest.variants) {
    if (variant.status === 'completed') continue;
    variant.status = 'running';
    await refresh();
    console.log(`VARIANT: ${variant.name} · ${variant.flags.join(' ')}`);
    await executeVariant(variant);
    variant.status = 'completed';
    await refresh();
  }
  clearInterval(timer);
  while (refreshing) await new Promise((resolveRefresh) => setTimeout(resolveRefresh, 25));
  await verify();
  manifest.status = 'completed';
  manifest.finishedAt = new Date().toISOString();
  await refresh();
  console.log(`VERIFIED: ${join(output, 'comparison-strips.html')}`);
} catch (error) {
  if (timer) clearInterval(timer);
  if (manifest) { manifest.status = `interrupted: ${error.message}`; await refresh(); }
  console.error(`${error.message}\nResume batch: node eu-reski-news/scripts/compare-news-scene-flags.mjs --resume=${output}`);
  process.exitCode = 1;
}
