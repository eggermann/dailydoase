# Sprint Review

## Loop 7 Review — Remote No-Fallback CANK Deploy

### What Changed

- Reduced the CANK launcher to the shared base trailer stack plus live-folder settings.
- Synced the cleaned launcher and deploy helpers to the remote mini.
- Restarted the remote trailer runner so the next cycle uses the updated launcher.

### Acceptance Criteria Result

- [x] CANK wrapper no longer overrides image/video provider selection.
- [x] Remote mini has the new launcher and deploy helpers.
- [x] Remote trailer process was restarted.
- [ ] Live semantic-stream generation is still blocked by real Wikipedia `429` responses.

### Verification Result

- Local `zsh -n` passed for both trailer launchers.
- Local `node --check` passed for the new deploy helpers and the modified runtime files.
- Remote process now shows the cleaned launcher path and the real `429` failure in the live log.

### Process Decision

- Stop for now: the deploy is aligned with the local no-fallback stack, and the remaining issue is real upstream rate limiting.

## Loop 4 Review â English Semantic Trailer

### What Changed

- Hardened FLUX and WAN prompt boundaries to replace source-language anchor and collision terms with their saved English translations.
- Kept source-language cue identity untouched in the canonical plan and validator.
- Added regression coverage for selected FLUX prompts, selected WAN prompts, compacted FLUX prompts, and non-compacted FLUX prompts.

### Acceptance Criteria Result

- [x] Six fresh Semantic Stream cues are saved with exact source-language identity.
- [x] Each plan entry has English prompt terms.
- [x] Actual FLUX payload inspection shows `department store` and `operational mode` instead of `Kaufhaus` and `Betriebsform` for scene one.
- [x] Six WAN clips and a collision-cut, end-card trailer exist.
- [x] Semantic validation has zero errors for all scenes.
- [ ] Audio is absent because Mirelo and its Runware fallback reject local final-video input.

### Verification Result

- 111 focused tests pass; Node syntax and `git diff --check` pass.
- Final file is H.264, 448x336, 17.428571 seconds.
- All six scene reports are valid; one non-blocking propagation warning remains in scene five.

### Process Decision

- Stop: trailer iteration and translation verification complete. Do not commit without explicit user request.

## Loop 3 Review â Translate Semantic Terms for Prompts

### What Changed

- Added strict English translation fields beside immutable source-language cue fields.
- Required production-facing planner prose to be English.
- Updated FLUX prompt construction, oversized-prompt compaction, image summaries, and sanitization preservation.

### Acceptance Criteria Result

- [x] Original Semantic Stream words remain exact for identity validation.
- [x] Non-English words have explicit English prompt terms.
- [x] Production FLUX prompts prefer English terms.
- [x] Legacy plans fall back to original terms.
- [x] No extra `getNext()` or translation API call is introduced.

### Verification Result

- 108 focused tests pass.
- Webpack, syntax checks, and `git diff --check` pass.

## Loop 3 Retrospective â Translate Semantic Terms for Prompts

### What Worked

- Translation fits into the existing structured planner response without another provider round trip.

### What To Improve Next Loop

- Inspect translations in the next normal live generation artifact.

### Process Decision

- Stop: requested prompt-language behavior is implemented and green.

## Loop 2 Review â Finish Hard Semantic Enforcement

### What Changed

- Extended the existing validator instead of creating a parallel path.
- Added the complete report contract, layered textual derivation, decorative-use rejection, generic tension rejection, source-bound clues, absent-monster evidence, unique consequence IDs, and strict inheritance checks.
- Added exported targeted scene repair with immutable cue identity.
- Propagated visible agency into real FLUX/WAN builders and complete image-only summaries.
- Proved runtime defaults and camera sanitization preserve every new semantic field.
- Added collision-only strict mode, provider-safe FLUX compaction, retry-summary merging, explicit-plan image resume, and a green plan-only two-video entry point.

### Acceptance Criteria Result

- [x] One clearly named semantic validation function returns the complete contract.
- [x] Derivation, tension cause, consequence IDs, clue source, and absent agency are mandatory and validated.
- [x] Decorative semantics and atmosphere-only tension are rejected.
- [x] Repairs are scene-local, preserve exact cues, and never call `getNext()`.
- [x] FLUX/WAN propagation is tested against actual production builders.
- [x] Semantic fields survive defaults, sanitization, duration adjustment, and summaries.
- [x] Strict collision mode aborts after failed repairs.
- [x] Two-round image-only and two-video plan integrations pass.

