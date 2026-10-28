# Automatic EU news scene generation

EU-News-Code ist hier gebündelt:

- `scripts/`: Abruf, HTML-Erstellung und EU-RESKI-Startskript samt Iterationsgenerator.
- `news-scene/`: Regieanweisung, Planung, Bildreferenzen, Provider und HTML-Bericht.
- `news/A/`: Sammlung und JEV-EU-Relevanzbewertung.
- `news-capitals/`: News-Quelldaten.
- `GENERATIONS/news/`: generierte Szenenläufe und HTML-Berichte.

## News-Sammlung A und JEV

Die separate JEV-Pipeline liegt ebenfalls hier. Die gespeicherte Sammlung befindet sich unter `eu-reski-news/news/A/`.

```sh
npm run news:eu:today # aktuelle EU-News abrufen
npm run news:eu:jev   # gespeicherte Artikel mit JEV nach EU-Bezug bewerten
npm run news:html     # HTML-Liste nach EU-Relevanz bauen
```

## Ausstellung dauerhaft starten

`npm run news:exhibition` startet `scripts/EU-reski-mix-arg-and-camera-moovs.start.sh`; Iterationszahl und weitere Generatorparameter kommen aus [`default-exhibition-settings.json`](default-exhibition-settings.json). Der eingecheckte Laufstand ist aktuell auf `gpt-4o-mini`, 4 Iterationen, Artikelbild- und Guernica-Ortsreferenz, Landscape-Prompt aus, Video- und Audio-Richtung an sowie `prunaai:p-video@2-pro`, 480p, Kostenmodus gesetzt. Die JSON enthält auch Szenenzahl, Szenenlänge, Bildmodell, Glue, visuelle Steuerungen und `legacyGuernicaStyleReferencePrompt` (standardmäßig aus). CLI-Flags überschreiben passende JSON-Werte. Der Runner speichert Startparameter und Versionsnummer in `GENERATIONS/news/exhibition/exhibition-state.json`; eine Änderung an den versionierten Einstellungen setzt den nächsten Start auf diese Vorgaben zurück und lässt vorhandene Ausgaben bestehen. Pfad-, Refresh- und Glue-Umgebungsvariablen können passende Vorgaben ebenfalls überschreiben. Der Shell-Starter lädt `.env` standardmäßig aus dem Main-Repository; mit `NEWS_ENV_FILE=/absoluter/pfad/.env` lässt sich das ändern.

News-Fetch läuft beim Start im Hintergrund, sobald Collection älter als 24 Stunden ist; Jev bewertet danach den EU-Bezug. Solange ein neues Ranking entsteht, generiert der Film weiter mit der letzten fertig bewerteten Collection. Auswahl läuft linear durch höchste Jev-Scores abwärts. Jede Iteration erzeugt bis zu vier Szenenvideos parallel; nach `Promise.all` werden Report und Film aktualisiert. FFmpeg setzt standardmäßig 30-ms-Audio-Fades an jede Szenenkante, damit der Ton beim Schnitt nicht klickt (`NEWS_VIDEO_CONCURRENCY`, `NEWS_VIDEO_AUDIO_EDGE_FADE_SECONDS`). Sobald alle Clips fertig sind, generiert der Supervisor First-Last-Frame-Brücken innerhalb der Iteration; zwischen Iterationen gibt es keine Brücke. Derselbe Prozess aktualisiert zwei Filme mit 0,25-s-Übergängen:

Nach dem Video-Prozess fügt `generate-news-scene-videos.mjs` bei mehr als zwei vollständig gerenderten Iterationen zusätzlich den Gesamtfilm `merged/eu-reski-gesamtfilm.mp4` zusammen. Der FFmpeg-Assembler setzt die Artikel-Titelkarten vor die Iterationsfilme; die Reihenfolge folgt `run.json`.

- `glue-vids/eu-reski-live-full.mp4`: alle Brücken.
- `glue-vids/eu-reski-live-random-bridges.mp4`: nur Brücken mit reproduzierbarem Zufallswert `> 0.7`.

Jede Iterationskarte zeigt die Überschrift „Geschichte“ und darunter `record.json → article.title`. Übergangsdauern laufen zyklisch `9,5,7,5,8` Sekunden; Frames entstehen bei `Ende − 0,25 s` und `Start + 0,25 s`. `--no-first-last-glue` schaltet Brückengenerierung aus; Standard ist an. Requests, Frames, Jev-Scores, Montage-Reihenfolge und Zufalls-Auswahl bleiben als Reproduktionsdaten erhalten. Ctrl-C beendet den Supervisor; erneuter Start setzt denselben Run fort.

```sh
npm run news:exhibition
```

Nützliche Overrides: `NEWS_REFRESH_INTERVAL_MS=86400000`, `EXHIBITION_FIRST_LAST_GLUE=0`, `EXHIBITION_GLUE_DURATION_PATTERN=9,5,7,5,8`, `EXHIBITION_GLUE_WAIT_PATTERN=classic|all|4,1,2,1,3,1,2,1` und `EXHIBITION_RANDOM_BRIDGE_THRESHOLD=0.7`.

`--transition-wait-pattern=classic|all|4,1,...` überschreibt das Glue-Taktmuster direkt beim Ausstellungsstart. `--article-image-reference` ergänzt ein echtes Pressebild; bekannte Fallback-/Platzhalterbilder werden übersprungen. `--guernica-location-reference` gibt Guernica GPT bei der Planung und FLUX als sekundäre Orts-/Raumreferenz. Das Pressebild und die Szenenhandlung führen; Guernica liefert nur Hintergrundraum und Atmosphäre, ohne Figuren, Pose, Komposition, Motive oder Farbbalance zu kopieren. Ohne dieses Flag bleibt der bisherige Prompt- und Referenzpfad unverändert. `--no-guernica-location-reference` schaltet den Zusatz explizit aus und überschreibt auch ein gespeichertes Enable-Flag. Maskierte Guernica-Figuren führen weiterhin die Protagonistenreferenz.

`--preserve-cubist-video-style` ergänzt ausschließlich den P-Video-Bewegungsprompt um eine Stilbindung an das gemalte, fragmentierte Erscheinungsbild des Startbilds. Sie bleibt auch erhalten, wenn `--video-direction=on` einen verfeinerten Bewegungs-Prompt erzeugt. Ohne Flag bleibt der bisherige P-Video-Prompt unverändert. Die Anweisung reduziert realistische Gesichter und Körper, kann das Videomodell aber nicht technisch darauf festlegen.

