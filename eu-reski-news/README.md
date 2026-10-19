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

`Article + article photo + semantic-stream fragments + masked character catalog → GPT story and protagonist choice → FLUX Klein first frames (selected figure for protagonist identity; full painting for style) → cumulative HTML audit report`.

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

Requires `OPENAI_API_KEY`, `RUNWARE_API_KEY` (or `RUNWARE_KEY`), a saved `eu-reski-news/news/A/all-*.json` collection, the full-painting style reference, and the masked figure catalog. `--style-reference=PATH` selects the style image. `GUERNICA_DIRECTORY` or `--guernica-dir=PATH` selects the masked figure catalog. `--news-dir=PATH` selects another article collection. `NEWS_STORY_MODEL` overrides `gpt-4.1-mini`; the replacement must support vision, Chat Completions structured output and the supplied sampling parameters.

For the separate Hugging Face adapter, set `HF_TOKEN` in `.env`, then run `npm run news:story -- --image-provider=hf-flux-klein`. It uses the Space's `/generate` endpoint, distilled 16-step mode, 1680×944 output, selected figure reference and, by default, full-painting style reference. Add `--no-style-reference` to send only the selected figure crop. Runware remains unchanged and default. Hugging Face ZeroGPU consumes account GPU quota or prepaid credits; the Space does not report per-image GPU seconds, so exact per-image dollar cost is not recorded. Do not commit `.env` or tokens.

Default: newest saved aggregate by filename in `news/A`, linear article order with text and an image, live semantic-stream seeds `EU/de`, `EU/en`, `EU/ru`, three scenes and one still per scene. Set `--scenes=7` for seven scenes. One Taktmuster rhythm instance stays alive for the whole process, advancing once per scene across iteration boundaries. Default balanced takt is 3 with a 3.5 multiplier; durations are rounded and clamped to 5–15 seconds. The news starter defaults to one run; set `NEWS_MAX_ITERATIONS=0` or `-1` for an endless run. A saved collection may be older than today; the report records its exact path, hash and article date. The generator does not fetch fresh news.

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

5. Each still is saved at 1680×944. GPT writes one `videoPrompt` per scene into the same iteration. `film-plan.json` exposes `videoPrompt`, `durationSeconds`, and `startImagePath`; use that image as the image-to-video input and the prompt as its motion direction. This prepares film generation without calling a video API. Prompts animate only their own scene: the current plan does not capture a clip's final frame or chain it into the next scene. For true visual continuity, the film runner must capture each last frame and use it as the next clip's input.

Scene durations use the persistent Taktmuster stream: `round(patternValue × multiplier + bias)`, clamped to the configured minimum and maximum. Defaults now follow Selfomat's gentler 1.15 multiplier, with a 3.85-second bias to retain some variation above the 5-second minimum; the maximum is 8 seconds. Override with `NEWS_SCENE_LENGTH_MULTIPLIER`, `NEWS_SCENE_LENGTH_BIAS`, `NEWS_MIN_SCENE_DURATION_SECONDS`, and `NEWS_MAX_SCENE_DURATION_SECONDS`, or the matching CLI flags.

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