### Verification Result

- 105 focused tests pass.
- Webpack build, Node/zsh syntax, and `git diff --check` pass.
- Full Jest retains the unrelated existing `camera-prompt-chain.mock-video.test.js` failure and async teardown issue.
- Folder `729-semantic-hard-enforcement-two-rounds` contains four decodable 1184x880 PNGs, two complete summaries, and a valid strict report.
- Two-video plan check confirms scene 2 uses `Betriebsform`, inherits scene 1's ID/state, and includes all required WAN semantic parts.

### Issues / Gaps

- Mirelo audio fallback remains separate and unresolved.
- Generated media remains untracked.

### User Demo Notes

- Live integration: `GENRATIONS-KAUFHAUF/729-semantic-hard-enforcement-two-rounds/`.
- Round summaries: `parts/image-only-scenes/run-01-summary.json` and `run-02-summary.json`.

## Loop 2 Retrospective â Finish Hard Semantic Enforcement

### What Worked

- Real-plan replay caught physical-verb and plural-normalization false negatives before shipping.
- Strict mode exposed one actual repair path and prevented generic fallback.
- Explicit saved-plan resume preserved term-consumption integrity during provider retry.

### What Was Confusing

- Zero polling disables the second image-only round even when run count is two.
- Provider processes retain open handles after successful generation and need explicit terminal interruption.

### What To Improve Next Loop

- Add automatic retry for transient image provider `fetch failed` responses.
- Separate provider network retries from semantic planning/repair logs.

### Process Decision

- Stop: goal satisfied; checks and live integrations are green. Await commit permission.

## Loop 1 Plan â Mandatory Semantic Story Engine

### Acceptance Criteria

- [ ] Structured records preserve every anchor and collision losslessly.
- [ ] Each selected stream's `getNext()` runs exactly once per assigned scene.
- [ ] Planner receives both records and compatibility strings.
- [ ] Hard validation covers causal physicalization, monster agency, clues, tension, consequence inheritance, and production prompts.
- [ ] Invalid entries receive targeted repair before strict failure or marked legacy fallback.
- [ ] Required debug artifacts and extended image-only summaries are saved.
- [ ] Focused tests pass and diff review finds no independent story path.

### Proposed Slices

1. Structured semantic baton.
2. Mandatory schema and causal validator.
3. Targeted repair and runtime wiring.
4. Artifact and FLUX/WAN propagation verification.

## Loop 1 Review â Mandatory Semantic Story Engine

### What Changed

- Structured Semantic Stream records are canonical; legacy strings serialize from them.
- Planner schema now requires the complete semantic cause, monster agency, consequence, clue, tension, continuity, and derivation chain.
- Validation rejects decorative use, unsupported absence, unrelated clues/tension, broken consequence IDs, and missing production-prompt propagation.
- Invalid entries receive two targeted repair attempts with cue, errors, and neighboring scenes before strict abort.
- Runtime saves source records, raw plan, validated plan, and per-scene validation report.
- FLUX and WAN prompt assembly share the physical semantic core in model-specific order.

### Acceptance Criteria Result

- [x] Structured records preserve every anchor and collision losslessly.
- [x] Each selected stream's `getNext()` runs exactly once per assigned scene.
- [x] Planner receives both records and compatibility strings.
- [x] Hard validation covers causal physicalization, monster agency, clues, tension, consequence inheritance, and production prompts.
- [x] Invalid entries receive targeted repair before strict failure.
- [x] Required debug artifact writers and extended image-only summaries are implemented.
- [x] Focused tests pass and diff review finds no independent planner prompt path.
- [ ] Two-round live image-only integration passes.
- [ ] Cheap two-clip continuity preview passes with the validated plan.

### Verification Result

- 36 focused semantic/planner/prompt tests passed.
- 84 Shorty-Book tests passed.
- Webpack compiled successfully.
- Syntax checks and `git diff --check` passed.
- Full Jest reached one unrelated existing mock camera-prompt expectation failure.
- Live run 724 stopped during Semantic Stream article setup and produced only `info.json`.

### Issues / Gaps

- Semantic Stream provider did not reach cue generation, so no live planner, FLUX, WAN, or semantic debug artifact could be inspected.

