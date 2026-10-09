# Automatic EU news scene generation

`Article + article photo + semantic-stream fragments + Guernica catalog → GPT scene plan → Seedream first frames → HTML audit report`.

The generator writes every image prompt through a multimodal GPT API request. No article-specific scene prompt is hard-coded. The versioned authoring instructions in `director.md` preserve the accepted dark material treatment and physical integration of characters. The selected figure is redrawn in the new space rather than pasted into a photograph.

## Run

From the repository root, with Node 22+ and dependencies installed:

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
5. Each still is saved at the requested 1680×944 resolution. No video or sound API calls occur.

## Recurring crocodile

Director version 2 requires our fictional Guernica-style crocodile in at least one scene per iteration. Its long angular snout, jagged back, short legs, black/ivory planes and single worn-gold scale remain recognizable across stories. GPT derives its role and placement from the article and semantic stream, records them in `crocodileAppearance`, and describes it in the final image prompt. The validator rejects plans with no crocodile appearance; the HTML shows its planned role. The crocodile is an original character, not a figure in Picasso's original painting. Existing saved iterations retain their original plans and images.

## Audit and recovery

Every iteration includes `record.json`, `semantic-stream.json`, the exact `director.md` snapshot and SHA-256, sanitized `gpt-request.json` with local image paths, raw GPT response, `scene-plan.json`, image requests/responses, local reference images, generated first frames and a static `index.html`. The report works directly from a file URL. GPT token usage and provider-reported image costs are shown separately.

API responses are saved before download or validation. Resume uses the saved response instead of paying for a second generation if a download failed. If the process stops during an API call, the `*-pending.json` marker blocks automatic repetition. Check the provider history and recover the response before retrying; do not blindly delete the marker. API refusals/errors also remain saved for inspection. There is no automatic paid retry loop or manual-prompt fallback.

Source article text is untrusted data. The scene plan separates article claims, visual observations and invented metaphors. Model output quality and the strength of semantic associations still vary; the report exposes those decisions for review.

Implementation references: [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [vision inputs](https://developers.openai.com/api/docs/guides/images-vision).

## Recorded live run

`iteration-009` selected a Latvian storm warning from the 2026-10-09 aggregate. Live stream fragments were Italien, Member state of the European Union, and Франция. GPT selected figure 6 and created the final coastal image prompt. That exact prompt produced one Seedream still, with a provider-reported image cost of $0.01926 and 7,351 GPT tokens (billed separately). The image was inspected: the figure is redrawn in the coastal scene; the requested raised-arm gesture was not preserved. Prompt adherence and artistic quality remain reviewable in the HTML.
