# Sprint Review
## Loop 1 Review — Artistic Auto-Mode
### What Changed
- Added default-off `generation.autoMode`, CLI overrides, and `npm run news:auto-10`.
- Added a compact structured auto-director using the configured Story model. It chooses existing creative features before Story planning and saves selected/effective settings to `auto-decisions.json`.
- Added constraints for legacy prompt interactions, video vision dependency, fixed no-dialogue policy, and executable `image_to_video`; decisions are isolated per iteration and reused on resume.
- Documented the exact ten-iteration command and exposed decision JSON in the iteration report.

### Acceptance Criteria Result
- [x] Auto mode defaults off and can be enabled through configuration or CLI.
- [x] Selected and effective flags are validated and saved per iteration.
- [x] Saved decisions are reused; missing/corrupt/mismatched resume state fails safely.
- [x] Fixed technical/media controls remain outside director selection.
- [x] Implementation tests used mocks; later live generation ran only after direct user authorization.
- [x] Pending video tasks remain checkpointed; First/Last-Frame glue is built incrementally after complete iterations.

### Verification Result
- Focused Jest suite: 6 tests passed.
- `node --check` on changed JavaScript modules, JSON parsing, CLI help smoke checks, and `git diff --check` passed.
- `npm test -- ...` could not run because this worktree has no local `cross-env`; the focused test suite ran with the available global Jest binary.

### Issues / Gaps
- Live reference film: `eu-reski-news/GENERATIONS/news/exhibition/run-001/glue-vids/eu-reski-live-full.mp4`. Seven iterations glued; iterations 8/9 still have four video tasks pending.
- No webpack build was needed for script/config-only changes.

### User Demo Notes
- Review the exact command in `eu-reski-news/README.md`: `npm run news:auto-10`.

## Loop 1 Retrospective
### What Worked
- Inserting the director after article selection and before Story planning reused the existing pipeline with a small component.
- Selected/effective flags make legacy prompt effects and resume behavior inspectable.

### What Was Confusing
- Existing `.mlms` described a prior unrelated goal; its earlier brief remains preserved as `projectBrief.previous.md`.
- The worktree has no `.env`, while the wrapper resolves the main repository `.env` automatically.

### What To Improve Next Loop
- Resume same run using `npm run news:auto-10`; preserve existing task IDs and generated media.

### Process Decision
- Stop polling after bounded windows; persist pending state for safe resume.

## P-Video Cost Run Review
### What Changed
- Added P-Video-2-Pro image-to-video requests with first frame, 480p, `settings.mode=cost`, and 5–6 second durations.
- Added sequential video generation after each image iteration, per-iteration FFmpeg concat, and per-clip/aggregate cost reporting.
- Generated ten distinct article stories with 5 scenes each; all 50 requested videos and ten merged films are present.
### Acceptance Criteria Result
- [x] Ten linear iterations, each with five images and GPT prompts.
- [x] Ten unique articles and 30 unique semantic-stream fragments.
- [x] Fifty P-Video-2-Pro clips in 480p cost mode, each 5–6 seconds and started from the matching image.
- [x] Ten FFmpeg merged films and cumulative HTML report.
- [x] Runware costs recorded per clip: $0.0517/5 s and $0.0658/6 s; total video $2.9375, image $0.963, media $3.9005.
### Verification
- [x] All 50 image/video files and 10 merged files exist and are non-empty.
- [x] Request settings, durations, frame role, scene counts, HTML content, and secret absence checked.
- [x] `node --check` on changed JavaScript modules and `git diff --check` passed.
### Output
- Open `eu-reski-news/GENERATIONS/news/p-video-2-pro-cost-10-20261023-001/run-001/index.html`.