### User Demo Notes

- Blocked run folder: `GENRATIONS-KAUFHAUF/724-semantic-story-engine-image-only-test`.

## Loop 1 Retrospective â Mandatory Semantic Story Engine

### What Worked

- Canonical structured records removed regex dependence without breaking legacy cue strings.
- Validator and prompt tests make causal requirements executable rather than advisory.
- Custom camera planner prompts can no longer bypass semantic priority.

### What Was Confusing

- Existing runner exits cleanly during Semantic Stream setup without surfacing a useful terminal error.

### What To Improve Next Loop

- Preserve Semantic Stream setup failures as explicit run artifacts before retrying provider-backed integration.

### Process Decision

- Stop: implementation and local checks are green; live integration is blocked before the changed planner path.

## Loop 6 Review — CANK Trailer Deploy

### What Changed

- Reversed CANK copy ordering so newest generated trailers sort first in the live folder.
- Added a continuous CANK sync loop that polls `GENRATIONS-KAUFHAUF` and refreshes `lib/GENERATIONS/CANK` when new merged outputs appear.
- Added a CANK-trailer launcher that keeps semantic stream and taktmuster continuous with a ~14h polling interval.
- Captured a live browser screenshot of `https://dailydoase.de/v/CANK`.

### Acceptance Criteria Result

- [x] CANK live folder exists and is refreshed newest-first.
- [x] Continuous sync script exists.
- [x] Continuous trailer launcher exists.
- [x] Live page screenshot captured.
- [x] Memory bank updated.

### Verification Result

- `zsh -n` passed for both new shell launchers.
- `node -c` passed for `deploy/copy-merged-to-cank.cjs` and `deploy/cank-trailer-sync-loop.cjs`.
- `node deploy/copy-merged-to-cank.cjs` refreshed `lib/GENERATIONS/CANK`.
- Browser screenshot saved as `.mlms/cank-live-page.png`.

### Issues / Gaps

- The continuous generator/sync loop is prepared but not left running in this turn.
- Live folder refresh may still need a server cache restart depending on deployment state.

### User Demo Notes

- Live page title: `DailyDoase`.
- Sidebar now shows `CANK`.
- Screenshot path: `.mlms/cank-live-page.png`.

## Loop 6 Retrospective

### What Worked

- The existing copy script was enough to implement newest-first ordering cleanly.
- Playwright via installed Chrome was enough to verify the live page without extra dependencies.

### What Was Confusing

- The first screenshot attempt failed because Playwright had no downloaded browser binary.

### What To Improve Next Loop

- If the live server caches folder listings, add an explicit restart or cache-bust step to the deploy script.

### Process Decision

- Continue. The deploy path is ready; next step is optional long-running execution on the target host.

## Loop 1 Plan â Fresh Sound Iteration

### Acceptance Criteria

- [ ] A new Semantic Stream plan is saved in a new generation folder.
- [ ] Every WAN scene duration is a whole number of seconds.
- [ ] Scene prompts enforce forward-only camera movement.
- [ ] A collision-cut concat and compact exhibition end card exist.
- [ ] Mirelo makes one final sound attempt; visual output survives failure.

## Loop 1 Review â Fresh Sound Iteration

### What Changed

- Promoted collision cuts and a continuous forward dolly from the test-resume runner into the normal trailer runtime.

## Loop 6 Review â Live Folder Verification

### What Changed

- Opened the live `https://dailydoase.de/` home view in the in-app browser and captured screenshots of the deployed page.
- Checked the direct `/CANK` route and confirmed it returns `Cannot GET /CANK`.
- Verified the home page DOM does not contain `CANK`, so the uploaded folder is not exposed in the live public index yet.

### Acceptance Criteria Result

- [x] Browser inspection ran against the deployed site.
- [x] Screenshot of the live home view was captured.
- [x] The CANK route was checked directly.
- [ ] CANK is visible as the newest live folder.

### Verification Result

- The live page shows the current folder list and a large movie preview.
- `/CANK` is not a live folder route.

### Issues / Gaps

- The deployed index is not reflecting the uploaded CANK folder.

### User Demo Notes

- Screenshot captured from the live home view; the page is currently serving the existing movie list, not CANK.

## Loop 6 Retrospective â Live Folder Verification

### What Worked