`generation.legacyGuernicaStyleReferencePrompt` (JSON, standardmäßig `false`) beziehungsweise `--legacy-guernica-style-reference-prompt` wählt den archivierten Regieprompt vom 23.10.2026 (`news-scene/director-legacy-guernica-style-reference-prompt.md`). Der Modus greift nur, wenn das vollständige Guernica-Bild als Stilreferenz an die Bildgenerierung gesendet wird. Bei `styleReference: false`, `--no-style-reference` oder `--guernica-location-reference` bleibt er wirkungslos; das jeweilige Referenz-Flag bestimmt weiterhin, welche Bilder mitgesendet werden. Im aktiven Modus gelten feste visuelle Steuerungen und der P-Video-Stil-Lock wird unterdrückt. Jeder Lauf protokolliert den effektiven Wert unter `generationSettings.legacyGuernicaStyleReferencePrompt` und speichert den verwendeten Regieprompt.

```sh
npm run news:exhibition -- --transition-wait-pattern=classic --article-image-reference --guernica-location-reference
npm run news:exhibition -- --article-image-reference --no-guernica-location-reference
npm run news:exhibition -- --preserve-cubist-video-style
npm run news:exhibition -- --legacy-guernica-style-reference-prompt
```

### Geordnete Scene-Iteratoren

Ein Scene-JSON kann geordnete Iterator-Konfigurationen laden. Jede referenzierte JSON-Datei darf unter `generation` nur Werte überschreiben, die vom Standard abweichen; fehlende Werte erben aus [`default-exhibition-settings.json`](default-exhibition-settings.json). CLI-Flags überschreiben danach alle Iterator-Konfigurationen.

```json
{
  "paths": [
    "./iterator-01.json",
    "./iterator-02.json",
    "./iterator-03.json",
    "./iterator-04.json"
  ],
  "generationInterval": "1h",
  "biasMode": "on"
}
```

Iterator-Datei enthält zum Beispiel:

```json
{
  "generation": {
    "storyModel": "gpt-4.1-mini",
    "imageProvider": "hf-flux-klein",
    "sceneCount": { "mode": "fixed", "count": 5 }
  }
}
```

Relative Iterator-Pfade beziehen sich auf den Ordner des Scene-JSONs. `generationInterval` ist Gesamtfenster für geordnete Liste und akzeptiert `ms`, `s`, `m` oder `h`; `-1` bedeutet fünf Sekunden je Iterator. Bei `1h` und vier Iteratoren beträgt jeder Slot 15 Minuten. `biasMode: "on"` startet in Slotmitte (nach 7 Minuten 30 Sekunden), `"off"` am Slotanfang. Startzeiten liegen dann bei `00:07:30`, `00:22:30`, `00:37:30`, `00:52:30`. Eine verspätete Generation überlappt nicht mit nächster: Runner startet nächsten Iterator sofort, sobald vorheriger fertig ist.

```sh
npm run news:exhibition -- --scene=./exhibition-scene.json
```

Kurzform mit festem npm-Befehl; Scene-Datei als Argument nach `--` übergeben:

```sh
npm run news:exhibition:from-scene-json -- ./pfad/zur/exhibition-scene.json
```

Mit Zeitinterpolation und Standard-Gesamtfenster von einer Stunde (überschreibt `generationInterval` aus der Scene-JSON):

```sh
npm run news:exhibition:from-scene-json:with-time-interpolation -- ./pfad/zur/exhibition-scene.json
```

Intervall pro Aufruf überschreiben, zum Beispiel auf zwei Stunden: `npm run news:exhibition:from-scene-json:with-time-interpolation -- ./pfad/zur/exhibition-scene.json --generation-interval=2h`. Beim normalen `from-scene-json`-Befehl kommt Intervallvorgabe aus Scene-JSON.

Lauf setzt Iterator-Reihenfolge zyklisch fort und speichert Scene-Plan im Run-Manifest. Bei Wiederaufnahme denselben Scene-Plan und dieselben CLI-Overrides erneut angeben.

`Article + semantic-stream fragments + masked character catalog → GPT story and protagonist choice → FLUX Klein first frames (selected figure for protagonist identity; optional article photo for subject orientation; --guernica-location-reference adds Guernica as secondary setting/space reference; without it, the previous prompt/reference path remains) → cumulative HTML audit report`.

The generator writes every image prompt through a multimodal GPT API request. No article-specific scene prompt is hard-coded. The versioned authoring instructions in `news-scene/director.md` preserve the accepted dark material treatment and physical integration of characters. The selected figure is redrawn in the new space rather than pasted into a photograph. Image provider can be selected independently: Runware remains default; `hf-flux-klein` uses the Hugging Face Space API. `--scenes` accepts 1–7 scenes; default remains 3.

## Run

From the repository root, with Node 22+ and dependencies installed:

```sh
npm run news:story
```

The EU-RESKI shell starter writes under `eu-reski-news/GENERATIONS/news/iteration-NNN`. Its editable settings block controls scene count, article order, article/semantic inputs, iteration count, and Taktmuster timing. Each report contains one still per scene plus the film handoff. Source articles come from `eu-reski-news/news/A` by default.

Article order defaults to `linear`: each new run starts with the first eligible article in the latest aggregate and advances one article per iteration, wrapping at the end. A new invocation starts at the beginning again. Use `--article-order=random` to draw randomly each iteration; `--article-id=ID` pins one article.

```sh
# Three articles in collection order
npm run news:story -- --iterations=3

# Three randomly selected articles
npm run news:story -- --iterations=3 --article-order=random
```

For the next Codex turn, use this instruction: “Run `npm run news:story`, open the generated HTML, and review the three start images. Keep the image-only API workflow, strong abstract Guernica-style painting, article-grounded story, meaningful relevant semantic motifs, and optional crocodile. Do not commit generated images or secrets.”

Scene count can be changed without editing the npm script (1–7):

```sh
npm run news:story -- --scenes=1

# Seven scenes
npm run news:story -- --scenes=7
```

For direct control of flags and resume behavior, use the Node command below.

```sh
node --env-file=.env eu-reski-news/scripts/run-news-scene-image-iteration.mjs
```

