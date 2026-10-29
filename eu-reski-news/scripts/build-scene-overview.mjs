import { access, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sceneDirectory = joinPath(projectDirectory, 'scenes');
const outputPath = joinPath(sceneDirectory, 'index.html');
const exhibitionRunsDirectory = joinPath(projectDirectory, 'GENERATIONS', 'news', 'exhibition');

function joinPath(...parts) {
  return resolve(...parts);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

async function findSceneFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const found = [];
  for (const entry of entries) {
    const entryPath = joinPath(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...await findSceneFiles(entryPath));
    } else if (entry.isFile() && entry.name.endsWith('.scene.json')) {
      found.push(entryPath);
    }
  }
  return found.sort((left, right) => left.localeCompare(right, 'en'));
}

function mergeSettings(defaults, overrides) {
  const merged = { ...defaults };
  for (const [key, value] of Object.entries(overrides ?? {})) {
    merged[key] = value && typeof value === 'object' && !Array.isArray(value)
      ? mergeSettings(defaults?.[key] && typeof defaults[key] === 'object' ? defaults[key] : {}, value)
      : value;
  }
  return merged;
}

function sceneFacts(scene, defaultGeneration) {
  const generation = mergeSettings(defaultGeneration, scene.generationOverrides ?? {});
  const sceneCount = generation.sceneCount ?? {};
  const sceneLength = generation.sceneLength ?? {};
  const visualControls = generation.visualControls ?? {};
  return [
    ['Eigener Zeitplan', scene.generationIntervalInMinutes === undefined
      ? 'Ordnerkonfiguration'
      : String(scene.generationIntervalInMinutes) === '-1' ? 'aus' : `${scene.generationIntervalInMinutes} min`],
    ['Bias', scene.biasMode ?? 'Ordnerkonfiguration'],
    ['Modus', generation.autoMode ? 'Auto' : 'Manuell'],
    ['Story-Modell', generation.storyModel],
    ['Source-Code-Kontext', generation.includeSourceCodeContext === false ? 'aus' : 'an'],
    ['Code-Zusammenfassung', generation.sourceCodeSummaryFile || 'keine'],
    ['Iterationen', generation.iterations],
    ['Artikelreihenfolge', generation.articleOrder],
    ['Szenenzahl', sceneCount.mode === 'fixed'
      ? `fest: ${sceneCount.count ?? '–'}`
      : `${sceneCount.mode ?? '–'} · Takt ${sceneCount.takt ?? '–'} · ${sceneCount.numerator ?? '–'}/${sceneCount.denominator ?? '–'} · Bias ${sceneCount.bias ?? '–'} · ${sceneCount.minimum ?? '–'}–${sceneCount.maximum ?? '–'}`],
    ['Szenendauer', `Takt ${sceneLength.takt ?? '–'} · ${sceneLength.type ?? '–'} · ×${sceneLength.multiplier ?? '–'} · Bias ${sceneLength.bias ?? '–'} · ${sceneLength.minimum ?? '–'}–${sceneLength.maximum ?? '–'} s`],
    ['Bildprovider', generation.imageProvider],
    ['Guernica-Stilreferenz', generation.styleReference],
    ['Guernica-Figurenreferenz', generation.guernicaFigureReference],
    ['Artikelbildreferenz', generation.articleImageReference],
    ['Legacy-Guernica-Regie', generation.legacyGuernicaStyleReferencePrompt],
    ['Cubist-Video-Stil fixiert', generation.preserveCubistVideoStyle],
    ['Visual Controls', visualControls.mode
      ? `${visualControls.mode} · Symbolik ${visualControls.symbolic ? 'an' : 'aus'} · Raumtiefe ${visualControls.roomDeepness ? 'an' : 'aus'} · Layering ${visualControls.layering ?? '–'}`
      : '–'],
    ['Videomodell', generation.videoModel],
    ['Videoauflösung / Modus', [generation.videoResolution, generation.videoMode, generation.videoSettingsMode].filter(Boolean).join(' · ')],
    ['Video-Regie', [generation.videoDirection, generation.videoVision, generation.videoAudioDirection].filter(Boolean).join(' · ') || '–'],
    ['Dialog', generation.noDialogueNarration === true ? 'aus' : 'erlaubt'],
    ['Titeltafeln', generation['generate-title-cards'] === false ? 'aus' : 'an'],
    ['Videos je Iteration', generation.videosAfterEachIteration === false ? 'aus' : 'an'],
  ].filter(([, value]) => value !== undefined && value !== null);
}