- A direct route check removed ambiguity faster than guessing from the folder list.
- Full-page screenshot after a short settle time captured the visible movie preview clearly.

### What Was Confusing

- The root page and direct route disagree with the expectation that CANK should already be live.

### What To Improve Next Loop

- If CANK must be public, wire it into the deployment index or route and verify again in the browser.

### Process Decision

- Stop: verification complete, but the requested CANK folder is not visible live.

## Loop 7 Review â CANK Live Wiring

### What Changed

- Changed the server bootstrap order so the deployment host prefers `lib/GENERATIONS` over the stale top-level `GENERATIONS` tree.
- Restarted the remote Node server so the cache rebuilt from the uploaded `lib/GENERATIONS` content.
- Verified in the browser that `CANK` now appears in the live sidebar and that `/v/CANK` opens the folder view with the movie grid.

### Acceptance Criteria Result

- [x] Live site was updated to surface `CANK`.
- [x] Browser screenshot confirms `CANK` is visible in the sidebar.
- [x] The CANK folder route renders its movies.

### Verification Result

- `https://dailydoase.de/` now shows `CANK` at the top of the sidebar.
- `https://dailydoase.de/v/CANK` renders the folder and its movie thumbnails.

### Issues / Gaps

- The repository still contains unrelated dirty work from earlier trailer iterations.

### User Demo Notes

- Screenshot captured from the live CANK folder view.

## Loop 7 Retrospective â CANK Live Wiring

### What Worked

- Checking the remote process root exposed the cache-order bug quickly.
- Reordering startup candidates fixed the live surface without touching the folder contents.

### What Was Confusing

- The host had both a stale top-level `GENERATIONS` tree and the active `lib/GENERATIONS` tree.

### What To Improve Next Loop

- Keep the deployment host path preference explicit so the cache does not drift again.

### Process Decision

- Stop: requested live wiring is complete and browser-verified.
- Replaced fractional timing with the whole-second `1+` rhythm.
- Removed the invented `Green Monster Ware Haus` label from prompts and the compact end card.

### Acceptance Criteria Result

- [x] A new Semantic Stream plan is saved in `720-glas-kaufhaus-fresh-sound-iteration-1`.
- [x] Six new WAN clips exist.
- [x] Scene prompts receive forward-only camera instruction.
- [x] Collision-cut concat and compact exhibition end card exist.
- [x] Mirelo made one final sound attempt and left `1785854923010-mirelo-video-sound.error.json`; visual output survived.

### Verification Result

- Shell and Node syntax checks passed.
- 39 focused Shorty-Book and end-card tests passed.
- `git diff --check` passed before generation.
- Manual file verification found six WAN MP4 parts and `merged/1785854923010-collision-cut.mp4`.

### Issues / Gaps

- External Mirelo did not deliver audio. Its generated error artifact is retained for later diagnosis.

### User Demo Notes

- Fresh visual output: `GENRATIONS-KAUFHAUF/720-glas-kaufhaus-fresh-sound-iteration-1/merged/1785854923010-collision-cut.mp4`.

## Loop 1 Retrospective â Fresh Sound Iteration

### What Worked

- A live Semantic Stream completed and produced a full six-clip run.
- Whole-second timing removed provider-duration ambiguity.
- Collision cuts turn repeated handoff frames into intentional semantic breaks.

### What Was Confusing

- Mirelo fails after visual concat even though the desired fallback policy preserves output.

### What To Improve Next Loop

- Inspect the saved Mirelo error artifact and make one small, isolated audio-provider fix before another full paid run.

### Process Decision

- Stop: the requested fresh visual iteration is complete; sound is externally blocked and must be diagnosed separately.

No implementation review yet.

## Loop 1 Plan Review

### Proposed Slice

Build one deterministic poster-driven Glass Kaufhaus generation path with at least three scenes, then save the first concatenated video.

### Acceptance Criteria

- [ ] Poster/JPG and JSON inputs are recorded.
- [ ] Warehouse/Kaufhaus scene prompt includes supplied words and 1989 trailer framing.
- [ ] Main poster figure and artist/person context are represented in generation metadata.
- [ ] First video part is generated and saved.
- [ ] `final.mp4` is concatenated and saved.
- [ ] Mirelo failure remains non-fatal.

### Open Before Implementation

- Choose primary poster reference or use all four pages as context.
- Confirm first-run words and output duration.

## Loop 1 Review

