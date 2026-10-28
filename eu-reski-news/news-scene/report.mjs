const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const details = (title, value) => `<details><summary>${escapeHtml(title)}</summary><pre>${escapeHtml(typeof value === 'string' ? value : JSON.stringify(value, null, 2))}</pre></details>`;
const photo = (path, label) => `<figure><img src="${escapeHtml(path)}" alt="${escapeHtml(label)}"><figcaption>${escapeHtml(label)}</figcaption></figure>`;
const audioSummary = (stream) => stream
  ? `Tonspur: ${escapeHtml(stream.codecName || 'Codec unbekannt')} · ${escapeHtml(stream.channels ?? '–')} Kanäle${stream.channelLayout ? ` · ${escapeHtml(stream.channelLayout)}` : ''}${stream.sampleRate ? ` · ${escapeHtml(stream.sampleRate)} Hz` : ''}`
  : 'Keine Audiospur erkannt';
const money = (value) => typeof value === 'number' ? `$${value.toFixed(5)}` : 'vom Anbieter nicht gemeldet';
const referenceGallery = (catalog, selectedId, prefix = '', figureReferenceEnabled = true) => figureReferenceEnabled
  ? `<section class="reference-options"><h3>Mögliche Figurenreferenzen · ${catalog.length}</h3><div class="reference-gallery">${catalog.map((item) => `<figure class="reference-option${item.id === selectedId ? ' selected' : ''}"><img src="${escapeHtml(`${prefix}${item.path}`)}" alt="${escapeHtml(item.name)}"><figcaption>${escapeHtml(item.name)}${item.id === selectedId ? ' · ausgewählt' : ''}</figcaption></figure>`).join('')}</div></section>`
  : '<section class="reference-options"><h3>Keine Guernica-Bildreferenz</h3><p>Weder Vollbild noch Figuren-Crops wurden an Planung oder Bildmodell übergeben.</p></section>';
