# Progress

## In Progress

- Planning a new live trailer base branch from the current state.
- Comparing the three `trailer/*` branches as cherry-pick sources.
- Mapping the live `live/` web folder and continuous semantic-collision loop.

## Done — Main Push and Live Drawer Deploy

- Cherry-picked the layout commit onto current GitHub `main` as `55cee057` and pushed it.
- Uploaded only `lib/web/dist/main.css` and `main.css.map` to production, preventing another generation-folder sync.
- Restarted the remote service and verified `HTTP/1.1 200 OK`.
- Live screenshot: `.playwright-cli/page-2026-08-07T09-32-58-114Z.png`.

## Done — Main Drawer Overlay Layout

- Committed `dd7a0867 fix: overlay drawer above full-width media` directly on `main`.
- Restored a `100vw` media canvas beneath the fixed left drawer and explicitly anchored the drawer at the left edge.
- Local Playwright check: `.playwright-cli/page-2026-08-07T09-15-33-036Z.png`.

## Done — Live CANK Recovery

- Restored the remote historical archive into `lib/GENERATIONS` by hard-linking missing folders only; the original `GENERATIONS` archive remains intact.
- Removed 52 byte-identical duplicate CANK videos after SHA-256 verification; 57 unique videos plus supporting files remain.
- Pinned CANK below Home and sorted CANK output by its production numeric prefixes.
- Changed cache initialization to sort each folder once after scanning, so the restored archive can start reliably.
- Restarted `dailyDoase`; remote HTTP returned `200 OK`.
- Captured live verification: `.playwright-cli/page-2026-08-07T09-07-33-078Z.png`.

## Done

- Added a dedicated proportional end-card composition for the 576×1024 CANK trailer output.
- Added and passed a focused portrait end-card regression test.
- Updated the production end-card module and restarted `cankTrailer`.

## In Progress

- The next live CANK iteration is running with the requested semantic stream:
  `Department store · Toy · Horror · Landscape · Art exhibition · Animals`.

## Done — Readable Portrait Card Proof

- Replaced SVG data-URI background loading with Sharp composition for 9:16 cards.
- Replaced server-dependent font shorthand with explicit DejaVu font properties.
- Verified the deployed 576×1024 card against a real CANK last-scene frame.
- Restarted CANK with exactly one renderer child after ending the stale orphan.

## Next

- Review the next live trailer after its normal render completes.

## Earlier Done

- Fixed the home-page hero selection so the newest video, not the newest image, becomes the main movie on the landing page.
- Added home/layout CSS so the title no longer overlaps the sidebar and the content starts to the right of the fixed menu.
- Deployed the updated server and dist bundle to the Uberspace DailyDoase host.
- Restarted the `dailyDoase` supervisor service and verified HTTP 200 on `127.0.0.1:4000`.
- Captured a fresh screenshot of the fixed home page.

## In Progress

- None.

## Next

- Inspect branch-specific trailer scripts and model pins.
- Choose the first cherry-pick slice for the live base branch.
- Decide how the 14-hour cadence should be represented in the launcher.

## Done

- Upgraded the remote mini to Node 22.23.2 by repointing `/usr/local/bin/node`, `npm`, and `npx` at a user-local install.
- Switched this repo to the local sibling `../semantic-stream` checkout at version 3.0.4.
- Verified the focused semantic-stream tests locally and on the remote mini.

## In Progress

- The remote trailer loop is running again under the new Node 22 binary.

## Next

- Decide whether to commit the local `semantic-stream` file-link pin or keep it as a test-only change.

## Done

- Simplified the CANK wrapper so it only sets the live folder, polling interval, max iterations, and semantic word stream.
- Synced the cleaned CANK launcher and deploy helpers to the remote mini.
- Restarted the remote CANK trailer process on the mini with the updated launcher.

## In Progress

- The remote trailer run is now on the real semantic-stream `429` path instead of a synthetic fallback.

## Next

- Decide whether to keep waiting on the remote trailer cycle or lower request pressure.

## Done

- Wired the live server bootstrap to prefer `lib/GENERATIONS` on the deployment host.
- Restarted the remote Node server so the cache rebuilt from `lib/GENERATIONS`.
- Verified in the browser that `CANK` now appears in the live sidebar.
- Verified `/v/CANK` opens the folder view with the movie grid.