### What Changed

- Added `MIX-again-freshweb.glas-kaufhaus-trailer.sh`.
- Added `glas-kaufhaus-trailer.mjs` to validate poster inputs, inject exhibition metadata, and run the trailer.
- Kept normal semantic-stream article lookup as required.
- Used the Green Monster Ware Haus reference image as the local protagonist frame.

### Acceptance Criteria Result

- [x] Four poster pages and three context JPGs are validated.
- [x] Exhibition JSON is read into the run manifest model.
- [x] At least three scene plans are generated.
- [x] Warehouse/BRD-1989 direction and ordered word cues are passed to planning.
- [ ] First video part is generated.
- [ ] Concatenated `final.mp4` is saved.
- [ ] Mirelo failure behavior is not yet exercised because video generation did not reach Mirelo.

### Verification Result

- Syntax checks passed for new JS and shell files.
- `git diff --check` passed.
- JS/shell syntax and diff checks passed.
- Normal semantic-stream request hit Wikipedia `429 Too Many Requests`.
- First backend attempt: WAN Space init/runtime error; Fal fallback returned `403` exhausted balance.
- Second attempt: self-hosted WAN app config unresolved; Fal fallback again returned `403`.
- Output contains poster snapshot and scene-plan JSON, no MP4.

### Issues / Gaps

- Need working WAN Space configuration or available Fal balance before video can be generated.
- Runner now searches both generation roots for the output manifest.

### User Demo Notes

- No live camera used.
- No commit or push performed.

## Loop 1 Retrospective

### What Worked

- Poster selection was clear: the 1536Ã1024 Green Monster Ware Haus image already contains the intended warehouse and main figure.
- Three-scene plan formed before the normal semantic-stream request hit Wikipedia rate limiting.

### What Was Confusing

- The configured zero-GPU and self-hosted Spaces were not resolvable from this environment.
- Fal balance failure prevents fallback validation.
- No offline semantic-stream bypass retained.

### What To Improve Next Loop

- Validate one video backend with a cheap single-clip probe before running all three scenes.
- Then rerun the existing three-scene runner and verify concat output.

### Process Decision

- Stop and wait for backend availability or user-provided routing choice.

## Loop 2 Review

### What Changed

- Added persistent two-round image-only mode and shared output naming.
- Fixed POSIX shell prompt parsing and executable script handoff.
- Started Semantic Streams sequentially to reduce Wikipedia request bursts.
- Removed unsupported `CFGScale` from Runware `bfl:3@1` requests.
- Added snapshot resume using the valid six-scene plan saved in folder 717.

### Acceptance Criteria Result

- [x] Runner reaches the real OpenAI scene planner and Runware image endpoint.
- [x] Six-scene Semantic Stream plan is saved and resumable without new Wikipedia requests.
- [ ] At least one generated scene image exists.
- [ ] Both rounds have summaries in one shared output folder.

### Verification Result

- Semantic Stream, image-only generator, and Runware request-builder tests pass.
- Shell syntax passes under `sh` and `zsh`.
- Runware rejected `CFGScale`; targeted fix and tests pass.
- Resumed request still returns `400 Bad Request`; no image was written.

### Issues / Gaps

- Next Runware validation error must be captured with request references redacted.
- Mini-loop reached configured five-loop limit before image creation.

### User Demo Notes

- Existing generation folder: `GENRATIONS-KAUFHAUF/717-glas-kaufhaus-shorty-book-image-only-test`.
- It contains scene plan and config, but currently no scene PNG.

## Loop 3 Review â Two-Scene WAN Cost Probe

### What Changed

- Added `resume-two-video-preview-from-snapshot.mjs`.
- The two-video shell preset now reads the saved first two semantic scenes from folder 717 instead of starting a new Wikipedia-backed Semantic Stream.
- It renders scene 1 from one FLUX Kontext Kaufhaus/monster frame, renders scene 2 from the extracted scene-1 WAN final frame, concatenates silently, and then creates a small review copy.
- Existing completed previews are detected to prevent accidental paid rerenders.

### Acceptance Criteria Result

- [x] Two real WAN clips exist.
- [x] Each clip is exactly 2.0 seconds.
- [x] Scene 2 starts from the actual scene-1 last-frame PNG.
- [x] Lossless concat is exactly 4.0 seconds.
- [x] Small 272Ã208 silent preview is exactly 4.0 seconds.
- [x] No new Wikipedia request occurred during the successful media run.