Requires `OPENAI_API_KEY`, `RUNWARE_API_KEY` (or `RUNWARE_KEY`), a saved `eu-reski-news/news/A/all-*.json` collection, the full-painting style reference, and the masked figure catalog. `--style-reference=PATH` selects the style image. `GUERNICA_DIRECTORY` or `--guernica-dir=PATH` selects the masked figure catalog. `--news-dir=PATH` selects another article collection. `NEWS_STORY_MODEL` overrides `gpt-6-luna`; GPT-6 Luna uses medium reasoning without a temperature setting in story and timing requests. GPT-6.1 Sol overrides use high reasoning. Other models retain the existing sampling setting. The replacement must support vision and Chat Completions structured output.

For the separate Hugging Face adapter, set `HF_TOKEN` in `.env`, then run `npm run news:story -- --image-provider=hf-flux-klein`. It uses the Space's `/generate` endpoint, distilled 16-step mode, 1680×944 output, selected figure reference and, by default, full-painting style reference. Add `--no-style-reference` to send only the selected figure crop. Runware remains unchanged and default. Hugging Face ZeroGPU consumes account GPU quota or prepaid credits; the Space does not report per-image GPU seconds, so exact per-image dollar cost is not recorded. Do not commit `.env` or tokens.

Default: newest saved aggregate by filename in `news/A`, linear article order with text and an image, live semantic-stream seeds `EU/de`, `EU/en`, `EU/ru`, three scenes and one still per scene. Set `--scenes=7` for seven scenes. One Selfomat-compatible Taktmuster rhythm instance stays alive for the whole process, advancing once per scene across iteration boundaries. Default balanced meter is 4/4; pattern values pass through the shared `resolveSceneLengthsInput` helper, then Selfomat's floor, multiplier and bias stages before the 5–8 second clamp. The news starter defaults to one run; set `NEWS_MAX_ITERATIONS=0` or `-1` for an endless run. A saved collection may be older than today; the report records its exact path, hash and article date. The generator does not fetch fresh news.

```sh
# One scene / one image for a small iteration
node --env-file=.env eu-reski-news/scripts/run-news-scene-image-iteration.mjs --scenes=1

# Reuse a particular eligible article from the newest saved aggregate
node --env-file=.env eu-reski-news/scripts/run-news-scene-image-iteration.mjs --article-id=472860428

# Different semantic seeds (comma-separated words use German)
node --env-file=.env eu-reski-news/scripts/run-news-scene-image-iteration.mjs --words=EU,Frieden,Erinnerung

# Multilingual seeds file: [["EU","de"],["Europe","en"],["Европа","ru"]]
node --env-file=.env eu-reski-news/scripts/run-news-scene-image-iteration.mjs --words-file=words.json

# Generate GPT prompts and HTML first, with no image API calls
node --env-file=.env eu-reski-news/scripts/run-news-scene-image-iteration.mjs --prompt-only

# Continue that exact iteration, retaining article, semantic snapshot and GPT plan
node --env-file=.env eu-reski-news/scripts/run-news-scene-image-iteration.mjs --resume=/absolute/path/to/iteration-008
```

`--news-dir` selects another source collection directory. `--output-dir` selects the generation root directly. `--stream-module` (or `NEWS_SEMANTIC_STREAM_MODULE`) can select the absolute entry point of an existing semantic-stream installation for a worktree without node_modules. Use the current semantic-stream package (3.0.5 was used for the live example). The package handles sequential Wikipedia requests and throttling.

`--stream-file=snapshot.json` accepts a saved `semantic-stream.json` from this generator (entries with unique `id`, `seed: [word, language]`, and `item.title`). This replays source fragments without another Wikipedia request; it does not replace them with an invented word list.

## What is automatic

1. An eligible article is selected from the newest saved aggregate in the configured order: linear by default, or random with `--article-order=random`.
2. `semantic-stream.initStreams` initializes each configured seed. `getNext()` supplies a real linked fragment, including its surrounding sentences when available.
3. GPT sees the article text, photograph, stream snapshot, and masked figure catalog. Article facts and semantic links determine story; GPT selects one catalog figure for the continuous fictional protagonist.
4. GPT returns a strict JSON plan. Each `stillPrompt` is handed to the image API unchanged. The API receives the selected figure for protagonist appearance and gesture, plus the complete painting for painterly style. Do not import the reference figures' original stories or context. The article photo is never sent to the image API.
Image references are resized proportionally with `sharp` when needed to satisfy Runware’s 128–2048 pixel limits. Extreme aspect ratios receive transparent padding. Original files remain unchanged; API copies, hashes and paths are logged.

5. The visual plan is locked before a separate GPT timing request writes `durationSeconds` and `videoPrompt`. The visual request contains no timing mode, duration values, timing bounds or video prompts. Both timing modes use this same visual planning path. The timing response can only assign duration and motion, and a SHA-256 check rejects any change to the locked visual plan. Each still is saved at 1680×944. `film-plan.json` exposes `videoPrompt`, `durationSeconds`, and `startImagePath`; use that image as the image-to-video input and the prompt as its motion direction. This prepares film generation without calling a video API. Prompts animate only their own scene: the current plan does not capture a clip's final frame or chain it into the next scene. For true visual continuity, the film runner must capture each last frame and use it as the next clip's input.

Scene durations use Selfomat's `resolveSceneLengthsInput` + Taktmuster pipeline. Pattern values are normalized, then scaled with `round(patternValue × multiplier + bias)` and clamped to the configured minimum and maximum. Defaults: balanced 4/4, multiplier 1.15, bias 3.85 seconds, range 5–8 seconds. Override with `NEWS_SCENE_LENGTH_MULTIPLIER`, `NEWS_SCENE_LENGTH_BIAS`, `NEWS_MIN_SCENE_DURATION_SECONDS`, and `NEWS_MAX_SCENE_DURATION_SECONDS`, or matching CLI flags.

## Optionale Dramaturgie und Videoregie

Alle neuen Funktionen sind standardmäßig ausgeschaltet. Damit bleiben bisherige Aufrufe und alte Filmpläne unverändert.

```sh
# Finalen Story-Clou bei der ursprünglichen Story-Planung einplanen
npm run news:story -- --story-clou=on

# Nach den Startbildern GPT-Regie planen; vorhandene Dauer und alter Prompt bleiben erhalten
npm run news:story -- --video-direction=on --video-mode=auto

# Zusätzlich die tatsächlich erzeugten Startbilder an GPT Vision senden
npm run news:story -- --video-direction=on --video-vision=on --video-mode=auto

# Beide Schritte zusammen; weiterhin keine Endbilder oder Videos erzeugen
npm run news:story -- --story-clou=on --video-direction=on --video-vision=on --video-mode=auto
```

