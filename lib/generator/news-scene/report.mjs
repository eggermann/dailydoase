const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const details = (title, value) => `<details><summary>${escapeHtml(title)}</summary><pre>${escapeHtml(typeof value === 'string' ? value : JSON.stringify(value, null, 2))}</pre></details>`;
const photo = (path, label) => `<figure><img src="${escapeHtml(path)}" alt="${escapeHtml(label)}"><figcaption>${escapeHtml(label)}</figcaption></figure>`;

export function renderReport(record) {
  const { article, semantic, plan, results = [], catalog = [] } = record;
  const costs = results.map((item) => item.cost).filter((cost) => typeof cost === 'number');
  const scenes = (plan?.scenes || []).map((scene, index) => {
    const figure = catalog.find((item) => item.id === scene.guernicaId);
    const result = results[index];
    return `<section><h2>${scene.index}. ${escapeHtml(scene.title)}</h2>
      <p>${escapeHtml(scene.storyBeat)}</p><p>${escapeHtml(scene.durationSeconds)} s geplant · ${escapeHtml(figure?.name)}</p>
      ${result?.path ? photo(result.path, 'API-generiertes Startbild') : '<p>Startbild noch nicht gespeichert.</p>'}
      <p><b>Figurenwahl:</b> ${escapeHtml(scene.selectionReason)}</p>
      ${scene.crocodileAppearance ? `<p><b>Krokodil:</b> ${scene.crocodileAppearance.present ? `${escapeHtml(scene.crocodileAppearance.role)} · ${escapeHtml(scene.crocodileAppearance.placement)}` : 'Weggelassen; passt hier nicht als Metapher.'}</p>` : ''}
      ${figure ? `<div class="reference">${photo(figure.path, 'Figurenreferenz – für diese Szene neu gezeichnet')}</div>` : ''}
      ${details('Unveränderter GPT-Bildprompt → Seedream', scene.stillPrompt)}
      ${result ? details('Bild-API · Kosten, Seed, Prompt-Hash', result) : ''}</section>`;
  }).join('');
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>EU · automatische Bildkomposition</title><style>
  *{box-sizing:border-box}body{margin:0;background:#181918;color:#e5e1d7;font:17px/1.6 system-ui}main{max-width:1120px;margin:auto;padding:30px 20px}h1,h2{line-height:1.2}section{background:#252623;border:1px solid #47473e;border-radius:12px;padding:24px;margin:24px 0}img{display:block;max-width:100%;height:auto;margin:auto}figure{margin:16px 0}figcaption{color:#bbb7ab;font-size:14px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:14px}summary{cursor:pointer;color:#dfc987}details{margin:16px 0}.reference{max-width:230px}a{color:#dfc987}.error{color:#ffa292}.grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}@media(max-width:700px){.grid{grid-template-columns:1fr}}
  </style></head><body><main><h1>Artikel + Semantic Stream → Bild</h1>
  <p>${escapeHtml(record.status)} · ${escapeHtml(record.createdAt)} · ${escapeHtml(record.imageModel)}</p>
  <p>Gemeldete Bildkosten: $${costs.reduce((a, b) => a + b, 0).toFixed(5)} · GPT separat: ${escapeHtml(record.usage?.total_tokens ?? '–')} Tokens</p>
  ${record.error ? `<p class="error">${escapeHtml(record.error)}</p>` : ''}
  ${record.visualReview ? `<section><h2>Bildprüfung</h2><p>${escapeHtml(record.visualReview.summary)}</p><ul>${record.visualReview.scenes.map((item) => `<li><b>Szene ${item.index}:</b> ${escapeHtml(item.assessment)}</li>`).join('')}</ul></section>` : ''}
  <section><h2>Quellartikel</h2><h3>${escapeHtml(article.title)}</h3><p>${escapeHtml(article.publish_date)} · ${escapeHtml(article.source_country)}</p>
  ${/^https?:\/\//i.test(article.url || '') ? `<a href="${escapeHtml(article.url)}" target="_blank" rel="noopener noreferrer">Quelle öffnen</a>` : ''}
  ${record.articleImage ? photo(record.articleImage.path, 'Originales Artikelbild') : ''}
  ${details('Artikeltext', article.text || article.summary)}${details('Zufallsauswahl', record.selection)}</section>
  <section><h2>Wörter und gezogene Stream-Fragmente</h2>${details('Vollständiger Semantic-Stream-Snapshot', semantic)}
  ${(semantic?.entries || []).map((entry) => `<p><b>${escapeHtml(entry.seed.join(' · '))} → ${escapeHtml(entry.item.title)}</b></p>`).join('')}
  ${details('GPT: relevante Begriffe, Szenen und wörtliche Bildmotive', plan?.semanticUse || [])}</section>
  ${plan ? `<section><h2>Automatisch entwickelte Geschichte</h2><p>${escapeHtml(plan.storyPremise)}</p><h3>Bildbeobachtung</h3><p>${escapeHtml(plan.visionAnalysis)}</p><h3>Fakten laut Artikel</h3><ul>${plan.articleFacts.map((fact) => `<li>${escapeHtml(fact)}</li>`).join('')}</ul><p><b>Fiktionsgrenze:</b> ${escapeHtml(plan.fictionBoundary)}</p></section>` : ''}
  ${scenes}<section><h2>Nachvollziehbarkeit</h2><p>GPT erstellt jeden Bildprompt aus den gespeicherten Eingaben. Der Generator übergibt ihn unverändert an die Bild-API.</p>
  ${record.sourceVersion ? `<p>Generator-Commit: ${escapeHtml(record.sourceVersion.commit)} · Branch: ${escapeHtml(record.sourceVersion.branch || 'detached HEAD')} · ${record.sourceVersion.clean ? 'Code unverändert beim Start' : 'Lokale Codeänderungen beim Start'}</p>` : ''}
  <p>Versionierter Regieprompt: ${escapeHtml(record.directorHash || 'noch nicht geladen')}</p>
  <p><a href="record.json">Laufprotokoll</a> · <a href="semantic-stream.json">Stream-Snapshot</a> · <a href="scene-plan.json">Szenenplan</a> · <a href="gpt-request.json">GPT-Eingabe</a> · <a href="gpt-response.json">GPT-Antwort</a> · <a href="director.md">Regieprompt</a></p>
  ${(plan?.scenes || []).map((scene) => `<p>Szene ${scene.index}: <a href="scene-${scene.index}-request.json">Bild-Request</a> · <a href="scene-${scene.index}-response.json">Bild-Response</a></p>`).join('')}
  ${details('Vollständiges Laufprotokoll', record)}</section></main></body></html>`;
}
