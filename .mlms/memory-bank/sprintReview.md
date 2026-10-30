# Sprint Review
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

## Loop 1 Review
### What Changed
- Diagnosed failed autostart and relieved Firefox process exhaustion.
### Acceptance Criteria Result
- [x] Mini reachable and screen sharing opened.
- [ ] Fresh generated film visible and playing.
### Verification Result
- Launch agent exited with EPERM; player status recovered after Firefox exited.
### Issues / Gaps
- Generator still needs a successful start and output verification.
### User Demo Notes
- Screen sharing shows the exhibition player.
## Loop 1 Retrospective
### What Worked
- SSH and process inspection located the startup failure and resource exhaustion.
### What Was Confusing
- Volume access may depend on process launch context.
### What To Improve Next Loop
- Test the existing player start path and inspect its actual result.
### Process Decision
- Continue.

## Loop 2 Review
### What Changed
- Resumed the saved campaign with the equivalent original `10h` spelling; kept the configured 3-minute pacing.
- Player now reports 11 active runs and a new iteration in run-015.
### Acceptance Criteria Result
- [x] Existing workers resume without changing stored scene settings.
- [ ] New iteration completed and confirmed playing.
### Verification Result
- Player status reports the generator running; run-015 iteration-004 has selected a news article and started planning.
- Video provider requests encounter temporary credit reservation errors.
### Issues / Gaps
- Player start and reboot autostart currently fail without specifying `10h`; saved `10h` and configured `600m` compare unequal.
- No fresh film verified yet.
### User Demo Notes
- Player is visible through screen sharing.
## Loop 2 Retrospective
### What Worked
- Explicit equivalent duration restored the saved run without modifying it.
### What Was Confusing
- Matching compares duration spelling instead of equivalent duration.
### What To Improve Next Loop
- Monitor the current iteration and provider status; preserve paid task IDs.
### Process Decision
- Continue.

## Loop 3 Review
### What Changed
- Prepared a local resume compatibility fix for equivalent interval spellings and a real offline resume test.
### Acceptance Criteria Result
- [x] Same duration preserves saved plan; different duration and bias remain rejected.
- [x] Focused startup, resume, and sequence tests pass.
- [ ] New generated film visible and playing.
### Verification Result
- Eight tests passed; diff reviewed and whitespace check clean.
- Five scene images generated in run-015 iteration-004; video work has not completed.
### Issues / Gaps
- Local compatibility fix has not been committed or deployed; permission is needed under skill rules.
- Runware video credit reservation retries continue for old work.
### User Demo Notes
- Kiosk player reports 11 running worker paths.
## Loop 3 Retrospective
### What Worked
- A low-risk equivalent-duration fix preserves saved fingerprints.
### What Was Confusing
- Stored and current duration strings represented the same value.
### What To Improve Next Loop
- Verify actual film and user-visible playback before proposing deployment.
### Process Decision
- Continue.

## Loop 4 Review
### What Changed
- The first new iteration was generated and selected in the player.
### Acceptance Criteria Result
- [x] Fresh film exists with five generated scene videos and title card.
- [x] Player automatically listed the film and played it after selection.
- [x] Existing generator is running; no duplicate supervisor started.
### Verification Result
- run-015/iteration-004: 5 scene videos, assembled film and audio-normalized title version.
- Player video element showed the run-015 iteration-004 URL, paused=false, currentTime > 0.
- Eight focused offline tests and diff check passed for the prepared restart fix.
### Issues / Gaps
- Saved 10h vs configured 600m prevents a normal start without an explicit 10h argument; local fix is tested but not deployed.
- Video provider has previously rejected old work due to credit reservations.
### User Demo Notes
- Player entry 20: iteration-004-with-title-card-audio-normalized.mp4; article Die drei Perlen der Ostsee.
## Loop 4 Retrospective
### What Worked
- Restoring the saved schedule spelling preserved the worker state and produced a new film.
- Patient provider polling avoided duplicating uncertain tasks.
### What Was Confusing
- The display briefly showed stale media counts while normalization ran.
### What To Improve Next Loop
- Apply the prepared equivalent-duration fix after authorization so ordinary restart works.
### Process Decision
- Goal complete; proposed restart fix awaits approval.
