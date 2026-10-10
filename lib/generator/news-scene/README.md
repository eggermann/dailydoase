# Automatic EU news scene generation

`Article + article photo + semantic-stream fragments + Guernica catalog → GPT scene plan → Seedream first frames → HTML audit report`.

The generator writes every image prompt through a multimodal GPT API request. No article-specific scene prompt is hard-coded. The versioned authoring instructions in `director.md` preserve the accepted dark material treatment and physical integration of characters. The selected figure is redrawn in the new space rather than pasted into a photograph.

## Run

From the repository root, with Node 22+ and dependencies installed:

```sh
npm run news:story
```

This CLI command creates a random-article iteration with three scenes, generates one still for each scene, and prints the `index.html` path when done. Open that file to review the article, semantic decisions, prompts and images.

For the next Codex turn, use this instruction: “Run `npm run news:story`, open the generated HTML, and review the three start images. Keep the image-only API workflow, strong abstract Guernica-style painting, article-grounded story, meaningful relevant semantic motifs, and optional crocodile. Do not commit generated images or secrets.”

The three-scene command can be narrowed without changing the npm script:

```sh
npm run news:story -- --scenes=1
```

For direct control of flags and resume behavior, use the Node command below.

```sh
node --env-file=.env scripts/run-news-scene-image-iteration.mjs
```

Requires `OPENAI_API_KEY`, `RUNWARE_API_KEY` (or `RUNWARE_KEY`), a saved `news-capitals/all-*.json` collection, and the Guernica PNG catalog. `GUERNICA_DIRECTORY` or `--guernica-dir=/path` overrides the local asset directory. `NEWS_STORY_MODEL` overrides `gpt-4.1-mini`; the replacement must support vision, Chat Completions structured output and the supplied sampling parameters.

Default: newest saved aggregate by filename, random article with text and an image, live semantic-stream seeds `EU/de`, `EU/en`, `EU/ru`, three scenes and one Seedream 5.0 Flash still per scene. A saved collection may be older than today; the report records its exact path, hash and article date. The generator does not fetch fresh news.

```sh
# One scene / one image for a small iteration
node --env-file=.env scripts/run-news-scene-image-iteration.mjs --scenes=1

# Different semantic seeds (comma-separated words use German)
node --env-file=.env scripts/run-news-scene-image-iteration.mjs --words=EU,Frieden,Erinnerung

# Multilingual seeds file: [["EU","de"],["Europe","en"],["Европа","ru"]]
node --env-file=.env scripts/run-news-scene-image-iteration.mjs --words-file=words.json

# Generate GPT prompts and HTML first, with no image API calls
node --env-file=.env scripts/run-news-scene-image-iteration.mjs --prompt-only

# Continue that exact iteration, retaining article, semantic snapshot and GPT plan
node --env-file=.env scripts/run-news-scene-image-iteration.mjs --resume=/absolute/path/to/iteration-008
```

`--news-dir` selects another collection directory. `--stream-module` (or `NEWS_SEMANTIC_STREAM_MODULE`) can select the absolute entry point of an existing semantic-stream installation for a worktree without node_modules. Use the current semantic-stream package (3.0.5 was used for the live example). The package handles sequential Wikipedia requests and throttling.

`--stream-file=snapshot.json` accepts a saved `semantic-stream.json` from this generator (entries with unique `id`, `seed: [word, language]`, and `item.title`). This replays source fragments without another Wikipedia request; it does not replace them with an invented word list.

## What is automatic

1. A random eligible article is drawn from the newest saved aggregate.
2. `semantic-stream.initStreams` initializes each configured seed. `getNext()` supplies a real linked fragment, including its surrounding sentences when available.
3. GPT sees the article, photograph, stream snapshot, all catalog descriptions and all nine figure images. It explains the semantic associations and selects one Guernica figure for each scene.
4. GPT returns a strict JSON plan. Each `stillPrompt` is handed to Seedream unchanged. Image reference 1 is always the news photo; reference 2 is always that scene's selected catalog figure.
Image references are resized proportionally with `sharp` when needed to satisfy Runware’s 128–2048 pixel limits. Extreme aspect ratios receive transparent padding. Original files remain unchanged; API copies, hashes and paths are logged.

5. Each still is saved at the requested 1680×944 resolution. No video or sound API calls occur.

## Visual style, semantic influence and crocodile

Director version 4 requires strongly abstracted hand-painted Guernica-inspired imagery. Human faces, bodies and objects must not look photographic; the image reference supplies broad composition only. GPT must omit recognizable identities, crests, logos, brands and legible lettering. It chooses relevant semantic fragments, gives each a distinctive motif, assigns scenes, and repeats that motif verbatim in the still prompt. Irrelevant fragments get a reason and do not get pasted into a scene. The validator checks relevance decisions and ensures each selected motif appears in its assigned prompt. The crocodile is optional: include the original recurring character only if it makes sense as a visible metaphor; it is never forced as decoration. Its long angular snout, jagged back, short legs, fractured charcoal/ivory planes and one worn-gold scale keep it recognizable when chosen. It is not a figure in Picasso's original painting. Existing saved image files remain as generated; HTML can attach a visual review.

The director now requires all scenes to use the same degree of facial and anatomical abstraction, palette, pigment grain and brushstroke scale. The director supplies a shared style paragraph for GPT to repeat verbatim in every still prompt. Faces, hands and clothing must be built from the same broken painted planes as the environment; selecting a different catalog figure must not produce a more naturalistic portrait. GPT is instructed to compare scene prompts before returning the plan. This guides the image model; visual consistency still requires inspecting the generated images.

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