const videoGuide = (scene, filmScene, record, index, prefix = '') => {
  const startPath = record.results?.[index]?.path || filmScene.startImagePath;
  const mode = filmScene.videoMode === 'first_last_frame' ? 'First-Last-Frame · Start- und Endbild erforderlich' : filmScene.videoMode === 'image_to_video' ? 'Image-to-video · GPT pro Szene gewählt' : 'Image-to-video · einzelnes Startbild';
  const status = filmScene.videoMode === 'first_last_frame'
    ? `First-Last-Frame wird selten und nur bei notwendiger exakter Endkomposition gewählt. ${filmScene.videoDirection?.executionStatus || 'Endbild erforderlich'}; mit dem aktuellen Grok-Request kann es nicht als Einzelbild-Auftrag ausgeführt werden.`
    : (record.videoResults?.[index]?.status || 'Bereit');
  const video = record.videoResults?.[index];
  const settingsMode = video?.settings?.mode || record.videoGeneration?.settings?.mode;
  return `<section class="video-guide"><h3>Video-Modell-Anweisung</h3><dl><dt>Modus</dt><dd>${escapeHtml(mode)}</dd><dt>Status</dt><dd>${escapeHtml(status)}</dd>${video?.error ? `<dt>Fehler</dt><dd>${escapeHtml(video.error)} · denselben Videoaufruf zum Fortsetzen wiederholen</dd>` : ''}<dt>Startbild</dt><dd><a href="${escapeHtml(prefix ? `${prefix}${startPath}` : startPath)}">${escapeHtml(startPath)}</a></dd>${filmScene.videoMode === 'first_last_frame' ? `<dt>Endbild</dt><dd>Fehlt · von GPT beschrieben: ${escapeHtml(filmScene.videoDirection?.lastFrame?.description || '')}</dd>` : ''}<dt>Dauer</dt><dd>${escapeHtml(filmScene.durationSeconds)} Sekunden</dd><dt>Einstellungen</dt><dd>${escapeHtml(video?.model || record.videoGeneration?.model || 'Runware')} · ${escapeHtml(video?.resolution || record.videoGeneration?.resolution || '–')}${settingsMode ? ` · settings.mode=${escapeHtml(settingsMode)}` : ''}${video?.cost != null ? ` · Clip-Kosten ${money(video.cost)}` : ''}</dd><dt>Videoprompt</dt><dd>${escapeHtml(filmScene.videoPrompt)}${video?.taskUUID ? `<br><a href="${escapeHtml(`${prefix}scene-${scene.index}-video-request.json`)}">Gespeicherter Runware-Request</a>` : ''}</dd></dl></section>`;
};
const motionVectorSummary = (vector) => `${vector.subject}: ${vector.direction} · Weg ${vector.normalizedDisplacement} · ${vector.startTimeSeconds}–${vector.endTimeSeconds} s · ${vector.speedProfile} · Ziel: ${vector.intendedFinalPosition} · Geometrie ${vector.geometryConfidence}${vector.initialPosition.normalizedPoint ? ` · Startpunkt (${vector.initialPosition.normalizedPoint.x}, ${vector.initialPosition.normalizedPoint.y})` : ` · Startposition nur qualitativ: ${vector.initialPosition.description}`}`;
const transitionGuide = (record, sceneIndex) => {
  const transition = record.videoDirection?.sceneTransitions?.[sceneIndex];
  if (!transition) return '';
  return `<section class="video-transition"><h5>Übergang Szene ${escapeHtml(transition.fromSceneIndex)} → ${escapeHtml(transition.toSceneIndex)}</h5><p><b>Bewegung:</b> ${transition.movementContinues ? 'setzt sich fort' : 'ändert sich bewusst'} · ${escapeHtml(transition.motionDirectionAcrossCut)}</p><p><b>Kamerabezug:</b> ${escapeHtml(transition.cameraRelationship)} · vorher ${escapeHtml(transition.previousCameraMotion)} → danach ${escapeHtml(transition.nextCameraMotion)} · ${escapeHtml(transition.cameraReason)}</p><p><b>Übergang:</b> ${escapeHtml(transition.intendedTransition)}</p><p><b>Wiederkehrende Elemente:</b> ${escapeHtml(transition.recurringElements.join(' · ') || 'keine festgelegt')}</p><p><b>Mögliche Brüche:</b> ${escapeHtml(transition.potentialDiscontinuities.join(' · ') || 'keine benannt')}</p></section>`;
};
const storyDramaturgy = (plan) => {
  if (!plan?.storyArc) return '';
  const arc = plan.storyArc;
  const reveal = plan.clouReveal || {};
  const foreshadowing = (arc.foreshadowing || []).map((entry) => `<li>Szene ${escapeHtml(entry.sceneIndex)} · ${escapeHtml(entry.element)} — ${escapeHtml(entry.function)}</li>`).join('');
  return `<section class="story-dramaturgy"><h3>Story &amp; Dramaturgie</h3>
    <p><b>Ausgangslage:</b> ${escapeHtml(arc.setup)}</p><p><b>Ziel der Hauptfigur:</b> ${escapeHtml(arc.protagonistGoal)}</p>
    <p><b>Zentraler Widerspruch:</b> ${escapeHtml(arc.centralContradiction)}</p><p><b>Entwicklung:</b> ${escapeHtml(arc.development)}</p>
    <p><b>Wendepunkt:</b> ${escapeHtml(arc.turningPoint)}</p><p><b>Finaler Clou (${escapeHtml(arc.clouType)}):</b> ${escapeHtml(arc.finalClou)}</p>
    <p><b>Warum der Schluss trägt:</b> ${escapeHtml(arc.clouExplanation)}</p>
    ${foreshadowing ? `<p><b>Vorbereitung:</b></p><ul>${foreshadowing}</ul>` : '<p>Keine explizite Vorahnung geplant.</p>'}
    <h4>Clou-Reveal</h4><p><b>Geplante sichtbare Veränderung:</b> ${escapeHtml(reveal.intendedVisualChange)}</p>
    <p><b>Möglicher Endzustand:</b> ${escapeHtml(reveal.requiredFinalState)}</p><p>${escapeHtml(reveal.explanation)}</p>
    <p>Das ist eine erzählerische Absicht, keine Bestätigung, dass jedes Bildelement tatsächlich sichtbar ist.</p></section>`;
};
const videoDirectionGuide = (record, sceneIndex, prefix = '') => {
  const direction = record.videoDirection?.scenes?.[sceneIndex];
  if (!direction) return '';
  const vision = record.videoVision?.scenes?.find((entry) => entry.sceneIndex === direction.sceneIndex);
  const mode = direction.videoMode === 'first_last_frame' ? 'First-Last-Frame' : 'Image-to-Video';
  const finalFrame = direction.videoMode === 'first_last_frame'
    ? `Finalbild erforderlich · ${escapeHtml(direction.lastFrame.description)} · Asset fehlt (${escapeHtml(direction.executionStatus)})`
    : 'Kein finales Einzelbild erforderlich';
  const camera = direction.motionPlan.cameraMotion;
  const audio = record.videoDirection?.audioDirectionEnabled ? direction.sceneAudio : null;
  const visionBlock = vision?.status === 'analyzed'
    ? `<details><summary>Vision-Beobachtung · tatsächlich generiertes Bild</summary><pre>${escapeHtml(vision.observations)}\nBewegungskandidaten: ${escapeHtml(vision.motionCandidates)}\nRisiken: ${escapeHtml(vision.preservationRisks)}\nClou sichtbar: ${escapeHtml(vision.clouAssessment)}</pre></details>`
    : `<p><b>Vision:</b> ${escapeHtml(vision?.status || record.videoVision?.status || 'deaktiviert')} · ${vision?.status === 'vision_unavailable' ? 'Kein Bild analysiert; Regie nutzt nur den Plan.' : 'Keine Bildbeobachtung gespeichert.'}</p>`;
  const start = direction.startImagePath
    ? `<a href="${escapeHtml(`${prefix}${direction.startImagePath}`)}">${escapeHtml(direction.startImagePath)}</a>`
    : 'Kein Startbild vorhanden';
  return `<section class="video-guide"><h4>Video Direction · Planung, kein Video erzeugt</h4><dl>
    <dt>Dramatische Funktion</dt><dd>${escapeHtml(direction.dramaticFunction)}</dd>
    <dt>Startbild</dt><dd>${start}</dd><dt>Dauer (unverändert)</dt><dd>${escapeHtml(direction.durationSeconds)} Sekunden</dd>
    <dt>Modus</dt><dd>${mode} · ${escapeHtml(direction.modeReason)}</dd>
    <dt>Primärbewegung</dt><dd>${escapeHtml(direction.motionPlan.primaryMotion)} · ${escapeHtml(direction.motionPlan.primarySubject)}</dd>
    <dt>Sekundärbewegung</dt><dd>${escapeHtml(direction.motionPlan.secondaryMotion)}</dd>
    <dt>Bewegungsvektoren</dt><dd>${direction.motionPlan.motionVectors?.length ? `<ul>${direction.motionPlan.motionVectors.map((vector) => `<li>${escapeHtml(motionVectorSummary(vector))}</li>`).join('')}</ul>` : 'Keine Objektbewegung geplant'}</dd>
    <dt>Kamerabewegung</dt><dd>${escapeHtml(camera.type)} · ${escapeHtml(camera.description)} · Richtung ${escapeHtml(camera.direction)} · Weg ${escapeHtml(camera.normalizedDisplacement)} · Zoom ${escapeHtml(camera.zoomAmount * 100)}% (Limit ${escapeHtml((record.videoDirection.maxZoom ?? 0.08) * 100)}%) · Ausschnitt ${escapeHtml(camera.startFraming)} → ${escapeHtml(camera.endFraming)} · Kontinuität: ${escapeHtml(camera.continuityIntent)}</dd>
    <dt>Bewegungsintensität</dt><dd>${escapeHtml(direction.motionPlan.motionIntensity)} / 4 · interne Planungseinstufung</dd>
    <dt>Geplanter Endzustand</dt><dd>${escapeHtml(direction.endState.description)}<br>Positionen: ${escapeHtml(direction.endState.finalSubjectPositions.join(' · '))}<br>Beziehungen: ${escapeHtml(direction.endState.spatialRelationships.join(' · '))}<br>Abgeschlossene Aktionen: ${escapeHtml(direction.endState.completedActions.join(' · '))}<br>Unverändert: ${escapeHtml(direction.endState.unchangedElements.join(' · '))}<br>Exakte Komposition nötig: ${direction.endState.exactCompositionRequired ? 'ja' : 'nein'}</dd>
    <dt>Finalzustand</dt><dd>${finalFrame}</dd><dt>Status</dt><dd>${escapeHtml(direction.executionStatus)} · keine Video-API aufgerufen</dd>
    ${direction.videoMode === 'first_last_frame' ? `<dt>First-Last-Frame-Vorgaben</dt><dd>${escapeHtml(direction.lastFrame.compositionRequirements.join(' · '))}<br>Visuell konsistent halten: ${escapeHtml(direction.lastFrame.consistencyElements.join(' · '))}<br>Künftiger Bildbrief: ${escapeHtml(direction.lastFrame.generationBrief)}<br>Endbildpfad: ${escapeHtml(direction.lastFrame.imagePath)}</dd>` : ''}
    <dt>GPT-Bewegungsentwurf (ohne Kamera/Audio)</dt><dd>${escapeHtml(direction.videoPrompt)}</dd>
    ${audio ? `<dt>Audioanweisung</dt><dd>${audio.intentionalSilence ? `Stille · ${escapeHtml(audio.silenceReason)}` : `${escapeHtml(audio.ambientTexture)}${audio.soundEvents.length ? `<ul>${audio.soundEvents.map((event) => `<li>${escapeHtml(event.startSeconds)}–${escapeHtml(event.endSeconds)} s · ${escapeHtml(event.description)}</li>`).join('')}</ul>` : '<br>Keine einzelnen Soundereignisse'}`}<br>Von vorher: ${escapeHtml(audio.continuityFromPrevious)}<br>Zu nächster: ${escapeHtml(audio.continuityToNext)}<br>Dialog: nein</dd>` : ''}
    <dt>Alter Timing-Prompt (unverändert)</dt><dd>${escapeHtml(direction.legacyVideoPrompt)}</dd>
    </dl><p><b>Gesamtrhythmus:</b> ${escapeHtml(record.videoDirection.overallDirection?.movementRhythm)} · <b>Spannung:</b> ${escapeHtml(record.videoDirection.overallDirection?.tensionCurve)} · <b>Schluss:</b> ${escapeHtml(record.videoDirection.overallDirection?.endingStrategy)}</p>
    <p><b>Kamera über die Iteration:</b> ${escapeHtml(record.videoDirection.overallDirection?.cameraOverview)}</p>
    ${visionBlock}</section>${transitionGuide(record, sceneIndex)}`;
};
const videoIterationGuide = (record, prefix = '') => {
  const direction = record.videoDirection;
  const audio = record.audioDirection?.audioDirection || (direction?.audioDirectionEnabled ? direction.audioDirection : null);
  if (!direction && !audio) return '';
  return `<section class="video-guide"><h3>Regie über die ganze Iteration</h3>${direction
    ? `<p><b>Kamera:</b> ${escapeHtml(direction.overallDirection?.cameraOverview)} · maximaler Zoom ${escapeHtml((direction.maxZoom ?? 0.08) * 100)}%</p>`
    : '<p>Visuelle Video-Direction aus; der ursprüngliche Szenenprompt bleibt bestehen.</p>'}${audio
    ? `<p><b>Audiokonzept (${record.audioDirection?.model || direction?.model || 'GPT'}):</b> ${escapeHtml(audio.overallConcept)}<br><b>Wiederkehrende Motive:</b> ${escapeHtml(audio.recurringMotifs.join(' · ') || 'keine')}<br><b>Stimme:</b> keine Dialoge oder Erzählstimme · <b>Kontinuität:</b> ${escapeHtml(audio.continuityStrategy)} · <b>Musik:</b> ${escapeHtml(audio.musicPolicy)}<br><a href="${escapeHtml(`${prefix}audio-direction.json`)}">Audio-Regieprotokoll</a></p>`
    : '<p>Audio-Regie aus; es wird kein Audioabschnitt an den Videoprompt angehängt.</p>'}</section>`;
};
const visualControls = (scene, fallback) => {
  const options = scene.visualStyleOptions || fallback;
  if (!options) return '';
  return `<p><b>Bildparameter:</b> Symbolik ${options.symbolic ? 'AN' : 'AUS'} · Raumtiefe ${options.roomDeepness ? 'AN' : 'AUS'} · Layering ${escapeHtml(options.layering ?? 0)} / 7${scene.visualControlReason ? ` · ${escapeHtml(scene.visualControlReason)}` : ''}</p>`;
};
const semanticTrace = (record) => {
  if (!record.plan) return '';
  const entries = record.semantic?.entries || [];
  const used = entries.filter((entry) => record.plan.semanticUse?.[entry.id]?.relevance === 'relevant');
  return `<div class="semantic-trace"><h3>Stream-Einfluss · ${used.length}/${entries.length} Fragmente</h3>${used.map((entry) => {
    const use = record.plan.semanticUse[entry.id];
    return `<p><b>${escapeHtml(entry.item.title)}</b> · Szenen ${escapeHtml(use.relatedSceneIndices.join(', ') || 'Keine Zuordnung')}<br>Bildmotiv laut GPT: <b>${escapeHtml(use.visualMotif)}</b><br>${escapeHtml(use.visibleConsequence)}</p>`;
  }).join('')}<p>Freie Assoziationen laut GPT · keine inhaltliche oder wörtliche Prüfung.</p><p><b>Fiktionsgrenze:</b> ${escapeHtml(record.plan.fictionBoundary)}</p></div>`;
};
const countSelection = (record) => {
  const choice = record.sceneCountSelection;
  if (!choice) return '';
  const settings = choice.settings;
  return settings.mode === 'taktmuster'
    ? `<p><b>Szenenzahl durch Taktmuster:</b> ${escapeHtml(settings.takt)} × ${escapeHtml(settings.numerator)}/${escapeHtml(settings.denominator)} · ${escapeHtml(settings.type)} · Rohwert ${escapeHtml(choice.rawValue)} + Bias ${escapeHtml(settings.bias)} → ${escapeHtml(choice.count)} Szenen · Grenzen ${escapeHtml(settings.minimum)}–${escapeHtml(settings.maximum)}</p>`
    : settings.mode === 'auto-director'
      ? `<p><b>Szenenzahl durch Auto Director:</b> ${escapeHtml(choice.count)} · Grenzen ${escapeHtml(settings.minimum)}–${escapeHtml(settings.maximum)} · ${escapeHtml(choice.reason || '')}</p>`
    : `<p><b>Szenenzahl:</b> fest ${escapeHtml(choice.count)}</p>`;
};
const sceneTimingSummary = (record) => {
  const scenes = record.plan?.scenes || [];
  const knownDuration = (scene) => Number.isFinite(scene.durationSeconds) && scene.durationSeconds > 0;
  return {
    count: scenes.length || `${record.sceneCount ?? 0} geplant`,
    durations: scenes.length ? scenes.map((scene, index) => `S${index + 1}: ${knownDuration(scene) ? `${scene.durationSeconds} s` : 'offen'}`).join(' · ') : 'Noch offen',
    total: scenes.length && scenes.every(knownDuration) ? `${scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0)} s` : 'Noch offen',
  };
};
const timingSummaryStyles = '.timing-summary{margin:24px 0;padding:20px;background:#252623;border:1px solid #47473e;border-radius:12px;overflow-x:auto}.timing-summary h2{margin:0 0 14px}.timing-summary table{border-collapse:collapse;width:100%;font-size:15px}.timing-summary th,.timing-summary td{text-align:left;vertical-align:top;padding:10px 12px;border-bottom:1px solid #47473e}.timing-summary th{color:#dfc987}.timing-summary th:first-child,.timing-summary td:first-child,.timing-summary td:last-child{white-space:nowrap}';
const renderTimingSummary = (iterations, linkIterations = false) => `<section class="timing-summary"><h2>Szenenübersicht</h2><table><thead><tr><th>Iteration</th><th>Szenen</th><th>Szenenlängen</th><th>Gesamtdauer</th></tr></thead><tbody>${iterations.map(({ record }, index) => {
  const summary = sceneTimingSummary(record);
  const label = linkIterations ? `<a href="#iteration-${index + 1}">Iteration ${index + 1}</a>` : 'Diese Iteration';
  return `<tr><td>${label}</td><td>${escapeHtml(summary.count)}</td><td>${escapeHtml(summary.durations)}</td><td>${escapeHtml(summary.total)}</td></tr>`;
}).join('')}</tbody></table></section>`;
const renderMergedFilms = (iterations) => {
  const films = iterations.filter(({ record }) => record.titleCardFilm?.path || record.concatenatedVideo?.path);
  if (!films.length) return '';
  return `<section class="merged-films"><h2>Zusammengesetzte Filme · ${films.length}</h2><div class="merged-film-grid">${films.map(({ directory, record }, index) => {
    const film = record.titleCardFilm?.path
      ? { ...record.concatenatedVideo, ...record.titleCardFilm }
      : record.concatenatedVideo;
    const iterationNumber = Number(directory.match(/iteration-(\d+)/)?.[1]) || index + 1;
    const path = film.runPath || `${directory}/${film.path}`;
    return `<article class="merged-film"><h3>Iteration ${iterationNumber}${record.titleCardFilm?.path ? ' · mit Titeltafel' : ''} · MP4 ${Number(film.durationSeconds).toFixed(2)} s</h3><p>${escapeHtml(record.article?.title || '')}</p><p>Angeforderte Szenensumme: ${escapeHtml(film.requestedDurationSeconds ?? film.durationSeconds)} s</p><video controls preload="metadata" playsinline src="${escapeHtml(path)}" aria-label="Gesamtfilm Iteration ${iterationNumber}"></video>${film.gaps?.length ? `<p class="film-gap">Lücke: ${film.gaps.map((gap) => `Szene ${gap.sceneIndex}, ${gap.durationSeconds} s schwarz`).join('; ')}</p>` : ''}</article>`;
  }).join('')}</div></section>`;
};