async function findRunsForScene(sceneName) {
  let entries;
  try {
    entries = await readdir(exhibitionRunsDirectory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }

  const matchingRuns = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^run-\d+$/.test(entry.name)) continue;
    const runDirectory = joinPath(exhibitionRunsDirectory, entry.name);
    let run;
    try {
      run = JSON.parse(await readFile(joinPath(runDirectory, 'run.json'), 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    if (!(run.iteratorNames ?? []).includes(sceneName)) continue;

    const relativeRunPath = relative(sceneDirectory, runDirectory).split(/[\\/]/).join('/');
    let filmUrl = null;
    if (run.assembledFilm?.path) {
      const filmPath = joinPath(runDirectory, run.assembledFilm.path);
      try {
        await access(filmPath);
        filmUrl = `${relativeRunPath}/${run.assembledFilm.path}`.replaceAll('\\', '/');
      } catch {
        // Report the run even if its recorded film file was moved or cleaned up.
      }
    }
    matchingRuns.push({
      name: entry.name,
      status: run.status ?? 'unbekannt',
      iterations: run.iterations?.length ?? 0,
      storyModel: run.generationSettings?.storyModel ?? run.runOptions?.['story-model'] ?? 'unbekannt',
      autoMode: run.generationSettings?.autoMode,
      imageProvider: run.generationSettings?.imageProvider,
      videoModel: run.generationSettings?.videoModel,
      expectedStoryModel: null,
      filmUrl,
      reportUrl: `${relativeRunPath}/index.html`,
      hasReport: await access(joinPath(runDirectory, 'index.html')).then(() => true, () => false),
      startedAt: run.startedAt ?? '',
    });
  }
  return matchingRuns.sort((left, right) => right.name.localeCompare(left.name, 'en'));
}

async function readOriginalProfileName(reference) {
  if (reference?.profileName) return reference.profileName;
  if (!reference?.iteratorPlan?.startsWith('file://')) return null;
  try {
    const plan = JSON.parse(await readFile(new URL(reference.iteratorPlan), 'utf8'));
    return plan.iterators?.map((iterator) => iterator.name).filter(Boolean).join(', ') || null;
  } catch {
    return null;
  }
}

function renderComparisonFilms(scene, matchingRuns, effectiveGeneration, originalProfileName) {
  const reference = scene.reference ?? {};
  const originalFilm = reference.film
    ? `<li class="film-reference"><b>Originalfilm:</b> <a href="${escapeHtml(reference.film)}">Film ansehen</a>${originalProfileName ? ` · damals gestartetes Profil: <code>${escapeHtml(originalProfileName)}</code>` : ''}${reference.runManifest ? ` · <a href="${escapeHtml(reference.runManifest)}">Run-Protokoll</a>` : ''}${reference.notes ? `<p>${escapeHtml(reference.notes)}</p>` : ''}</li>`
    : '';
  const filmRuns = matchingRuns.filter((run) => run.filmUrl).map((run) => {
    const modelDiffers = run.storyModel !== effectiveGeneration.storyModel;
    const settingsNote = modelDiffers
      ? ` · älterer Stand: Story-Modell ${escapeHtml(run.storyModel)} (Scene jetzt: ${escapeHtml(effectiveGeneration.storyModel)})`
      : '';
    const mode = run.autoMode === undefined ? '' : ` · Auto-Modus ${run.autoMode ? 'an' : 'aus'}`;
    const models = [run.imageProvider, run.videoModel].filter(Boolean).join(' / ');
    return `<li><b>${escapeHtml(run.name)}</b> · ${run.iterations} Iteration(en) · Story ${escapeHtml(run.storyModel)}${mode}${models ? ` · Bild/Video ${escapeHtml(models)}` : ''} · <a href="${escapeHtml(run.filmUrl)}">Film ansehen</a>${settingsNote}</li>`;
  }).join('');
  const runsWithoutFilm = matchingRuns.filter((run) => !run.filmUrl).map((run) => {
    const report = run.hasReport ? ` · <a href="${escapeHtml(run.reportUrl)}">Run-Bericht</a>` : '';
    return `<li><b>${escapeHtml(run.name)}</b> · ${escapeHtml(run.status)} · ${run.iterations} Iteration(en)${report}</li>`;
  }).join('');

  if (!originalFilm && !filmRuns && !runsWithoutFilm) {
    return `<section class="comparison"><h3>Vergleichsfilm</h3><p>Noch kein zugeordneter Originalfilm dokumentiert.</p></section>`;
  }
  return `<section class="comparison"><h3>Filme zum Vergleichen</h3><ul>${originalFilm}${filmRuns}</ul>${runsWithoutFilm ? `<details><summary>${matchingRuns.filter((run) => !run.filmUrl).length} weitere Starts ohne Gesamtfilm</summary><ul>${runsWithoutFilm}</ul></details>` : ''}<p>Die Run-Namen zeigen, welches Scene-Profil gestartet wurde. Ältere Filme können mit früheren Einstellungen entstanden sein.</p></section>`;
}

const sceneFiles = await findSceneFiles(sceneDirectory);
const defaultSettings = JSON.parse(await readFile(joinPath(projectDirectory, 'default-exhibition-settings.json'), 'utf8'));
const scenes = await Promise.all(sceneFiles.map(async (path) => ({
  path,
  relativePath: relative(projectDirectory, path),
  data: JSON.parse(await readFile(path, 'utf8')),
})));
let folderSchedule = null;
try {
  folderSchedule = JSON.parse(await readFile(joinPath(sceneDirectory, 'scene.json'), 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

const cards = (await Promise.all(scenes.map(async ({ relativePath, data }) => {
  const facts = sceneFacts(data, defaultSettings.generation).map(([name, value]) => `<div class="fact"><dt>${escapeHtml(name)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('');
  const effectiveGeneration = mergeSettings(defaultSettings.generation, data.generationOverrides ?? {});
  const matchingRuns = await findRunsForScene(data.name);
  const originalProfileName = await readOriginalProfileName(data.reference);
  const comparisonFilms = renderComparisonFilms(data, matchingRuns, effectiveGeneration, originalProfileName);
  const runnerInputs = data.reconstructionInputs
    ? `<details><summary>Rekonstruktionshinweise</summary><pre>${escapeHtml(JSON.stringify(data.reconstructionInputs, null, 2))}</pre></details>`
    : '';
  return `<article class="scene-card">
    <header><span class="path">${escapeHtml(relativePath)}</span><h2>${escapeHtml(data.name || 'Unbenannte Scene')}</h2>
      ${data.description ? `<p>${escapeHtml(data.description)}</p>` : ''}</header>
    <dl class="facts">${facts}</dl>
    ${comparisonFilms}
    <details><summary>Effektive Generationseinstellungen</summary><pre>${escapeHtml(JSON.stringify(mergeSettings(defaultSettings.generation, data.generationOverrides ?? {}), null, 2))}</pre></details>
    <details><summary>Nur Scene-Overrides</summary><pre>${escapeHtml(JSON.stringify(data.generationOverrides ?? {}, null, 2))}</pre></details>
    ${runnerInputs}
  </article>`;
}))).join('\n');

const html = `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>EU-RESKI · Scene-Übersicht</title>
  <style>
    :root { color-scheme: dark; font: 16px/1.5 system-ui, sans-serif; background: #11120f; color: #e8e4d9; }
    * { box-sizing: border-box; }
    body { margin: 0; }
    main { width: min(1200px, calc(100% - 32px)); margin: 0 auto; padding: 32px 0 56px; }
    h1 { margin: 0 0 6px; font-size: clamp(1.8rem, 4vw, 2.6rem); }
    .intro { color: #bdb7a8; margin: 0 0 24px; }
    .scene-card { margin: 18px 0; padding: 20px; border: 1px solid #48483d; border-radius: 14px; background: #1d1e1a; }
    .scene-card h2 { margin: 6px 0; color: #d8ff49; }
    .scene-card header p { margin: 0 0 14px; color: #c9c2b2; }
    .path { color: #aaa391; font: .85rem ui-monospace, SFMono-Regular, Menlo, monospace; overflow-wrap: anywhere; }
    .facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr)); gap: 8px; margin: 16px 0; }
    .fact { border: 1px solid #34352e; border-radius: 8px; padding: 9px 11px; min-width: 0; }
    .comparison { margin: 16px 0; padding: 12px 15px; border-radius: 9px; background: #151611; border: 1px solid #46473a; }
    .comparison h3 { margin: 0 0 4px; color: #d8ff49; }
    .comparison p { margin: 4px 0 8px; color: #bbb5a7; font-size: .92rem; }
    .comparison ul { margin: 8px 0 0; padding-left: 22px; }
    .comparison li { margin: 7px 0; overflow-wrap: anywhere; }
    .comparison a { color: #d8ff49; }
    dt { color: #aaa391; font-size: .82rem; }
    dd { margin: 2px 0 0; overflow-wrap: anywhere; }
    details { border-top: 1px solid #34352e; margin-top: 12px; padding-top: 10px; }
    summary { color: #d8ff49; cursor: pointer; }
    pre { white-space: pre-wrap; overflow-wrap: anywhere; background: #12130f; padding: 14px; border-radius: 8px; font-size: .84rem; }
    .empty { padding: 18px; border: 1px dashed #555; border-radius: 12px; color: #bbb; }
  </style>
</head>
<body><main>
  <h1>EU-RESKI · Scene-Übersicht</h1>
  <p class="intro">${scenes.length} Scene-Datei(en) unter <code>eu-reski-news/scenes/</code>, einschließlich Unterordner. Werte zeigen effektive Einstellungen nach Merge mit Defaults v${escapeHtml(defaultSettings.version)}; aufklappbare Blöcke zeigen Scene-Overrides und dokumentierte Runner-Eingaben. Ordner-Zeitplan: ${folderSchedule ? `${escapeHtml(folderSchedule.generationIntervalInMinutes ?? 'nicht gesetzt')} min · Bias ${escapeHtml(folderSchedule.biasMode ?? 'nicht gesetzt')}` : 'nicht gesetzt'}. Scene-spezifische Zeitpläne überschreiben diese Werte.</p>
  ${cards || '<p class="empty">Keine *.scene.json-Dateien gefunden.</p>'}
</main></body></html>`;

await writeFile(outputPath, html.replace(/[ \t]+$/gm, ''));
console.log(`Scene-Übersicht erstellt: ${outputPath} (${scenes.length} Scene-Dateien)`);