### Verification Result

- `zsh -n lib/generator/adapter/MIX-again-freshweb.glas-kaufhaus-two-video-preview.sh` passes.
- Preview model initialization succeeds with `alibaba:wan@2.6-flash`.
- `ffprobe` confirms both concat files are 4.000 seconds.
- Scene metadata confirms scene 2 uses scene 1's extracted `-last-frame.png` as its start frame.

### Output

- Lossless concat: `GENRATIONS-KAUFHAUF/glas-kaufhaus-two-video-preview-loop-1/merged/1785850789364-concat.mp4`
- Small review copy: `GENRATIONS-KAUFHAUF/glas-kaufhaus-two-video-preview-loop-1/merged/two-scene-preview-272x208.mp4`

## Loop 2 Retrospective

### What Worked

- Provider errors produced precise fixes for shell parsing, rate limiting, and `CFGScale`.
- Saved snapshot prevents repeated OpenAI planning and Wikipedia initialization.

### What Was Confusing

- Upstream Semantic Stream turns Wikipedia `429` errors into recursive page titles.
- Disabling Runware debug also hid the small structured provider error body.

### What To Improve Next Loop

- Redact data URLs in network logs while keeping Runware error bodies visible.
- Probe one scene until valid before rendering all six.

### Process Decision

- Stop at max loop count; continue with focused Runware payload diagnosis next.

## Loop 2 Completion Continuation

### What Changed

- Captured each remaining structured Runware validation error.
- Removed unsupported `steps` and `negativePrompt` for `bfl:3@1`.
- Added supported-dimension normalization; 4:3 resolves to `1184Ã880`.
- Resumed the saved online Semantic Stream scene plan without repeating Wikipedia or OpenAI planning.

### Acceptance Criteria Result

- [x] Six real scene PNGs exist in the persistent generation folder.
- [x] Every PNG decodes at `1184Ã880` RGBA.
- [x] All six files have distinct SHA-256 hashes.
- [x] `run-01-summary.json` lists six existing outputs.

### Verification Result

- 58 focused tests pass.
- Node and shell syntax checks pass.
- `git diff --check` passes.
- Manual visual inspection confirms generated Green Monster warehouse scenes.

### Issues / Gaps

- Poster typography and side information panels remain visible in generated scenes despite negative prompt intent.
- Full live round 2 remains separate quality/continuity work; current image-existence goal is complete.

### Process Decision

- Goal complete; stop before video generation.

## Semantic Story Engine Live Iteration Review

### What Worked

- Deterministic consequence inheritance removed the prior false semantic failures.
- All six scene contracts passed strict validation before media generation.
- Failure isolation preserved a complete silent trailer when sound providers failed.

### What Failed

- One FLUX prompt crossed Runware's 3000-character limit and fell back to the prior frame.
- The fallback frame exposes a bright magenta reference background in the merged trailer.
- Mirelo prompt request failed, then Runware Mirelo rejected the inline video data URL.

### Result

- Six clips, 17.428571-second H.264 collision cut, and complete semantic debug artifacts produced.
- Visual iteration complete; audio completion remains a focused follow-up that does not require rerendering video.

## Image Reference Correction Review

### What Changed

- Removed the full exhibition poster from image-generation references.
- Extracted one clean transparent Green Monster protagonist.
- Precomposed the monster into all four real Kaufhaus photographs.
- Locked semantic rendering to localized monster/light edits while preserving room pixels and camera geometry.

### Verification Result

- Corrected Run 5 contains six decodable `1184Ã880` PNGs and one six-scene summary.
- Visual contact-sheet review confirms Kaufhaus architecture across all six scenes.
- Exactly one monster protagonist is present; no people, portraits, humanoid sculptures, or poster layout remain.

## Loop 5 Review

### What Changed

- Added compact planner schema and direct production prompts.
- Disabled default semantic reconstruction through existing preset default and removed active per-scene semantic repair.

### Acceptance Criteria Result

- [x] Whole sequence plan uses structured cues.
- [x] Structural validation and one full-plan repair only.
- [x] FLUX/WAN use compact planner fields.

### Verification Result

- Focused Jest: 37 tests passed.
- Webpack build passed.

### Issues / Gaps

- Full Jest found one legacy camera-plan assertion; compact normalizer fix is being verified.