export function renderReport(record) {
  const { article, semantic, plan, results = [], catalog = [] } = record;
  const imageReferenceExplanation = record.guernicaFigureReference === false
    ? 'GPT nutzt Artikeltext und Nachrichtenfoto für Planung und Szeneninhalt. Die Bild-API erhält ausschließlich das Nachrichtenfoto als Bildreferenz; Guernica-Vollbild und Figuren-Crops werden nicht übergeben.'
    : `GPT nutzt Artikeltext und Nachrichtenfoto für Fakten und Szenenplanung. Die Bild-API erhält die gewählte maskierte Figurenreferenz als Protagonistenreferenz${record.styleReference ? ' und das vollständige Gemälde ausschließlich als Stilreferenz' : '; ein vollständiges Gemälde wird nicht übergeben'}${record.articleImageReference ? ' sowie das Nachrichtenfoto als Referenz für die grobe visuelle Orientierung' : '; das Nachrichtenfoto wird nicht an die Bild-API übergeben'}.`;
  const costs = results.map((item) => item.cost).filter((cost) => typeof cost === 'number');
  const displayFilm = record.titleCardFilm?.path
    ? { ...record.concatenatedVideo, ...record.titleCardFilm }
    : record.concatenatedVideo;
  const scenes = (plan?.scenes || []).map((scene, index) => {
    const figure = catalog.find((item) => item.id === scene.guernicaId);
    const result = results[index];
    const filmScene = record.filmPlan?.scenePlan?.[index];
    return `<section><h2>${scene.index}. ${escapeHtml(scene.title)}</h2>
      <p><b>Hauptfigur:</b> ${escapeHtml(record.plan?.protagonist?.name || 'Noch nicht festgelegt')} · ${escapeHtml(scene.protagonistAction || scene.storyBeat)}</p>
      <p>${escapeHtml(scene.storyBeat)}</p><p>${escapeHtml(scene.durationSeconds)} s geplant · ${escapeHtml(scene.composition)}</p>
      ${visualControls(scene, record.visualStyleOptions)}
      ${result?.path ? photo(result.path, 'API-generiertes Startbild') : '<p>Startbild noch nicht gespeichert.</p>'}
      ${record.videoResults?.[index]?.path ? `<video controls preload="metadata" playsinline src="${escapeHtml(record.videoResults[index].path)}"></video><p>API-generiertes Video · angefordert ${escapeHtml(record.videoResults[index].requestedDurationSeconds ?? filmScene?.durationSeconds)} s · MP4 ${Number(record.videoResults[index].durationSeconds).toFixed(2)} s · ${escapeHtml(record.videoResults[index].resolution)} · ${escapeHtml(record.videoResults[index].model)} · Clip-Kosten ${money(record.videoResults[index].cost)} · Renderzeit ${escapeHtml(record.videoResults[index].renderSeconds)} s · Download ${escapeHtml(record.videoResults[index].downloadSeconds)} s · Gesamt ${escapeHtml(record.videoResults[index].totalSeconds)} s · ${audioSummary(record.videoResults[index].audioStream)}</p>` : ''}
      ${figure ? `<p><b>Figurenreferenz:</b> ${escapeHtml(figure.name)} · ${escapeHtml(scene.selectionReason)}</p><div class="reference">${photo(figure.path, 'Figurenreferenz für die Hauptfigur')}</div>` : ''}
      ${scene.crocodileAppearance ? `<p><b>Krokodil:</b> ${scene.crocodileAppearance.present ? `${escapeHtml(scene.crocodileAppearance.role)} · ${escapeHtml(scene.crocodileAppearance.placement)}` : 'Weggelassen; passt hier nicht als Metapher.'}</p>` : ''}
      ${details(`Unveränderter GPT-Bildprompt → ${record.imageModel || 'Bild-API'}`, scene.stillPrompt)}
      ${filmScene?.videoPrompt ? videoGuide(scene, filmScene, record, index) : ''}
      ${record.audioDirection?.scenes?.[index] ? `<p><b>Audio-Regie:</b> ${escapeHtml(record.audioDirection.scenes[index].sceneAudio.intentionalSilence ? `Stille · ${record.audioDirection.scenes[index].sceneAudio.silenceReason}` : `${record.audioDirection.scenes[index].sceneAudio.ambientTexture} · ${record.audioDirection.scenes[index].sceneAudio.soundEvents.map((event) => `${event.startSeconds}–${event.endSeconds} s: ${event.description}`).join(' · ') || 'keine einzelnen Soundereignisse'}`)}</p>` : ''}
      ${videoDirectionGuide(record, index)}
      ${record.sceneTiming?.scenes?.[index] ? `<p><b>Dauerbegründung:</b> ${escapeHtml(record.sceneTiming.scenes[index].reason)}</p>` : ''}
      ${result ? details('Bild-API · Kosten, Seed, Prompt-Hash', result) : ''}</section>`;
  }).join('');
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>EU · automatische Bildkomposition</title><style>
  ${timingSummaryStyles}
  *{box-sizing:border-box}body{margin:0;background:#181918;color:#e5e1d7;font:17px/1.6 system-ui}main{max-width:1120px;margin:auto;padding:30px 20px}h1,h2{line-height:1.2}section{background:#252623;border:1px solid #47473e;border-radius:12px;padding:24px;margin:24px 0}img{display:block;max-width:100%;height:auto;margin:auto}figure{margin:16px 0}figcaption{color:#bbb7ab;font-size:14px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:14px}summary{cursor:pointer;color:#dfc987}details{margin:16px 0}.reference{max-width:230px}.reference-gallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px}.reference-option{margin:0;padding:10px;border:1px solid #47473e;border-radius:8px}.reference-option img{width:100%;height:90px;object-fit:contain}.reference-option.selected{border-color:#dfc987}.reference-option figcaption{font-size:12px}.video-guide{margin:20px 0;padding:16px;border:1px solid #47473e;border-radius:8px;background:#20211f}.video-guide h3{margin:0 0 10px}.video-guide dl{display:grid;grid-template-columns:minmax(120px,180px) 1fr;gap:8px;margin:0}.video-guide dt{color:#dfc987}.video-guide dd{margin:0;overflow-wrap:anywhere}.video-guide a{overflow-wrap:anywhere}a{color:#dfc987}.error{color:#ffa292}.grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}@media(max-width:700px){.grid{grid-template-columns:1fr}.video-guide dl{grid-template-columns:1fr;gap:2px}.video-guide dd{margin-bottom:8px}}
  video{display:block;width:100%;max-width:100%;height:auto;margin:16px auto;border-radius:8px;background:#111}
  </style></head><body><main><h1>Artikel + Semantic Stream → Szenenbild und Filmplan</h1>
  <p>${escapeHtml(record.status)} · ${escapeHtml(record.createdAt)} · ${escapeHtml(record.imageModel)}</p>
  ${record.generationSettings?.legacyGuernicaStyleReferencePrompt ? '<p><b>Regieprompt:</b> archivierter Guernica-Stilreferenz-Prompt vom 23.10.2026 · feste visuelle Steuerungen · P-Video-Stil-Lock aus</p>' : ''}
  ${record.generationSettings?.legacyGuernicaStyleReferencePromptRequested && !record.generationSettings?.legacyGuernicaStyleReferencePrompt ? '<p><b>Regieprompt:</b> angefordert, aber inaktiv · Guernica wurde nicht als Stilreferenz gesendet</p>' : ''}
  ${renderTimingSummary([{ record }])}
  ${record.titleCard?.imagePath ? photo(record.titleCard.imagePath, 'Generierte Titeltafel aus record.json → article.title') : ''}
  ${record.titleCardFilm?.status === 'render_failed' ? `<p class="error">Titeltafel-Film fehlgeschlagen: ${escapeHtml(record.titleCardFilm.error)} · Szenenfilm bleibt verfügbar.</p>` : ''}
  ${displayFilm?.path ? `<section><h2>${record.titleCardFilm?.path ? 'Film mit Titeltafel' : 'Zusammengesetzter Film'}</h2><video controls preload="metadata" playsinline src="${escapeHtml(displayFilm.path)}"></video><p>${escapeHtml(displayFilm.generatedVideos ?? displayFilm.scenes)} Videos · ${escapeHtml(displayFilm.scenes)} Szenen · MP4 ${Number(displayFilm.durationSeconds).toFixed(2)} s · angeforderte Szenensumme ${escapeHtml(displayFilm.requestedDurationSeconds ?? displayFilm.durationSeconds)} s${displayFilm.gaps?.length ? ` · Lücke: ${displayFilm.gaps.map((gap) => `Szene ${gap.sceneIndex}, ${gap.durationSeconds} s schwarz`).map(escapeHtml).join('; ')}` : ''} · ${escapeHtml(displayFilm.method)} · ${audioSummary(displayFilm.audioStream)}</p></section>` : ''}
  ${countSelection(record)}
  ${record.sceneVisualControls ? '<p>Bildparameter werden pro Szene aus Handlung und Raum gewählt.</p>' : record.visualStyleOptions ? `<p>Feste Bildparameter für alle Szenen: Symbolik ${record.visualStyleOptions.symbolic ? 'AN' : 'AUS'} · Raumtiefe ${record.visualStyleOptions.roomDeepness ? 'AN' : 'AUS'} · Layering ${escapeHtml(record.visualStyleOptions.layering ?? 0)} / 7</p>` : ''}
  ${record.sceneDurationSettings ? `<p>Szenenlänge: ${escapeHtml(record.sceneDurationSettings.provider)} · Werte ${escapeHtml(record.sceneDurationSettings.patternValues?.join(', ') || '–')} · × ${escapeHtml(record.sceneDurationSettings.multiplier)} + Bias ${escapeHtml(record.sceneDurationSettings.bias)} · ${escapeHtml(record.sceneDurationSettings.minimum)}–${escapeHtml(record.sceneDurationSettings.maximum)} s</p>` : ''}
  ${record.planningVersion === 2 ? '<p>Bildplanung und Zeitwahl getrennt: Der fertige Bildplan bleibt bei der Dauer- und Videoplanung unverändert.</p>' : ''}
  ${record.variant ? `<p><b>${escapeHtml(record.variant.label)}</b> · ${escapeHtml(record.variant.description)}</p>` : ''}
  <p>${record.imageProvider === 'hf-flux-klein' ? 'Hugging Face ZeroGPU: GPU-Zeit wird vom Tageskontingent oder Guthaben abgezogen; Space meldet keine GPU-Sekunden.' : `Gemeldete Bildkosten: $${costs.reduce((a, b) => a + b, 0).toFixed(5)}`} · GPT separat: ${escapeHtml(record.usage?.total_tokens ?? '–')} Tokens</p>
  ${record.filmPlan ? `<p>${escapeHtml(record.filmPlan.status)}</p>` : ''}
  ${record.videoDirection ? `<p>Optionale Videoregie: ${escapeHtml(record.videoDirection.status)} · ${escapeHtml(record.videoDirection.model)} · Video-Modus ${escapeHtml(record.videoDirection.selectedMode)} · kein Video-Modell oder Video-Provider festgelegt.</p>` : ''}
  ${videoIterationGuide(record)}
  ${record.error ? `<p class="error">${escapeHtml(record.error)}</p>` : ''}
  ${record.visualReview ? `<section><h2>Bildprüfung</h2><p>${escapeHtml(record.visualReview.summary)}</p><ul>${record.visualReview.scenes.map((item) => `<li><b>Szene ${item.index}:</b> ${escapeHtml(item.assessment)}</li>`).join('')}</ul></section>` : ''}
  <section><h2>Quellartikel</h2><h3>${escapeHtml(article.title)}</h3><p>${escapeHtml(article.publish_date)} · ${escapeHtml(article.source_country)}</p>
  ${/^https?:\/\//i.test(article.url || '') ? `<a href="${escapeHtml(article.url)}" target="_blank" rel="noopener noreferrer">Quelle öffnen</a>` : ''}
  ${record.articleImage ? photo(record.articleImage.path, 'Originales Artikelbild') : ''}
  ${record.styleReference ? photo(record.styleReference.path, 'Guernica · vollständige Stilreferenz') : ''}
  ${record.guernicaFigureReference === false ? '<p><b>Bildreferenz:</b> nur Presse-/Artikelbild · kein Guernica-Vollbild · keine Guernica-Figuren-Crops</p>' : ''}
  ${details('Artikeltext', article.text || article.summary)}${details('Zufallsauswahl', record.selection)}</section>
  <section><h2>Wörter und gezogene Stream-Fragmente</h2>${details('Vollständiger Semantic-Stream-Snapshot', semantic)}
  ${(semantic?.entries || []).map((entry) => `<p><b>${escapeHtml(entry.seed.join(' · '))} → ${escapeHtml(entry.item.title)}</b></p>`).join('')}
  ${semanticTrace(record)}
  ${details('GPT: relevante Begriffe, Szenen und wörtliche Bildmotive', plan?.semanticUse || [])}</section>
  ${plan ? `<section><h2>Automatisch entwickelte Geschichte</h2><p>${escapeHtml(plan.storyPremise)}</p>${storyDramaturgy(plan)}<h3>Hauptfigur</h3><p><b>${escapeHtml(plan.protagonist?.name || 'Noch nicht festgelegt')}</b> · ${escapeHtml(plan.protagonist?.role || '')}</p><p>${escapeHtml(plan.protagonist?.visualIdentity || '')}</p><h3>Bildbeobachtung</h3><p>${escapeHtml(plan.visionAnalysis)}</p><h3>Fakten laut Artikel</h3><ul>${plan.articleFacts.map((fact) => `<li>${escapeHtml(fact)}</li>`).join('')}</ul><p><b>Fiktionsgrenze:</b> ${escapeHtml(plan.fictionBoundary)}</p>${referenceGallery(catalog, plan.protagonist?.guernicaId, '', record.guernicaFigureReference !== false)}</section>` : ''}
  ${scenes}<section><h2>Nachvollziehbarkeit</h2><p>${escapeHtml(record.variant?.promptOrigin || record.promptOrigin || imageReferenceExplanation)}</p>
  ${record.sourceVersion ? `<p>Generator-Commit: ${escapeHtml(record.sourceVersion.commit)} · Branch: ${escapeHtml(record.sourceVersion.branch || 'detached HEAD')} · ${record.sourceVersion.clean ? 'Code unverändert beim Start' : 'Lokale Codeänderungen beim Start'}</p>` : ''}
  <p>Versionierter Regieprompt: ${escapeHtml(record.directorHash || 'noch nicht geladen')}</p>
  ${record.visualPlanHash ? `<p>Fixierter Bildplan: <a href="visual-plan.json">Bildplan vor Zeitwahl</a> · SHA-256 ${escapeHtml(record.visualPlanHash)}${record.sceneTiming ? ' · <a href="timing-request.json">Zeitplanung: Eingabe</a> · <a href="timing-response.json">Zeitplanung: Antwort</a>' : ''}</p>` : ''}
  <p><a href="record.json">Laufprotokoll</a> · ${record.autoMode ? '<a href="auto-decisions.json">Auto-Regieentscheidung</a> · ' : ''}<a href="semantic-stream.json">Stream-Snapshot</a> · <a href="scene-plan.json">Szenenplan</a> · ${record.plan?.storyArc ? '<a href="story-arc.json">Story Arc</a> · ' : ''}${record.videoVision ? '<a href="video-vision.json">Vision-Analyse</a> · ' : ''}${record.videoDirection ? '<a href="video-direction.json">Video Direction</a> · ' : ''}${record.filmPlan ? '<a href="film-plan.json">Film-Übergabeplan</a> · ' : ''}${record.filmPlan ? '<a href="film-agent-prompt.md">Anweisung für den Film-Generator</a> · ' : ''}<a href="gpt-request.json">GPT-Eingabe</a> · <a href="gpt-response.json">GPT-Antwort</a> · <a href="director.md">Regieprompt</a></p>
  ${(plan?.scenes || []).map((scene) => `<p>Szene ${scene.index}: <a href="scene-${scene.index}-request.json">Bild-Request</a> · <a href="scene-${scene.index}-response.json">Bild-Response</a></p>`).join('')}
  ${details('Vollständiges Laufprotokoll', record)}</section></main></body></html>`;
}

export function renderRunReport(run, iterations) {
  const totalVideoCost = iterations.reduce((sum, { record }) => sum + (record.videoResults || []).reduce((sceneSum, video) => sceneSum + (typeof video?.cost === 'number' ? video.cost : 0), 0), 0);
  const totalImageCost = iterations.reduce((sum, { record }) => sum + (record.results || []).reduce((sceneSum, image) => sceneSum + (typeof image?.cost === 'number' ? image.cost : 0), 0), 0);
  const reports = iterations.map(({ directory, record }, iterationIndex) => {
    const prefix = `${directory}/`;
    const displayFilm = record.titleCardFilm?.path
      ? { ...record.concatenatedVideo, ...record.titleCardFilm }
      : record.concatenatedVideo;
    const scenes = (record.plan?.scenes || []).map((scene, sceneIndex) => {
      const result = record.results?.[sceneIndex];
      const filmScene = record.filmPlan?.scenePlan?.[sceneIndex];
      return `<article class="scene"><h3>Szene ${scene.index}: ${escapeHtml(scene.title)}</h3>
        <p><b>Hauptfigur:</b> ${escapeHtml(record.plan?.protagonist?.name || 'Noch nicht festgelegt')} · ${escapeHtml(scene.protagonistAction || scene.storyBeat)}</p>
        <p>${escapeHtml(scene.storyBeat)} · ${escapeHtml(scene.durationSeconds)} s</p>
        ${visualControls(scene, record.visualStyleOptions)}
        ${result?.path ? photo(`${prefix}${result.path}`, 'API-generiertes Startbild') : '<p>Startbild noch nicht gespeichert.</p>'}
        ${record.videoResults?.[sceneIndex]?.path ? `<video controls preload="metadata" playsinline src="${escapeHtml(`${prefix}${record.videoResults[sceneIndex].path}`)}"></video><p>API-generiertes Video · angefordert ${escapeHtml(record.videoResults[sceneIndex].requestedDurationSeconds ?? filmScene?.durationSeconds)} s · MP4 ${Number(record.videoResults[sceneIndex].durationSeconds).toFixed(2)} s · ${escapeHtml(record.videoResults[sceneIndex].resolution)} · ${escapeHtml(record.videoResults[sceneIndex].model)} · Clip-Kosten ${money(record.videoResults[sceneIndex].cost)} · Renderzeit ${escapeHtml(record.videoResults[sceneIndex].renderSeconds)} s · Download ${escapeHtml(record.videoResults[sceneIndex].downloadSeconds)} s · Gesamt ${escapeHtml(record.videoResults[sceneIndex].totalSeconds)} s · ${audioSummary(record.videoResults[sceneIndex].audioStream)}</p>` : ''}
        ${filmScene?.videoPrompt ? videoGuide(scene, filmScene, record, sceneIndex, prefix) : ''}
        ${record.audioDirection?.scenes?.[sceneIndex] ? `<p><b>Audio-Regie:</b> ${escapeHtml(record.audioDirection.scenes[sceneIndex].sceneAudio.intentionalSilence ? `Stille · ${record.audioDirection.scenes[sceneIndex].sceneAudio.silenceReason}` : `${record.audioDirection.scenes[sceneIndex].sceneAudio.ambientTexture} · ${record.audioDirection.scenes[sceneIndex].sceneAudio.soundEvents.map((event) => `${event.startSeconds}–${event.endSeconds} s: ${event.description}`).join(' · ') || 'keine einzelnen Soundereignisse'}`)}</p>` : ''}
        ${videoDirectionGuide(record, sceneIndex, prefix)}
        ${record.catalog?.find((item) => item.id === scene.guernicaId) ? photo(`${prefix}${record.catalog.find((item) => item.id === scene.guernicaId).path}`, 'Figurenreferenz für die Hauptfigur') : ''}
        ${details('Bildprompt', scene.stillPrompt || '')}</article>`;
    }).join('');
    const semantic = (record.semantic?.entries || []).map((entry) => `<li><b>${escapeHtml(entry.seed.join(' · '))}</b> → ${escapeHtml(entry.item.title)}</li>`).join('');
    return `<section class="iteration" id="iteration-${iterationIndex + 1}"><header><p>Iteration ${String(iterationIndex + 1).padStart(2, '0')} · ${escapeHtml(record.status)} · ${escapeHtml(record.createdAt)}</p>
      ${countSelection(record)}
      ${record.sceneVisualControls ? '<p>GPT wählt Bildparameter für jede Szene passend zu Handlung und Raum.</p>' : record.visualStyleOptions ? `<p><b>Feste Bildparameter:</b> Symbolik ${record.visualStyleOptions.symbolic ? 'AN' : 'AUS'} · Raumtiefe ${record.visualStyleOptions.roomDeepness ? 'AN' : 'AUS'} · Layering ${escapeHtml(record.visualStyleOptions.layering ?? 0)} / 7</p>` : ''}
      ${record.sceneDurationSettings ? `<p><b>Szenenlänge:</b> ${escapeHtml(record.sceneDurationSettings.provider)} · Werte ${escapeHtml(record.sceneDurationSettings.patternValues?.join(', ') || '–')} · × ${escapeHtml(record.sceneDurationSettings.multiplier)} + Bias ${escapeHtml(record.sceneDurationSettings.bias)} · ${escapeHtml(record.sceneDurationSettings.minimum)}–${escapeHtml(record.sceneDurationSettings.maximum)} s</p>` : ''}
      <h2>${escapeHtml(record.article?.title)}</h2><p>${escapeHtml(record.article?.publish_date)} · ${escapeHtml(record.article?.source_country)}</p>
      ${record.titleCard?.imageRunPath ? `<figure><img src="${escapeHtml(record.titleCard.imageRunPath)}" alt="Titeltafel: ${escapeHtml(record.article?.title)}"><figcaption>Generierte Titeltafel · aus record.json → article.title</figcaption></figure>` : ''}
      <p>${escapeHtml(record.plan?.storyPremise || '')}</p>
      ${storyDramaturgy(record.plan)}
      ${record.titleCardFilm?.status === 'render_failed' ? `<p class="error">Titeltafel-Film fehlgeschlagen: ${escapeHtml(record.titleCardFilm.error)} · Szenenfilm bleibt verfügbar.</p>` : ''}
      ${displayFilm?.path ? `<h3>${record.titleCardFilm?.path ? 'Film mit Titeltafel' : 'Zusammengesetzter Film'}</h3><video controls preload="metadata" playsinline src="${escapeHtml(displayFilm.runPath || `${prefix}${displayFilm.path}`)}"></video><p>${escapeHtml(displayFilm.generatedVideos ?? displayFilm.scenes)} Videos · ${escapeHtml(displayFilm.scenes)} Szenen · MP4 ${Number(displayFilm.durationSeconds).toFixed(2)} s · angeforderte Szenensumme ${escapeHtml(displayFilm.requestedDurationSeconds ?? displayFilm.durationSeconds)} s${displayFilm.gaps?.length ? ` · Lücke: ${displayFilm.gaps.map((gap) => `Szene ${gap.sceneIndex}, ${gap.durationSeconds} s schwarz`).map(escapeHtml).join('; ')}` : ''} · ${escapeHtml(displayFilm.method)} · ${audioSummary(displayFilm.audioStream)}</p>` : ''}
      ${record.videoDirection ? `<p>Optionale Videoregie: ${escapeHtml(record.videoDirection.status)} · ${escapeHtml(record.videoDirection.model)} · kein Video-Provider aufgerufen.</p>` : ''}
      ${videoIterationGuide(record, prefix)}
      <p><b>Hauptfigur:</b> ${escapeHtml(record.plan?.protagonist?.name || 'Noch nicht festgelegt')} · ${escapeHtml(record.plan?.protagonist?.role || '')}</p>
      <p>${escapeHtml(record.plan?.protagonist?.visualIdentity || '')}</p>
      <p><a href="${prefix}index.html">Einzelbericht öffnen</a> · <a href="${prefix}record.json">Protokoll</a></p></header>
      ${record.articleImage?.path ? photo(`${prefix}${record.articleImage.path}`, 'Originales Artikelbild') : ''}
      ${record.styleReference?.path ? photo(`${prefix}${record.styleReference.path}`, 'Guernica · vollständige Stilreferenz') : ''}
      ${record.guernicaFigureReference === false ? '<p><b>Bildreferenz:</b> nur Presse-/Artikelbild · kein Guernica-Vollbild · keine Guernica-Figuren-Crops</p>' : ''}
      ${semantic ? `<details><summary>Semantic-Stream</summary><ul>${semantic}</ul></details>` : ''}${semanticTrace(record)}${scenes}</section>`;
  }).join('');
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>EU-RESKI · Run-Bericht</title><style>
  ${timingSummaryStyles}
  *{box-sizing:border-box}body{margin:0;background:#181918;color:#e5e1d7;font:17px/1.6 system-ui}main{max-width:1120px;margin:auto;padding:30px 20px}h1,h2,h3{line-height:1.2}.iteration{background:#252623;border:1px solid #47473e;border-radius:12px;padding:24px;margin:24px 0}.scene{border-top:1px solid #47473e;margin-top:28px;padding-top:20px}img{display:block;max-width:100%;height:auto;margin:auto}figure{margin:16px 0}figcaption{color:#bbb7ab;font-size:14px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:14px}summary{cursor:pointer;color:#dfc987}details{margin:16px 0}a{color:#dfc987}
  .merged-films{margin:24px 0;padding:20px;background:#252623;border:1px solid #47473e;border-radius:12px}.merged-films h2{margin:0 0 16px}.merged-film-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:16px}.merged-film{min-width:0;padding:14px;border:1px solid #47473e;border-radius:9px;background:#20211f}.merged-film h3{margin:0 0 8px}.merged-film p{margin:8px 0;color:#bbb7ab}.merged-film video{width:100%;aspect-ratio:16/9;object-fit:contain;margin:8px 0;background:#111}.merged-film .film-gap{color:#dfc987;font-size:14px}
  .video-guide{margin:20px 0;padding:16px;border:1px solid #47473e;border-radius:8px;background:#20211f}.video-guide h4{margin:0 0 10px}.video-guide dl{display:grid;grid-template-columns:minmax(120px,180px) 1fr;gap:8px;margin:0}.video-guide dt{color:#dfc987}.video-guide dd{margin:0;overflow-wrap:anywhere}.video-guide a{color:#dfc987}@media(max-width:700px){.video-guide dl{grid-template-columns:1fr;gap:2px}.video-guide dd{margin-bottom:8px}}
  video{display:block;width:100%;max-width:100%;height:auto;margin:16px auto;border-radius:8px;background:#111}
  </style></head><body><main><h1>EU-RESKI · ${escapeHtml(run.profile || 'linearer Run')}</h1>
  <p>${escapeHtml(run.status)} · ${iterations.length} von ${escapeHtml(run.iterationLimit)} Iterationen · ${escapeHtml(run.startedAt)} · Titeltafeln ${run.generationSettings?.generateTitleCards === false ? 'AUS' : 'AN'}${run.generationSettings?.generateTitleCards === false ? '' : ' · Quelle record.json → article.title'}</p>
  ${run.assembledFilm?.path ? `<section class="merged-films"><h2>Gesamtfilm · ${escapeHtml(run.assembledFilm.iterations)} Iterationen${Number.isFinite(run.assembledFilm.durationSeconds) ? ` · ${escapeHtml(run.assembledFilm.durationSeconds)} s` : ''}</h2><video controls preload="metadata" playsinline src="${escapeHtml(run.assembledFilm.path)}" aria-label="Gesamtfilm mit First/Last-Frame-Glue"></video><p>${escapeHtml(run.assembledFilm.method)}${Number.isInteger(run.assembledFilm.transitionCount) ? ` · ${escapeHtml(run.assembledFilm.transitionCount)} Bridges` : ''}</p></section>` : run.assembledFilm?.status === 'render_failed' ? `<p class="error">Gesamtfilm-Montage fehlgeschlagen: ${escapeHtml(run.assembledFilm.error)} · Einzelne Iterationsfilme sind verfügbar.</p>` : ''}
  ${renderMergedFilms(iterations)}
  ${renderTimingSummary(iterations, true)}
  ${run.autoDirectorSceneCount ? '<p>Neue Auto-Director-V2-Iterationen wählen ihre Szenenzahl selbst innerhalb der gespeicherten Grenzen; historische und manuelle Iterationen behalten ihren Szenenzahl-Modus. Szenendauern werden unabhängig davon erzeugt.</p>' : run.sceneCountSettings?.mode === 'taktmuster' ? '<p>Szenenzahl: ein fortlaufender Taktmuster-Schritt pro Iteration. Szenendauern werden unabhängig davon erzeugt.</p>' : ''}
  <p>${escapeHtml(run.description || 'Artikelreihenfolge: linear · Jede Iteration verwendet den nächsten Artikel und den nächsten Semantic-Stream-Ausschnitt. GPT nutzt Artikeltext, Nachrichtenfoto und Figurenkatalog. Die Bild-API erhält die gewählte Figur als abstrakte Protagonistenreferenz; ein vollständiges Gemälde wird nicht übergeben. Das Nachrichtenfoto dient der Bild-Orientierung.')}</p>
  <p><b>Gemeldete Medienkosten:</b> Video gesamt ${money(totalVideoCost)} · Bilder gesamt ${money(totalImageCost)} · GPT separat abgerechnet</p>
  ${reports}</main></body></html>`;
}