- Reframed the active goal to a new trailer run using `kaufhaus`, `fleisch`, `LSD`, and `people`.
- Completed the new trailer render in `GENRATIONS-KAUFHAUF/741-glas-kaufhaus-shorty-book-trailer-loop-001/merged/1785932142326-collision-cut.mp4`.
- Kept the Kaufhaus location image as the fixed room anchor and used the protagonist image as identity only.
- Tightened the prompt layer to make the trailer feel like realistic handheld mobile-device footage.
- Completed the rerun in `GENRATIONS-KAUFHAUF/742-glas-kaufhaus-shorty-book-trailer-loop-001/merged/1785932760634-collision-cut.mp4`.
- Added `semanticAnchorEnglish` and `semanticCollisionEnglish` to the strict planner schema and runtime scene plan.
- Production FLUX prompts and provider compaction prefer English translations while cue validation keeps original source terms.
- Image-only summaries preserve both original and translated terms.
- Added translation/schema/prompt/sanitization tests; focused total is now 108 passing tests.
- Finished hard semantic validation with complete report booleans, flattened errors/warnings, and returned scene plan.
- Added layered derivation, decorative-use, generic-tension, clue-source, absent-agency, unique-ID, inheritance, and prompt-propagation checks.
- Added exported one-scene repair with immutable cue identity and no stream dependency.
- Enabled strict semantic abort by default only in collision mode.
- Preserved semantic fields through runtime defaults/sanitization and expanded image-only summaries.
- Added provider-safe FLUX compaction that retains the mandatory semantic chain below 3000 characters.
- Added explicit-plan image-only resume and plan-only two-video shell success behavior.
- Passed 105 focused tests, webpack build, syntax checks, and `git diff --check`.
- Replayed the validator against real six-scene folder 726 and real round-2 folder 729 successfully.
- Completed two live image-only rounds with four decodable 1184x880 images and fresh collisions in folder 729.
- Confirmed two-video scene 2 inherits scene 1's consequence ID/state and WAN receives all required semantic parts.
- Added canonical structured cue records plus legacy serialization from the same records.
- Preserved exactly one `getNext()` call per assigned scene.
- Added mandatory semantic schema fields and semantic derivation report.
- Added hard causal validation for cue identity, physicalization, absence agency, clues, tension, consequence inheritance, and FLUX/WAN propagation.
- Added two-attempt targeted scene repair and strict semantic abort.
- Added four scene-plan debug artifacts and extended image-only summaries.
- Made semantic priority mandatory even when camera mode supplies a custom planner system prompt.
- Passed 36 focused tests, 84 Shorty-Book tests, webpack build, syntax checks, and `git diff --check`.
- Confirmed trailer branch is active.
- Inspected `lib/Plak-2_images/`.
- Found four poster pages, three additional JPG references, and exhibition JSON.
- Initialized project brief and memory bank.
- Selected `6d94760a...jpg` as Green Monster Ware Haus protagonist/reference.
- Implemented three-scene Glass Kaufhaus trailer runner.
- Added dedicated output root `GENRATIONS-KAUFHAUF/`.
- Added scene-planner model/request/response console logging via the existing logger.
- Reworked trailer runner to derive monster prompt, creative rule, artist dossier, and three-scene film arc from the rich exhibition JSON.
- Added four people-free, 4:3 Kaufhaus location photos and local scene-context path support.
- Mapped three people-free location views across the three trailer scenes while retaining the monster as separate protagonist reference.
- Generated and logged a three-scene plan twice.
- Generated six real Runware image-only scenes in persistent generation folder 717.
- Validated all six PNGs as distinct, decodable 1184Ã880 RGBA images.
- Saved `run-01-summary.json` with six existing output paths.
- Added model-safe Runware payload handling for FLUX Kontext Pro fixed controls and dimensions.
- Created a transparent monster-only identity asset without poster text, panels, or people.
- Created four canonical Kaufhaus-plus-monster location references.
- Generated corrected Run 5: six scenes preserve the photographed Kaufhaus, contain one monster protagonist, and contain no people or poster layout.
- Generated one real FLUX Kontext scene-1 start image and two real silent Runware WAN 2.6 Flash clips at the two-second minimum.
- Continued scene 2 from scene 1's extracted WAN last frame; scene-prompt metadata records the exact handoff path.
- Concatenated the clips to a verified four-second MP4 and created a 272Ã208 local review copy.
- Added a two-video snapshot-resume entry point so the cost test does not re-query Wikipedia before WAN starts.
- Ran a fresh normal Semantic Stream iteration in generation folder `720-glas-kaufhaus-fresh-sound-iteration-1`.
- Generated six fresh WAN scene clips with the whole-second 1+ rhythm.
- Created a collision-cut concat with continuous forward dolly and compact exhibition end card.
- Preserved Mirelo's final-sound failure artifact without losing the visual concat.