### User Demo Notes

- No paid media run performed during this source refactor.

## Loop 5 Retrospective

### What Worked

- Compact adapter kept old saved-plan compatibility at load boundary.

### What Was Confusing

- Existing memory-bank history must remain append-only.

### What To Improve Next Loop

- Isolate script-style integration files from Jest discovery before relying on an all-suite command.

### Process Decision

- Stop. Requested source refactor is complete; commit remains ask-first.

## Loop 5 Live Render Review

- [x] Compact planner generated one six-scene Semantic Stream sequence.
- [x] Six FLUX/WAN scene renders completed and merged into the collision-cut trailer.
- [x] H.264 output is decodable at 448x336 for 17.428571 seconds.
- [ ] Audio remains absent because Runware rejected Mirelo's local-video fallback input.

## New Semantic Word Stream Live Render

### What Changed

- Ran a fresh trailer from the words `kaufhaus`, `fleisch`, `LSD`, and `people`.
- Kept the Kaufhaus image as the fixed room anchor.
- Kept the protagonist image as identity only.
- Allowed drift only as continuity correction.

### Result

- Six scenes rendered and merged successfully.
- Final trailer output: `GENRATIONS-KAUFHAUF/741-glas-kaufhaus-shorty-book-trailer-loop-001/merged/1785932142326-collision-cut.mp4`.
- Mirelo audio fallback failed again, so the delivered trailer is silent.

### Verification Result

- Location continuity stayed stable across the run.
- The semantic stream controlled the action and atmosphere while the image reference preserved the room.

## Mobile-Realism Rerender

### What Changed

- Tightened the prompts toward handheld mobile-device realism.
- Pushed the trailer away from polished studio gloss and toward candid phone-shot texture.

### Result

- New trailer output: `GENRATIONS-KAUFHAUF/742-glas-kaufhaus-shorty-book-trailer-loop-001/merged/1785932760634-collision-cut.mp4`.
- The silent visual trailer remained intact.
- Mirelo audio fallback failed again on the local final video input.

### Verification Result

- The new prompt wording propagated into the planner and image prompts.
- The generated output now has a more phone-shot, imperfect capture feel.

## Expanded Semantic Stream Rerender

### What Changed

- Added `terror` and `Konsum` to the active semantic stream.
- Re-ran the trailer with the same fixed Kaufhaus anchor and identity-only protagonist rule.

### Result

- New trailer output: `GENRATIONS-KAUFHAUF/743-glas-kaufhaus-shorty-book-trailer-loop-001/merged/1785933457523-collision-cut.mp4`.
- Mirelo audio fallback failed again, so the trailer is silent.

### Verification Result

- The planner absorbed the new words and shifted scene content accordingly.
- The output remains grounded in the location anchor and mobile-device visual style.

## Scene-Focus Routing Comparison

### What Changed

- Added a required compact-plan focus: `location`, `objects`, `people`, `trace`, `monster`, or `mixed`.
- Routed FLUX context references and prompt construction from that focus.
- Removed monster identity language from environment-focused production prompts.

### Result

- Two separate six-scene trailers completed with multiple monster-free scenes.
- Outputs: `744-scene-focus-routing-trailer-001` and `745-scene-focus-routing-trailer-002`.
- Both visual cuts are valid; Mirelo's final-audio upload failed, so they remain silent.

### Verification Result

- Focus-routing tests, compact-plan validation tests, generator tests, and the webpack production build pass.
- The two plan distributions include environment, object, people, trace, monster, and mixed focus states.

## Two-Round Monster Continuity Trailer — Halted Run

### What Changed

- Started a fresh two-iteration trailer render from `Kaufhaus,de | Fleisch,de | LSD,de | people,en | terror,en | Konsum,de`.
- Generated partial stills and WAN clips through scene 4.
- Stopped the active renderer when the user asked to stop the iteration.

### Acceptance Criteria Result

- [ ] Two merged trailers exist.
- [ ] Both iterations completed.
- [x] The active render was stopped on request.

### Verification Result

- Process `36355` was terminated successfully.
- Partial artifacts remain in `GENRATIONS-KAUFHAUF/752-752-two-round-monster-continuity-trailers`.

### Issues / Gaps

- No merged trailer exists for this halted run.

### User Demo Notes

- Resume requires a fresh render start.