`--video-mode` akzeptiert `auto`, `image_to_video` oder `first_last_frame`. Im Modus `auto` entscheidet GPT je Szene und begründet die Wahl. First-Last-Frame bleibt eine Planungsempfehlung: Das Startbild wird referenziert, `lastFrame.imagePath` bleibt `null`, der Status meldet `requires_last_frame`; es wird kein Endbild und kein Video erstellt. Es ist kein Video-Modell oder -Provider festgelegt.

Die Story-Planung speichert bei aktiviertem Clou `story-arc.json` im selben GPT-Plan, der die Szenenbilder vorgibt. Die Videoregie läuft nach der Bildgenerierung. `--video-vision=on` benötigt `--video-direction=on` und untersucht gespeicherte Bilddateien. Bei `--prompt-only` oder fehlenden Bildern markiert der Bericht Vision als nicht verfügbar und lässt eine klar als plan-only markierte Videoregie zu. Vision verwendet standardmäßig `NEWS_VIDEO_VISION_MODEL` oder das Story-Modell; die Videoregie verwendet `NEWS_VIDEO_DIRECTOR_MODEL` oder das Story-Modell.

Neue Artefakte: `video-vision.json`, `video-direction.json` und ein versionierter Zusatz in `film-plan.json` (`formatVersion: 2`). Der bestehende `scenePlan[].videoPrompt` bleibt der unveränderte Timing-Prompt. Der Zusatz enthält einen separat benannten verfeinerten Prompt. Die festgelegte Dauer und der gelockte Bildplan bleiben unverändert. `video-vision-request.json` und `video-direction-request.json` protokollieren die Eingaben; Vision-Bilddaten werden darin als lokale Pfade statt Base64 gespeichert. Antworten und `*-pending.json` folgen der vorhandenen API-Recovery-Regel, also kein automatischer kostenpflichtiger Wiederholungsversuch bei unklarem API-Ausgang. Resume übernimmt Feature-Einstellungen aus `record.json` beziehungsweise `run.json`.

## Visual style, film motion, semantic influence and crocodile

Director version 11 restores iteration 018's dark, heavily abstracted cubist treatment: near-monochrome charcoal, ash and stained ivory; shallow fractured planes; mask-like asymmetrical faces; rough oil scumbling and scraped plaster. The selected masked crop guides only the fictional protagonist's appearance and gesture; the complete painting guides painterly style only. Neither reference supplies story events, props, symbols or layout. GPT uses the article text, photo and stream to construct the story. The photo is not sent to the image API. Images still need visual review because reference-only constraints cannot technically hide depicted content from the image model.

The crocodile is optional: include the original recurring character only if it makes sense as a visible metaphor; it is never forced as decoration. Its long angular snout, jagged back, short legs, fractured charcoal/ivory planes and one worn-gold scale keep it recognizable when chosen. It is not a figure in Picasso's original painting. Existing saved image files remain as generated; HTML can attach a visual review.

## Audit and recovery

New iterations record the generator commit, branch and whether tracked code was clean at startup in `record.json` and the HTML report. Every iteration includes `record.json`, `semantic-stream.json`, the exact `director.md` snapshot and SHA-256, sanitized `gpt-request.json` with local image paths, raw GPT response, `scene-plan.json`, image requests/responses, local reference images, generated first frames and a static `index.html`. The report works directly from a file URL. GPT token usage and provider-reported image costs are shown separately.

API responses are saved before download or validation. Resume uses the saved response instead of paying for a second generation if a download failed. If the process stops during an API call, the `*-pending.json` marker blocks automatic repetition. Check the provider history and recover the response before retrying; do not blindly delete the marker. API refusals/errors also remain saved for inspection. There is no automatic paid retry loop or manual-prompt fallback.

Source article text is untrusted data. The scene plan separates article claims, visual observations and invented metaphors. Model output quality and the strength of semantic associations still vary; the report exposes those decisions for review.