## In Progress

- None.

## Next

- Review the expanded trailer output and decide whether another rerender or a commit is needed.
- Keep Mirelo video-upload correction as a separate follow-up if sound is needed.

## CANK Trailer Deploy

## Done

- Added newest-first CANK copy ordering.
- Added `deploy/cank-trailer-sync-loop.cjs` for continuous live-folder mirroring.
- Added `lib/generator/adapter/MIX-again-freshweb.glas-kaufhaus-cank-trailer.sh` for endless trailer generation with the Kaufhaus word stream.
- Refreshed `lib/GENERATIONS/CANK` locally.
- Captured a live screenshot of `https://dailydoase.de/v/CANK` as `.mlms/cank-live-page.png`.

## Done — CANK Failure Recovery

- Added an in-process recovery burst: a failed trailer consumes no repeated prompt, then creates two fresh semantic iterations before the fourteen-hour delay resumes.
- Kept the same WordStream instances alive across recovery attempts.
- Added a regression test for a returned failure and a thrown provider error.
- Focused semantic-stream loop tests, Node syntax checks, shell syntax check, and `git diff --check` pass.

## In Progress

- None.

## Next

- Start the long-running generator/sync loop on the deployment host when ready.

## Next

- Decide whether to commit the memory-bank update for this trailer loop.
- Keep Mirelo video-upload correction as a separate follow-up if sound is needed.

## Semantic English Trailer Iteration 2

### Acceptance Result

- [x] Fresh Semantic Stream produced six source-language cue records.
- [x] Validated plan preserves source terms with paired English translations.
- [x] Production FLUX and WAN prompts replaced current-scene German semantic terms with English translations.
- [x] Six WAN clips rendered and collision-cut trailer plus end card were saved.
- [x] Final silent trailer decodes as H.264, 448x336, 17.428571 seconds.
- [ ] Final audio: Mirelo and its Runware fallback rejected the local final-video input; visual trailer remains intact.

### Output

- Generation: `GENRATIONS-KAUFHAUF/731-semantic-english-trailer-iteration-2/`
- Trailer: `GENRATIONS-KAUFHAUF/731-semantic-english-trailer-iteration-2/merged/1785926913747-collision-cut.mp4`
- Validation: `GENRATIONS-KAUFHAUF/731-semantic-english-trailer-iteration-2/parts/scene-prompts/semantic-validation-report.json`

### Visual QA

- End card is readable and exhibition-branded.
- Final frame preserves recognizable Kaufhaus geometry and a distinct monster, though the creature trends illustrated rather than photoreal.

## Semantic Story Engine Iteration 2

### Acceptance Result

- [x] Fresh Semantic Stream produced six collision cue records.
- [x] Mandatory semantic validation passed for all six scenes with zero errors and warnings.
- [x] Six WAN clips rendered and were concatenated in narrative order.
- [x] Final silent collision cut exists and decodes as H.264, 448x336, 17.428571 seconds.
- [ ] Final sound track: Mirelo fetch failed; Runware fallback rejected the inline video input and returned the silent cut.

### Output

- Generation: `GENRATIONS-KAUFHAUF/726-semantic-story-engine-iteration-2/`
- Video: `GENRATIONS-KAUFHAUF/726-semantic-story-engine-iteration-2/merged/1785921513140-collision-cut.mp4`
- Validation: `GENRATIONS-KAUFHAUF/726-semantic-story-engine-iteration-2/parts/scene-prompts/semantic-validation-report.json`

### Observed Gap

- Scene 2 FLUX prompt exceeded Runware's 3000-character limit, so generation reused the preceding frame. WAN rendering and the six-scene merge still completed.
- Contact-sheet QA shows the fallback leaks a bright magenta reference background into one scene; this is the highest-priority visual correction.

## Compact Pipeline Refactor

- Replaced repeated semantic prompt payload with compact scene fields in active planner path.
- Added structural cue validation, one full-plan repair, and focused tests.
- Verification: focused tests and webpack build pass.

## Compact Pipeline Live Render

- [x] One GPT-5 compact whole-plan call preserved six Semantic Stream cue pairs.
- [x] FLUX and WAN rendered six sequential clips and merged the collision cut.
- [x] The final visual trailer decodes as H.264, 448x336, 17.428571 seconds.
- [ ] Mirelo/Runware final-audio fallback rejected its local video input; the visual cut is silent.
- Output: `GENRATIONS-KAUFHAUF/738-glas-kaufhaus-compact-pipeline-iteration-008/merged/1785929841774-collision-cut.mp4`.

