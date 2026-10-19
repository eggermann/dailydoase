const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const details = (title, value) => `<details><summary>${escapeHtml(title)}</summary><pre>${escapeHtml(typeof value === 'string' ? value : JSON.stringify(value, null, 2))}</pre></details>`;
const photo = (path, label) => `<figure><img src="${escapeHtml(path)}" alt="${escapeHtml(label)}"><figcaption>${escapeHtml(label)}</figcaption></figure>`;
const referenceGallery = (catalog, selectedId, prefix = '') => `<section class="reference-options"><h3>Mögliche Figurenreferenzen · ${catalog.length}</h3><div class="reference-gallery">${catalog.map((item) => `<figure class="reference-option${item.id === selectedId ? ' selected' : ''}"><img src="${escapeHtml(`${prefix}${item.path}`)}" alt="${escapeHtml(item.name)}"><figcaption>${escapeHtml(item.name)}${item.id === selectedId ? ' · ausgewählt' : ''}</figcaption></figure>`).join('')}</div></section>`;
const videoGuide = (scene, filmScene) => `<section class="video-guide"><h3>Video-Modell-Anweisung</h3><dl><dt>Modus</dt><dd>Image-to-video · Einzelnes Startbild</dd><dt>Startbild</dt><dd><a href="${escapeHtml(filmScene.startImagePath)}">${escapeHtml(filmScene.startImagePath)}</a></dd><dt>Dauer</dt><dd>${escapeHtml(filmScene.durationSeconds)} Sekunden</dd><dt>Bewegungsanweisung</dt><dd>${escapeHtml(filmScene.videoPrompt)}</dd></dl></section>`;