## Loop 3 Review
### What Changed
- Generated a new three-scene iteration using Runware FLUX.2 Klein 9B API (`runware:400@2`).
- Used article + Guernica references for scene 1, then only the preceding still for scenes 2 and 3.
- Saved three 832×480 stills, sanitized per-scene request/response logs, and a dedicated HTML report.
### Acceptance Criteria Result
- [x] All three scene stills generated via API.
- [x] Previous image used for visual continuity in scenes 2 and 3.
- [x] No video API requests.
- [x] HTML displays all images and detailed per-scene logs.
- [x] Runware cost captured: $0.00078 each, $0.00234 total.
### Verification Result
- Confirmed all three image files exist, HTML references each image, and no API key is present in saved record data.
- Visually inspected the three images for composition and crocodile continuity.
### Issues / Gaps
- No open issues.
### User Demo Notes
- Open `news-capitals/generations/iteration-002/index.html` in the `eu-capital-news` worktree.

## Loop 2 Review
### What Changed
- Used the user-provided key for Runware imageInference API calls and generated all three scene stills.
- Updated the HTML and record with per-scene image paths, prompts, references, costs, task IDs, and hashes.
- No video API calls were made.
### Acceptance Criteria Result
- [x] No video API requests were made.
- [x] Scene-2 failed API response was saved without credentials.
- [x] Scene 1, scene 2, and scene 3 starting stills generated through Runware API.
- [x] HTML updated to show a starting still for every scene.
### Verification Result
- Verified all three JPEG files exist and each image is referenced once in HTML.
- Runware reported per-scene costs of $0.18, $0.24, and $0.24 ($0.66 total).
- Confirmed no Runware API key was written to records.
### Issues / Gaps
- No open issues for the requested image-only iteration.
### User Demo Notes
- Existing iteration page: `news-capitals/generations/iteration-001/index.html` in the `eu-capital-news` worktree.

## Loop 2 Retrospective
### What Worked
- The API key supplied by the user succeeded; resizing the small Guernica reference to 256 × 323 met Runware's minimum input width.
### What Was Confusing
- Existing `.env` key was linked to an account context without credits, unlike the funded browser account.
### What To Improve Next Loop
- Check reference image dimensions before sending imageInference requests.
### Process Decision
- Complete; keep future image iterations API-only unless the user changes direction.

## Loop 1 Review
### What Changed
- Added `news:story:first-image` and a self-contained Node runner to select a random image-bearing story from the newest aggregate, call GPT vision/story planning, and log the complete process.
- Generated a first-scene crocodile keyframe with the article photo and Guernica bull mask as visual references.
- Created a static HTML review page with the article, source image, generated still, vision analysis, three scenes, H3 prompts, audio decisions, and provider logs.
### Acceptance Criteria Result
- [x] Random article selected from the newest EU-news JSON and its photo saved.
- [x] GPT vision/story response contains three scenes, all at 5 seconds, with audio decisions and H3-ready prompts.
- [x] First-scene still generated and shown in HTML.
- [x] Request/response logs, image paths, reference hashes, and provider failure are recorded without API secrets.
- [x] HTML and output assets verified.
- [ ] Runware image generation succeeded; it failed with HTTP 400 insufficient credits, so Codex image_gen produced the still instead.
### Verification Result
- `node --check scripts/run-news-scene-image-iteration.mjs` passed.
- `git diff --check` passed.
- Artifact assertions passed: 1,672 × 941 PNG, three scene cards, all scene durations ≥5 seconds, HTML image references resolve, no scripts, no secrets.
- Full Jest suite not run because the isolated worktree has no `node_modules`; no focused automated test exists for this one-off runner.
### Issues / Gaps
- ImageGen did not report cost in returned metadata.
- H3 video/audio generation and keyframes for scenes 2–3 remain future work.
### User Demo Notes
- Open `news-capitals/generations/iteration-001/index.html` in the `eu-capital-news` worktree.

## Loop 1 Retrospective
### What Worked
- Random selection and source-photo analysis grounded the story in an actual article image.
- The article photo was correctly labeled as an illustrative press image, not proof of the ICC event.
- Static HTML makes the image and full prompt trail reviewable without JavaScript.
### What Was Confusing
- The user said “480 dpi”; the provided H3 guide means the 480p video resolution preset, while the still image has its own pixel dimensions.
- Runware had no credits, so the generated image came from Codex image_gen.
### What To Improve Next Loop
- Generate keyframes for the remaining scenes only after the user reviews the first image.
- Check provider wallet/quota before launching paid video.
### Process Decision
- Complete this first still-image iteration and wait for the user's next direction.