## Scene-Focus Routing Comparison

### Acceptance Result

- [x] Compact plans require a valid `sceneFocus`; invalid plans are repaired once as a whole.
- [x] Focus-free FLUX calls omit the monster reference; focus-visible calls retain it.
- [x] Two fresh six-scene trailers rendered from `kaufhaus`, `fleisch`, `LSD`, `people`, `terror`, and `Konsum`.
- [x] Both collision cuts decode as H.264, 448x336, 17.428571 seconds.
- [ ] Audio: Mirelo again rejected the local final-video input; both visual cuts are silent.

### Output

- Trailer 1: `GENRATIONS-KAUFHAUF/744-scene-focus-routing-trailer-001/merged/1785933988274-collision-cut.mp4`
- Trailer 2: `GENRATIONS-KAUFHAUF/745-scene-focus-routing-trailer-002/merged/1785934351648-collision-cut.mp4`

## Two-Round Monster Continuity Trailer

- Started a fresh two-iteration render in `GENRATIONS-KAUFHAUF/752-752-two-round-monster-continuity-trailers`.
- Stopped the active render at the user’s request before any merged trailer was produced.
- Partial scene assets were written through scene 4, but the run remains incomplete.
- Hardened monster continuity: visible monster scenes always attach the canonical complete Kaufhaus-monster image; no reference means an explicit render error instead of an invented green creature.
- Added monster-entry pipeline v2: fresh canonical FLUX is mandatory for visible monster scenes, paid providers receive a monster-free safety assertion, old unversioned preview frames cannot resume, and focused test suite passes (105 tests).

## Canonical Monster Entry v2 Render Attempt

- Started one fresh iteration in `GENRATIONS-KAUFHAUF/754-754-canonical-monster-entry-v2-iteration-001/` with the Semantic Stream `Kaufhaus`, `Fleisch`, `LSD`, `people`, `terror`, and `Konsum`.
- The planner selected a monster-free location opening. The rendered opening and first WAN scene used the strict monster-free prompt with no protagonist reference.
- The run stopped at scene 2 after a WAN provider fetch failure. No merged trailer exists; the specific failed shell and Node processes were terminated.

## Taktmuster-Planned Canonical Monster Entry v2 Trailer

- The scene-count contract now derives its exact `minItems` and `maxItems` directly from the active Taktmuster, so the structured planner cannot omit a Semantic Stream transition.
- One fresh iteration completed with six Taktmuster beats from `Kaufhaus`, `Fleisch`, `LSD`, `people`, `terror`, and `Konsum`.
- Merged silent trailer: `GENRATIONS-KAUFHAUF/757-757-canonical-monster-entry-v2-iteration-004/merged/1785942452919-collision-cut.mp4` (H.264, 448x336, 17.428571s).
- Mirelo and Runware final-audio fallback failed, so the visual trailer is intentionally silent. The one-iteration renderer processes were stopped after the merge.

## Live CANK-TRAILER Proof

- [x] Separate target `lib/GENERATIONS/CANK-TRAILER` and `Sound/` created.
- [x] Server launcher and publisher services installed under Supervisor.
- [x] Remote iteration 783 rendered six WAN clips, merged, generated Runware-Mirelo fallback audio, and muxed it.
- [x] Published `1-783-glas-kaufhaus-cank-trailer-mobile-live-1786098556134-with-sound.mp4`, its JSON sidecar, and its WAV.
- [x] Public page and direct video returned HTTP 200; ffprobe verified H.264 576x1024 + AAC, 18.08s.
- [x] Fresh mobile screenshot captured at `.mlms/cank-trailer-live-mobile-783.png`.

## Three-Branch Local Batch and Live Upload

- [x] Generated and verified 15 `*-with-sound.mp4` trailers: five each from the Good 1, Good 2, and Good 3 branch presets.
- [x] `ffprobe` verified AAC audio in every final MP4.
- [x] Published all 15, not merely the newest item per generation, to separate live folders: `CANK-TRAILER-GOOD-1`, `CANK-TRAILER-GOOD-2`, and `CANK-TRAILER-GOOD-3`.
- [x] Each public folder has five numbered video files and five `Sound/` files. DailyDoase restarted and its local and public routes returned HTTP 200.

## CANK 784 English Live Refresh

- [x] Generation 784 completed from the new English semantic stream.
- [x] `1-784-glas-kaufhaus-cank-trailer-mobile-live-1786115449924-with-sound.mp4` was added to `/v/CANK-TRAILER` without removing 783.
- [x] Direct live route, mobile 9:16 screenshot, sound output, and public ordering verified.