export function renderReport(record) {
  const { article, semantic, plan, results = [], catalog = [] } = record;
  const costs = results.map((item) => item.cost).filter((cost) => typeof cost === 'number');
  const scenes = (plan?.scenes || []).map((scene, index) => {
    const figure = catalog.find((item) => item.id === scene.guernicaId);
    const result = results[index];
    const filmScene = record.filmPlan?.scenePlan?.[index];
    return `<section><h2>${scene.index}. ${escapeHtml(scene.title)}</h2>
      <p><b>Hauptfigur:</b> ${escapeHtml(record.plan?.protagonist?.name || 'Noch nicht festgelegt')} · ${escapeHtml(scene.protagonistAction || scene.storyBeat)}</p>
      <p>${escapeHtml(scene.storyBeat)}</p><p>${escapeHtml(scene.durationSeconds)} s geplant · ${escapeHtml(scene.composition)}</p>
      ${result?.path ? photo(result.path, 'API-generiertes Startbild') : '<p>Startbild noch nicht gespeichert.</p>'}
      ${figure ? `<p><b>Figurenreferenz:</b> ${escapeHtml(figure.name)} · ${escapeHtml(scene.selectionReason)}</p><div class="reference">${photo(figure.path, 'Figurenreferenz für die Hauptfigur')}</div>` : ''}
      ${scene.crocodileAppearance ? `<p><b>Krokodil:</b> ${scene.crocodileAppearance.present ? `${escapeHtml(scene.crocodileAppearance.role)} · ${escapeHtml(scene.crocodileAppearance.placement)}` : 'Weggelassen; passt hier nicht als Metapher.'}</p>` : ''}
      ${details(`Unveränderter GPT-Bildprompt → ${record.imageModel || 'Bild-API'}`, scene.stillPrompt)}
      ${filmScene?.videoPrompt ? videoGuide(scene, filmScene) : ''}
      ${result ? details('Bild-API · Kosten, Seed, Prompt-Hash', result) : ''}</section>`;
  }).join('');
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>EU · automatische Bildkomposition</title><style>
  *{box-sizing:border-box}body{margin:0;background:#181918;color:#e5e1d7;font:17px/1.6 system-ui}main{max-width:1120px;margin:auto;padding:30px 20px}h1,h2{line-height:1.2}section{background:#252623;border:1px solid #47473e;border-radius:12px;padding:24px;margin:24px 0}img{display:block;max-width:100%;height:auto;margin:auto}figure{margin:16px 0}figcaption{color:#bbb7ab;font-size:14px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:14px}summary{cursor:pointer;color:#dfc987}details{margin:16px 0}.reference{max-width:230px}.reference-gallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px}.reference-option{margin:0;padding:10px;border:1px solid #47473e;border-radius:8px}.reference-option img{width:100%;height:90px;object-fit:contain}.reference-option.selected{border-color:#dfc987}.reference-option figcaption{font-size:12px}.video-guide{margin:20px 0;padding:16px;border:1px solid #47473e;border-radius:8px;background:#20211f}.video-guide h3{margin:0 0 10px}.video-guide dl{display:grid;grid-template-columns:minmax(120px,180px) 1fr;gap:8px;margin:0}.video-guide dt{color:#dfc987}.video-guide dd{margin:0;overflow-wrap:anywhere}.video-guide a{overflow-wrap:anywhere}a{color:#dfc987}.error{color:#ffa292}.grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}@media(max-width:700px){.grid{grid-template-columns:1fr}.video-guide dl{grid-template-columns:1fr;gap:2px}.video-guide dd{margin-bottom:8px}}
  </style></head><body><main><h1>Artikel + Semantic Stream → Szenenbild und Filmplan</h1>
  <p>${escapeHtml(record.status)} · ${escapeHtml(record.createdAt)} · ${escapeHtml(record.imageModel)}</p>
  ${record.variant ? `<p><b>${escapeHtml(record.variant.label)}</b> · ${escapeHtml(record.variant.description)}</p>` : ''}
  <p>${record.imageProvider === 'hf-flux-klein' ? 'Hugging Face ZeroGPU: GPU-Zeit wird vom Tageskontingent oder Guthaben abgezogen; Space meldet keine GPU-Sekunden.' : `Gemeldete Bildkosten: $${costs.reduce((a, b) => a + b, 0).toFixed(5)}`} · GPT separat: ${escapeHtml(record.usage?.total_tokens ?? '–')} Tokens</p>
  ${record.filmPlan ? `<p>${escapeHtml(record.filmPlan.status)}</p>` : ''}
  ${record.error ? `<p class="error">${escapeHtml(record.error)}</p>` : ''}
  ${record.visualReview ? `<section><h2>Bildprüfung</h2><p>${escapeHtml(record.visualReview.summary)}</p><ul>${record.visualReview.scenes.map((item) => `<li><b>Szene ${item.index}:</b> ${escapeHtml(item.assessment)}</li>`).join('')}</ul></section>` : ''}
  <section><h2>Quellartikel</h2><h3>${escapeHtml(article.title)}</h3><p>${escapeHtml(article.publish_date)} · ${escapeHtml(article.source_country)}</p>
  ${/^https?:\/\//i.test(article.url || '') ? `<a href="${escapeHtml(article.url)}" target="_blank" rel="noopener noreferrer">Quelle öffnen</a>` : ''}
  ${record.articleImage ? photo(record.articleImage.path, 'Originales Artikelbild') : ''}
  ${record.styleReference ? photo(record.styleReference.path, 'Guernica · vollständige Stilreferenz') : ''}
  ${details('Artikeltext', article.text || article.summary)}${details('Zufallsauswahl', record.selection)}</section>
  <section><h2>Wörter und gezogene Stream-Fragmente</h2>${details('Vollständiger Semantic-Stream-Snapshot', semantic)}
  ${(semantic?.entries || []).map((entry) => `<p><b>${escapeHtml(entry.seed.join(' · '))} → ${escapeHtml(entry.item.title)}</b></p>`).join('')}
  ${details('GPT: relevante Begriffe, Szenen und wörtliche Bildmotive', plan?.semanticUse || [])}</section>
  ${plan ? `<section><h2>Automatisch entwickelte Geschichte</h2><p>${escapeHtml(plan.storyPremise)}</p><h3>Hauptfigur</h3><p><b>${escapeHtml(plan.protagonist?.name || 'Noch nicht festgelegt')}</b> · ${escapeHtml(plan.protagonist?.role || '')}</p><p>${escapeHtml(plan.protagonist?.visualIdentity || '')}</p><h3>Bildbeobachtung</h3><p>${escapeHtml(plan.visionAnalysis)}</p><h3>Fakten laut Artikel</h3><ul>${plan.articleFacts.map((fact) => `<li>${escapeHtml(fact)}</li>`).join('')}</ul><p><b>Fiktionsgrenze:</b> ${escapeHtml(plan.fictionBoundary)}</p>${referenceGallery(catalog, plan.protagonist?.guernicaId)}</section>` : ''}
  ${scenes}<section><h2>Nachvollziehbarkeit</h2><p>${escapeHtml(record.variant?.promptOrigin || record.promptOrigin || `GPT nutzt Artikeltext und Nachrichtenfoto für Fakten und Szenenplanung. Die Bild-API erhält die gewählte maskierte Figurenreferenz als Protagonistenreferenz${record.styleReference ? ' und das vollständige Gemälde ausschließlich als Stilreferenz' : '; ein vollständiges Gemälde wird nicht übergeben'}. Das Nachrichtenfoto geht nicht an die Bild-API.`)}</p>
  ${record.sourceVersion ? `<p>Generator-Commit: ${escapeHtml(record.sourceVersion.commit)} · Branch: ${escapeHtml(record.sourceVersion.branch || 'detached HEAD')} · ${record.sourceVersion.clean ? 'Code unverändert beim Start' : 'Lokale Codeänderungen beim Start'}</p>` : ''}
  <p>Versionierter Regieprompt: ${escapeHtml(record.directorHash || 'noch nicht geladen')}</p>
  <p><a href="record.json">Laufprotokoll</a> · <a href="semantic-stream.json">Stream-Snapshot</a> · <a href="scene-plan.json">Szenenplan</a> · ${record.filmPlan ? '<a href="film-plan.json">Film-Übergabeplan</a> · ' : ''}${record.filmPlan ? '<a href="film-agent-prompt.md">Anweisung für den Film-Generator</a> · ' : ''}<a href="gpt-request.json">GPT-Eingabe</a> · <a href="gpt-response.json">GPT-Antwort</a> · <a href="director.md">Regieprompt</a></p>
  ${(plan?.scenes || []).map((scene) => `<p>Szene ${scene.index}: <a href="scene-${scene.index}-request.json">Bild-Request</a> · <a href="scene-${scene.index}-response.json">Bild-Response</a></p>`).join('')}
  ${details('Vollständiges Laufprotokoll', record)}</section></main></body></html>`;
}

export function renderRunReport(run, iterations) {
  const reports = iterations.map(({ directory, record }, iterationIndex) => {
    const prefix = `${directory}/`;
    const scenes = (record.plan?.scenes || []).map((scene, sceneIndex) => {
      const result = record.results?.[sceneIndex];
      return `<article class="scene"><h3>Szene ${scene.index}: ${escapeHtml(scene.title)}</h3>
        <p><b>Hauptfigur:</b> ${escapeHtml(record.plan?.protagonist?.name || 'Noch nicht festgelegt')} · ${escapeHtml(scene.protagonistAction || scene.storyBeat)}</p>
        <p>${escapeHtml(scene.storyBeat)} · ${escapeHtml(scene.durationSeconds)} s</p>
        ${result?.path ? photo(`${prefix}${result.path}`, 'API-generiertes Startbild') : '<p>Startbild noch nicht gespeichert.</p>'}
        ${record.catalog?.find((item) => item.id === scene.guernicaId) ? photo(`${prefix}${record.catalog.find((item) => item.id === scene.guernicaId).path}`, 'Figurenreferenz für die Hauptfigur') : ''}
        ${details('Bildprompt', scene.stillPrompt || '')}</article>`;
    }).join('');
    const semantic = (record.semantic?.entries || []).map((entry) => `<li><b>${escapeHtml(entry.seed.join(' · '))}</b> → ${escapeHtml(entry.item.title)}</li>`).join('');
    return `<section class="iteration"><header><p>Iteration ${String(iterationIndex + 1).padStart(2, '0')} · ${escapeHtml(record.status)} · ${escapeHtml(record.createdAt)}</p>
      <h2>${escapeHtml(record.article?.title)}</h2><p>${escapeHtml(record.article?.publish_date)} · ${escapeHtml(record.article?.source_country)}</p>
      <p>${escapeHtml(record.plan?.storyPremise || '')}</p>
      <p><b>Hauptfigur:</b> ${escapeHtml(record.plan?.protagonist?.name || 'Noch nicht festgelegt')} · ${escapeHtml(record.plan?.protagonist?.role || '')}</p>
      <p>${escapeHtml(record.plan?.protagonist?.visualIdentity || '')}</p>
      <p><a href="${prefix}index.html">Einzelbericht öffnen</a> · <a href="${prefix}record.json">Protokoll</a></p></header>
      ${record.articleImage?.path ? photo(`${prefix}${record.articleImage.path}`, 'Originales Artikelbild') : ''}
      ${record.styleReference?.path ? photo(`${prefix}${record.styleReference.path}`, 'Guernica · vollständige Stilreferenz') : ''}
      ${semantic ? `<details><summary>Semantic-Stream</summary><ul>${semantic}</ul></details>` : ''}${scenes}</section>`;
  }).join('');
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>EU-RESKI · Run-Bericht</title><style>
  *{box-sizing:border-box}body{margin:0;background:#181918;color:#e5e1d7;font:17px/1.6 system-ui}main{max-width:1120px;margin:auto;padding:30px 20px}h1,h2,h3{line-height:1.2}.iteration{background:#252623;border:1px solid #47473e;border-radius:12px;padding:24px;margin:24px 0}.scene{border-top:1px solid #47473e;margin-top:28px;padding-top:20px}img{display:block;max-width:100%;height:auto;margin:auto}figure{margin:16px 0}figcaption{color:#bbb7ab;font-size:14px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:14px}summary{cursor:pointer;color:#dfc987}details{margin:16px 0}a{color:#dfc987}
  </style></head><body><main><h1>EU-RESKI · linearer Run</h1>
  <p>${escapeHtml(run.status)} · ${iterations.length} von ${escapeHtml(run.iterationLimit)} Iterationen · ${escapeHtml(run.startedAt)}</p>
  <p>Artikelreihenfolge: linear · Jede Iteration verwendet den nächsten Artikel und den nächsten Semantic-Stream-Ausschnitt. GPT nutzt Artikeltext, Nachrichtenfoto und Figurenkatalog. Die Bild-API erhält die gewählte Figur als abstrakte Protagonistenreferenz${record.styleReference ? ' und das vollständige Gemälde ausschließlich als Stilreferenz' : '; ein vollständiges Gemälde wird nicht übergeben'}; das Nachrichtenfoto wird nicht gesendet.</p>
  ${reports}</main></body></html>`;
}