Implementation references: [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [vision inputs](https://developers.openai.com/api/docs/guides/images-vision).

## Recorded live run

`iteration-009` selected a Latvian storm warning from the 2026-10-09 aggregate. Live stream fragments were Italien, Member state of the European Union, and Франция. GPT selected figure 6 and created the final coastal image prompt. That exact prompt produced one Seedream still, with a provider-reported image cost of $0.01926 and 7,351 GPT tokens (billed separately). The image was inspected: the figure is redrawn in the coastal scene; the requested raised-arm gesture was not preserved. Prompt adherence and artistic quality remain reviewable in the HTML.

## Commit message

For changes to this workflow, use a scoped Conventional Commit, for example:

```text
feat(news): generate three-scene HTML iterations
```
# Bild- und Szenensteuerung

## Szenen aus aktuellen Stream-Begriffen

Jede neue Iteration übernimmt die nächsten Fragmente der laufenden Semantic-Streams über `getNext()`. GPT entwickelt zuerst freie, auch lose oder überraschende Assoziationen und verbindet sie mit der Nachricht zu einer erfundenen Bildgeschichte. `semanticUse` protokolliert die laut GPT verwendeten Motive, Szenen und kurzen Erklärungen. Es gibt keine inhaltliche Prüfung, keinen wörtlichen Motivabgleich und keine Mindestzahl verwendeter Begriffe. Nur Datenformat und Szenenindizes werden geprüft; die Zuordnung wird nicht automatisch umgeschrieben. Nachrichtenfakten und erfundene Bildgeschichte bleiben getrennt. Die Berichte zeigen den Stream-Einfluss ausdrücklich als Einschätzung von GPT.

Bildaufbau und Figurenreferenz werden passend zur Handlung gewählt und dürfen sich wiederholen, auch direkt hintereinander. Es gibt keine Wechselquote. Der Generator ergänzt keine vorgefertigten Posen, Requisiten oder Kamerapositionen mehr; die geplante Szene bleibt maßgeblich. Stil-, Symbolik-, Raumtiefe- und Layering-Vorgaben gelten weiterhin.

## Szenenzahl pro Iteration

Standard ist `--scene-count-mode=fixed`: `--scenes=5` erzeugt fünf Szenen pro Iteration. Mit `--scene-count-mode=taktmuster` liefert ein eigener, fortlaufender Taktmuster-Strom genau einen Zählwert pro Iteration. In diesem Modus wird `--scenes` nicht verwendet.

```sh
./eu-reski-news/scripts/MIX-again-eu-news-scenes.sh \
  --iterations=4 --scene-count-mode=taktmuster \
  --scene-count-takt=2 --scene-count-numerator=3 --scene-count-denominator=4 \
  --scene-count-type=balanced --scene-count-bias=2 \
  --min-scenes=1 --max-scenes=12 --scene-length-takt=-1
```

Die Standardwerte bilden zwei Takte im 3/4-Metrum, Typ `balanced`. Auf jeden gerundeten Rohwert wird der ganzzahlige Bias 2 addiert; danach gelten die Grenzen 1–12. Kleinere Grenzen lassen sich weiterhin explizit setzen. Im festen Modus sind ebenfalls 1–12 Szenen möglich (`--scenes=12`). Daraus entsteht beispielsweise die Folge **5, 3, 3, 4, 3, 3**, die sich wiederholen kann. `--scene-count-type=classic` verwendet die alternative Taktmuster-Strategie. Gleiche aufeinanderfolgende Werte gehören zum Rhythmus.

Der Zählstrom und der vorhandene Dauerstrom sind unabhängig: Zählung zieht einmal pro Iteration, Dauer einmal pro Szene. `--scene-length-takt=-1` lässt weiterhin GPT die Sekunden wählen; ein positiver Wert aktiviert den separaten Dauerrhythmus. Bei wechselnden Szenenzahlen läuft dieser über Iterationsgrenzen weiter. Die Bild-Seeds werden über die bisherige Gesamtzahl der Szenen versetzt und überlappen dadurch nicht zwischen unterschiedlich langen Iterationen.

`run.json` speichert Zählmodus und Takteinstellungen; jedes `record.json` protokolliert Rohwert, Bias und tatsächliche Szenenzahl unter `sceneCountSelection`. `--resume-run` übernimmt gespeicherte Zähleinstellungen und überspringt die bereits verbrauchten Schritte. Einzelne `--resume`-Aufrufe verwenden die gespeicherte Szenenzahl ohne neue Ziehung. Alte Läufe ohne Zählmetadaten bleiben im festen Modus. Der HTML-Bericht zeigt die Zählentscheidung und die Übersicht mit tatsächlicher Szenenzahl und Dauern.

Der Shell-Starter bietet dieselben Einstellungen als `NEWS_SCENE_COUNT_MODE`, `NEWS_SCENE_COUNT_TAKT`, `NEWS_SCENE_COUNT_NUMERATOR`, `NEWS_SCENE_COUNT_DENOMINATOR`, `NEWS_SCENE_COUNT_TYPE`, `NEWS_SCENE_COUNT_BIAS`, `NEWS_MIN_SCENES` und `NEWS_MAX_SCENES`. CLI-Werte haben beim Start Vorrang; beim Fortsetzen gelten die gespeicherten Zähleinstellungen.

## Bildparameter und Szenendauern

Die visuellen Einstellungen steuern GPTs Szenenentwurf und die Bildanweisung an FLUX:

- `--symbolic` / `--no-symbolic`: artikelbezogene, sichtbare Metaphern an oder aus.
- `--room-deepness` / `--no-room-deepness`: gemalte Vorder-, Mittel- und Ferne an oder aus.
- `--layering=0..7`: Zahl klar unterscheidbarer, inhaltlich begründeter Raumschichten. `0` schaltet zusätzliche Ebenen aus. Bei Werten 1–7 fügt der Prompt zum Schluss eine verbindende Malschicht hinzu, die Pigment, Konturen und Schatten zu einer einzigen Bildfläche zusammenführt.

Standard: GPT wählt Symbolik, Raumtiefe und Layering für jede Szene einzeln passend zu Handlung und Schauplatz und protokolliert die Begründung im HTML. Die fertigen Bildprompts erhalten genau diese Werte. Mit `--fixed-visual-controls` gelten stattdessen die CLI-Schalter für alle Szenen; dieser Modus ist für kontrollierte A/B-Vergleiche gedacht. Ein Resume behält Werte aus dem gespeicherten Lauf. Video-Kamerabewegungen leitet GPT aus dem fixierten Bildplan und den jeweiligen Szenenebenen ab. Die Zeitplanung analysiert keine bereits gerenderten Bildpixel.

Für Szenenlängen kann `--scene-length-takt=-1` den Selfomat-Taktmuster-Scaler umgehen. GPT legt dann in einem separaten Schritt jede Dauer passend zum bereits fixierten Spannungsbogen fest. Dauer bleibt standardmäßig zwischen 5 und 8 Sekunden; mit `--min-scene-seconds` und `--max-scene-seconds` lässt sich dieser Bereich anpassen (zulässig: 5–15 Sekunden). Bei positivem Takt übernimmt derselbe separate Schritt die vorgegebenen Selfomat-Dauern unverändert und schreibt passende Videobewegungen. Der Zeitmodus gelangt nie in die Bildplanung. Bildprompts, Figurenwahl, Komposition und Handlung können von der Zeitantwort nicht überschrieben werden.

Neue Läufe speichern `planningVersion: 2`, `visual-plan.json`, dessen `visualPlanHash` und `timing-request.json` / `timing-response.json`. `scene-plan.json` enthält anschließend den unveränderten Bildplan plus Sekunden und Videoprompts. Der Bericht zeigt Dauerbegründungen und beide Planungsstufen. Dieser zusätzliche GPT-Aufruf wird in der Tokenbilanz mitgerechnet. Ein Resume eines alten Laufs verwendet weiter dessen gespeicherte kombinierte Planung; es schreibt keine alten Bilder oder Prompts um. Frisch gestartete Läufe bleiben unabhängig stochastisch: identische Bildplanungs-Eingaben garantieren keine identischen generierten Bilder.

Beispiel für vier Ebenen plus verbindenden Malpass:

```sh
npm run news:story -- --layering=4 --room-deepness --scene-length-takt=-1 --max-scene-seconds=15
```

Die drei gespeicherten Vergleichsvarianten lassen sich mit einem Starter neu erzeugen. Er kopiert den gespeicherten Artikel-Aggregat und Semantic-Stream-Snapshot in einen neuen Laufordner und schreibt wieder einen gemeinsamen HTML-Bericht:

```sh
./eu-reski-news/scripts/replay-ab-depth-symbolism-001.sh
```

Optionalen Laufordnernamen als einziges Argument übergeben. Der Starter bricht ab, falls dieser Ordner bereits existiert.

## Videobewegung aus dem Startbild

`--video-direction=on` plant pro Szene Bewegungsvektoren relativ zum vorhandenen Startbild, eine getrennte Kamerafahrt, den visuellen Endzustand und Übergänge zwischen benachbarten Szenen. `--video-vision` folgt standardmäßig dem Modus der Videoregie: bei `--video-direction=on` wird die bestehende GPT-Vision-Analyse eingeschaltet, bei Videoregie aus bleibt sie aus. Mit `--video-vision=off` lässt sie sich explizit auslassen; dann kennzeichnet der Plan die fehlende Pixelbeobachtung und bleibt qualitativ unsicher.

Bewegungsvektoren können verlässliche normalisierte Bildkoordinaten (0–1) oder ausdrücklich qualitative, ungefähre Positionen enthalten. Start- und Endzeit jedes Vektors müssen in die unveränderte Szenendauer passen. Kamerabewegung ist unabhängig und darf statisch bleiben. Der Modus `first_last_frame` enthält Endkomposition, Konsistenzvorgaben und einen künftigen Bildbrief; `lastFrame.imagePath` bleibt `null` und der Status `requires_last_frame`, bis jemand separat ein Endbild bereitstellt. Es werden keine Endbilder oder Videos erzeugt.

`video-direction.json` verwendet die Version `eu-reski-video-director-v3`; `film-plan.json` nutzt Formatversion 4. Der vorhandene Director plant Kameras in einem gemeinsamen Iterationsaufruf: pro Szene Bewegung, Zoom, Ausschnitt und Kontinuitätsabsicht; pro Schnitt den Bezug zur vorigen und nächsten Einstellung. Statische Kamera ist eine gleichwertige Wahl. Der Zoom ist standardmäßig auf 8 % des Bildausschnitts begrenzt und lässt sich mit `--video-max-zoom=0..0.3` steuern. Bildobjektbewegung bleibt separat. Szenendauern bleiben unverändert.

Audio-Regie ist optional: `--video-audio-direction=on` ergänzt den bestehenden Director-Aufruf um ein iteratives Klangkonzept und Soundereignisse pro Szene; der Default `off` erzeugt weder Audiofelder noch einen Audioabschnitt im Grok-Prompt. Das verwendet keinen weiteren GPT-Aufruf. Runwares Modell-Doku beschreibt Grok Imagine Video 1.5 Lite als Video mit nativem Audio: Sound wird im `positivePrompt` dirigiert und kommt im selben MP4 zurück, ohne separaten Audio-Parameter oder Dienst. Dialog und Erzählstimme bleiben ausgeschlossen. Soundzeitpunkte müssen innerhalb der unveränderten Szenendauer liegen; Stille ist erlaubt.

Der finale, tatsächlich an Grok gesendete Prompt ist pro Szene im Filmplan, im HTML und nach dem Video-Request zusätzlich in `scene-N-video-request.json` gespeichert. HTML zeigt außerdem Kameraübersicht, Audiokonzept und per ffprobe erkannte Tonspur. Der FFmpeg-Concat nutzt bei kompatiblen Streams weiter `-c copy`; der bereits vorgesehene Video-Re-Encode-Fallback erhält Audiospuren, normalisiert sie für den Concat und ergänzt bei fehlendem Ton Stille. Es gibt keine Crossfades und keine zusätzliche Tonbearbeitung.

## Linearer P-Video-2-Pro-Lauf

`--videos-after-each-iteration` startet nach der Bild- und Szenenplanung jeder Iteration direkt die passende Image-to-Video-Erzeugung und fügt die fertigen Clips in `merged/iteration-NNN.mp4` zusammen. Der Video-Starter sendet das erste Bild als `inputs.frameImages`, `resolution: "480p"`, eine ganzzahlige Dauer von 5 bis 15 Sekunden und `settings.mode: "cost"`; `outputQuality` bleibt weg. So bleibt API-Payload mit P-Video-2-Pro-Schema kompatibel. `--iteration=iteration-NNN` erlaubt gezieltes Fortsetzen einer einzelnen Iteration. Pro Clip und im Sammel-HTML stehen Anbieter-Kosten.

Video-Polls laufen je Aufruf höchstens 60 Sekunden. Danach steht `run.json` auf `pending_media` und listet Iterationen, Szenen und gespeicherte Task-IDs. `--resume-run=PATH` pollt dieselben IDs erneut und überspringt vorhandene Videodateien. Hugging Face Bild-Submits ohne gespeicherte Event-ID bleiben fail-closed: automatischer Neu-Submit wäre nicht sicher, da er doppelte Kosten verursachen könnte. Provider-Verfügbarkeit und endgültigen Abschluss kann der Runner nicht garantieren; er sichert lokale Checkpoints und wiederaufnehmbare Arbeit.

Beispiel für zehn lineare Iterationen mit je fünf Szenen:

```sh
node --env-file=/absolute/path/to/.env eu-reski-news/scripts/run-news-scene-image-iteration.mjs \
  --iterations=10 --scene-count-mode=fixed --scenes=5 \
  --scene-length-takt=-1 --min-scene-seconds=5 --max-scene-seconds=6 \
  --symbolic --no-room-deepness --layering=3 --fixed-visual-controls \
  --video-mode=image_to_video --videos-after-each-iteration \
  --video-model=prunaai:p-video@2-pro --video-resolution=480p --video-settings-mode=cost \
  --output-dir=/absolute/path/to/eu-reski-news/GENERATIONS/news/p-video-run
```

Artikelwahl und Semantic-Stream bleiben über alle Iterationen fortlaufend. Der Sammelbericht enthält Szenenzahl, Dauern, Bilder, Bild- und Videoprompts, Anfrageeinstellungen, Clips, Merges und gemeldete Medienkosten. GPT-Kosten sind separat und nicht Teil der Runware-Medienkosten.

Prompt-Version, Video-Modus, Audio-Schalter, Zoomlimit und Startbild-Hashes fließen in den Cache-Schlüssel ein. Ein geändertes Startbild oder eine geänderte Audio-/Zoom-Einstellung macht gespeicherte Regie veraltet; Resume stoppt dann, statt still eine gemischte Iteration fortzusetzen.

Für einen echten Vergleich vollständiger linearer Dreierläufe:

```sh
./eu-reski-news/scripts/compare-news-scene-flags.sh --iterations=3 --scenes=5 --layerings=3,7 --scene-length-takt=-1 --news-dir=/path/to/news/A
```

Dieser Starter speichert die gemeinsame Nachrichtenquelle und einmalig drei aufeinanderfolgende `getNext`-Snapshots. Jede Flagkombination spielt mit `--stream-sequence-file` genau diese Folge ab Anfang ab und durchläuft alle drei Artikel. Getestet werden Symbolik an/Tiefe aus, an/an und aus/an, jeweils für beide Layering-Werte: sechs Varianten, 18 Iterationen, 90 Bilder. Die Bild-Seeds sind pro Iteration und Szene in allen Varianten gleich. Der gemeinsame HTML-Bericht wächst während des Laufs. Zum Fortsetzen denselben Starter mit `--resume=/absolute/comparison-folder` aufrufen; gespeicherte Eingaben und abgeschlossene Iterationen werden wiederverwendet. Ein Archiv der verwendeten Quelltexte und deren Hashes liegt unter `input/source`.

## Run-Referenz: EU-RESKI, 23.10.2026

Die dokumentierte 10er-Generation liegt lokal unter:

```text
eu-reski-news/GENERATIONS/news/p-video-2-pro-cost-10-20261023-001/run-001/
```

`p-video-2-pro-cost-10-20261023-001` ist der beim Start gewählte Output-Ordner. Der Generator vergibt darin automatisch `run-001`, dann `iteration-001` bis `iteration-010`. Die Generationsordner sind in `.gitignore`; Quellcode und diese Referenz sind versioniert, große Medien bleiben lokal.

Verwendete Eingaben und Einstellungen:

- Artikel-Sammlung: `eu-reski-news/news/A/all-2026-10-18T10-06-21-802Z.json`, linear ausgewählt.
- Semantic Stream: Seeds `EU/de`, `EU/en`, `EU/ru`; neue Live-Fragmente pro Iteration.
- 10 Iterationen, 5 Szenen je Iteration; GPT wählte Szenenlängen von 5–6 Sekunden.
- Bilder: Runware `bytedance:seedream@5.0-flash`; Video: Runware `prunaai:p-video@2-pro`, `480p`, `cost`.
- Stil: Symbolik an, Raumtiefe aus, Layering 3, feste Bildregler.
- Benötigt `.env` mit `OPENAI_API_KEY`, `RUNWARE_API_KEY` (alternativ `RUNWARE_KEY`). Stilbild und maskierter Guernica-Katalog müssen lokal erreichbar sein; die Referenz nutzte `/Users/eggermann/Projekte/EU-RESKI/guernica-by-pablo-picasso.jpg!Large.jpg` und `/Users/eggermann/Projekte/EU-RESKI/guernica_elemente_maskiert`. Andere Pfade über `NEWS_STYLE_REFERENCE` / `--style-reference` und `GUERNICA_DIRECTORY` / `--guernica-dir` setzen.

Neue Generierung starten (API-Aufrufe kosten Geld und sind nicht deterministisch):

```sh
OUT_ROOT="eu-reski-news/GENERATIONS/news/p-video-2-pro-cost-10-$(date +%Y%m%d)-001"
node --env-file=.env eu-reski-news/scripts/run-news-scene-image-iteration.mjs \
  --iterations=10 --scene-count-mode=fixed --scenes=5 \
  --scene-length-takt=-1 --min-scene-seconds=5 --max-scene-seconds=6 \
  --symbolic --no-room-deepness --layering=3 --fixed-visual-controls \
  --video-mode=image_to_video --videos-after-each-iteration \
  --video-model=prunaai:p-video@2-pro --video-resolution=480p --video-settings-mode=cost \
  --output-dir="$OUT_ROOT"
```

Im neuen Run liegen pro Iteration `record.json`, `semantic-stream.json`, `film-plan.json`, `index.html` und `media/scene-N-first-frame.jpg` / `media/scene-N-video.mp4`. `run.json` listet Iterationen und Einstellungen; `index.html` ist der kumulative Bericht.

Gesamtfilm aus vorhandenen `merged/iteration-NNN.mp4`-Clips neu rechnen. ImageMagick, `fc-match` und FFmpeg müssen installiert sein. Jede Geschichte bekommt Titelkarte aus `record.json` → `article.title`: `merged/title-cards/title-NNN.txt`, `.png` und `.mp4`. `merged/full-film.txt` protokolliert die Reihenfolge. Der finale H.264/AAC-Film heißt `merged/eu-reski-gesamtfilm.mp4`.

```sh
npm run news:assemble-film -- --run-dir="$OUT_ROOT/run-001"
```

Für diesen Lauf kosteten Runware-Bilder und -Videos zusammen $3.9005 (GPT separat). Der fertige Film ist 5:34 Minuten lang. Die Karten zeigen Artikelüberschriften in Originalsprache, jeweils vor dem passenden Iterationsfilm.

### First-Last-Frame-Brücken innerhalb einer Iteration

Standard für `news:glue-scenes`, Montage und `news:exhibition` ist `new Taktmuster({ taktCnt: 2, zaehler: 4, nenner: 4, type: 'classic' })`; der globale `getNext().patternValue`-Strom liefert `4,1,2,1,3,1,2,1` und läuft über Iterationen weiter. `--transition-wait-pattern=4,1,...` kann ihn explizit überschreiben; `--transition-wait-pattern=all` erzeugt eine Brücke an jeder benachbarten Szenengrenze. Jede Brücke startet mit dem letzten decodierten Frame der vorherigen Szene und endet mit dem ersten Frame der nächsten Szene derselben Iteration. Es gibt keine Brücke über Iterationsgrenzen hinweg. Runware P-Video-2-Pro akzeptiert beide Endpunkte als `inputs.frameImages` (`frame: "first"` / `frame: "last"`); Mindestdauer beträgt fünf Sekunden.

```sh
RUN="eu-reski-news/GENERATIONS/news/p-video-2-pro-cost-10-20261023-001/run-001"
export DAILYDOASE_ENV_FILE="/Users/eggermann/Projekte/dailydoase/.env"
npm run news:glue-scenes -- --run="$RUN" --iterations=5 --transition-wait-pattern=all
npm run news:assemble-film -- \
  --run-dir="$RUN" --scene-glue-dir="$RUN/glue-vids" --limit=5 --transition-wait-pattern=all
```

Aus 5 Iterationen × 5 Szenen entstehen 20 Übergangsclips. Dateien landen unter `run-001/glue-vids/iteration-NNN/scene-NNN-to-NNN.mp4`; jeweilige `*-first.jpg` und `*-last.jpg`, API-Request/Response und `glue-run.json` bleiben dort als Referenz. Der Film-Merge legt die Titelkarten in `glue-vids/title-cards/` ab. Quelle je Karte: `iteration-NNN/record.json` → `article.title`. `glue-vids/film-order.txt` protokolliert Filmreihenfolge; Ausgabe heißt `glue-vids/eu-reski-first-5-glued.mp4`.

Der Generator ist resumierbar: denselben Befehl erneut aufrufen. Vorhandene Übergänge werden übersprungen; angelegte Request-UUIDs werden erst über Runware abgefragt, damit ein Retry keinen neuen bezahlten Auftrag erzeugt. `glue-run.json` enthält tatsächlich gemeldete Kosten. Aktuelle Runware-Spezifikation und Tarif können sich ändern; siehe [P-Video-2-Pro API](https://runware.ai/docs/models/prunaai-p-video-2-pro) und [First/last-frame guide](https://runware.ai/docs/models/prunaai-p-video-2-pro/guides/first-and-last-frame).

### Langtest mit zwei Iterationen und First-Last-Frames

```sh
RUN="eu-reski-news/GENERATIONS/news/p-video-2-pro-cost-10-20261023-001/run-001"
export DAILYDOASE_ENV_FILE="/Users/eggermann/Projekte/dailydoase/.env"
npm run news:glue-scenes -- --run="$RUN" --iterations=2 \
  --duration-pattern=9,5,7,5,8 --frame-offset-seconds=0.25 \
  --transition-wait-pattern=4,1,2,1,3,1,2,1 \
  --output-dir="$RUN/glue-vids-long" --concurrency=4
npm run news:assemble-film -- --run-dir="$RUN" \
  --scene-glue-dir="$RUN/glue-vids-long" --limit=2 --fade-seconds=0.25 \
  --frame-offset-seconds=0.25 --transition-wait-pattern=4,1,2,1,3,1,2,1 \
  --output="$RUN/glue-vids-long/eu-reski-iterations-001-002-long-pattern-fade-025.mp4"
```

Das `Taktmuster.getNext()` zählt Szenen ohne Glue über den ganzen Lauf; Iterationsgrenzen setzen Zähler und Muster nicht zurück. Die ersten Grenzen in einer ausreichend langen Iteration sind `4→5`, `5→6`, `8→9`. Hat Iteration 1 drei Szenen, zählt Iteration 2 ab Szene 1 weiter. Eine fällige Brücke genau an einer Iterationsgrenze wird ausgelassen und der Taktmuster-Strom rückt weiter; sie wird nicht aufgeschoben. Der separate Dauer-`getNext()`-Strom vergibt Dauern nur an tatsächlich ausgewählte Brücken.

Jede Brücke beginnt mit dem Bild bei `Ende − 0,25 s` und endet beim Bild `Start + 0,25 s`. Montage schneidet diese 0,25 s an beiden benachbarten Szenenclips ab, damit Quellclips und Brücke keine doppelten Frames enthalten. `--fade-seconds=0.25` blendet die verbleibenden Clipkanten gleichmäßig mit FFmpeg ein. `glue-run.json`, `film-order.txt` und der gespeicherte Filtergraph dokumentieren Muster und Reihenfolge.

Eine Alternative ist `--bridge-limit=2` ohne `--transition-wait-pattern`; sie wählt die zwei längsten generierten Brücken. Beide Auswahlarten können nicht kombiniert werden.

```sh
npm run news:assemble-film -- --run-dir="$RUN" \
  --scene-glue-dir="$RUN/glue-vids-long" --limit=2 \
  --bridge-limit=2 --fade-seconds=0.25 \
  --output="$RUN/glue-vids-long/eu-reski-iterations-001-002-two-bridges-fade-025.mp4"
```

`--bridge-limit=2` wählt längste Brücken, bei Gleichstand zuerst chronologisch. Auswahl steht in der zum Film benannten `*.assembly.json`; Reihenfolge und Filtergraph haben ebenfalls filmbezogene Dateinamen und überschreiben andere Montageversionen nicht.

### Künstlerischer Auto-Modus: zehn Iterationen

`generation.autoMode` ist standardmäßig `false`. Für zehn Ausstellungsiterationen `--auto-mode` aktiviert pro neuem Artikel eine strukturierte Regieentscheidung vor der Storyplanung. Jede Entscheidung steht in `iteration-NNN/auto-decisions.json`; beim Resume wird sie wiederverwendet. Manuelle technische Werte wie Provider, Modelle, Auflösung, Kostenmodus, Quellen, Szenenzahl/-dauer und Montage bleiben aus der Run-Konfiguration erhalten. Das Szenenvideomodell bleibt auf ausführbarem `image_to_video`.

Zusätzliche automatische Auswahl: `videoMaxZoom` (0–0,3). Stil-/Figuren-/Ortsreferenzpfade, Dialogsperre, Titelkarten sowie das Ein-/Ausschalten der Mediengenerierung bleiben manuell, weil sie Teil der Referenzpolitik, Sprachvorgabe, Kostenentscheidung oder des Betriebs sind.

Der vorbereitete Befehl lautet:

```sh
npm run news:auto-10
```

Der Starthelfer lädt standardmäßig `.env` aus dem Haupt-Repository; alternativ kann `NEWS_ENV_FILE` explizit gesetzt werden. Der Befehl startet die bestehende Exhibition-Pipeline mit zehn Iterationen; die aktuelle Standardkonfiguration erzeugt Bilder und Szenenvideos.

#### Live-Referenzlauf und Resume

Der ausgeführte Referenzfilm liegt lokal unter `eu-reski-news/GENERATIONS/news/exhibition/run-001/glue-vids/eu-reski-live-full.mp4`. `run-001/run.json` und `run-001/glue-vids/glue-run.json` enthalten Laufparameter, Provider-Task-IDs und Glue-Fortschritt. Der Glue-Film ist aktuell bis Iteration 7 gebaut; Iteration 8 und 9 haben vier offene Videotasks. Auf derselben Installation setzt `npm run news:auto-10` diesen Lauf über den gespeicherten Runner-Zustand fort, pollt offene IDs und ergänzt Glue nach jeder vollständig fertigen Iteration. Generierte Medien und Provider-Logs liegen im gitignored `GENERATIONS/`-Ordner und sind nicht Teil des Commits.
