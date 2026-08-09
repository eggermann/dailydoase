# Active Context

## Current Goal

Fix the weak 9:16 CANK end card, restart the live trailer iteration, and capture the actual good end frame.

## Current Loop

Loop: 1
Phase: Complete

## Current Focus

The portrait end-card now uses Sharp compositing for the real final-scene image and explicit DejaVu font properties. A server-rendered 576×1024 proof is readable. The live runner was restarted with exactly one Node child.

## Acceptance Criteria

- The portrait card fills the visual field rather than concentrating text at the top.
- The final scene remains recognizable behind the card.
- The next merged live trailer contains the card and can be captured as its final frame.

## Next Action

Observe the next scheduled trailer or commit the focused code changes when requested.

## Current Goal

Build a single running live trailer branch from the current state, then cherry-pick the best pieces from `trailer/*` into a continuous semantic-collision trailer creator with a live `live/` web folder.

## Current Loop

Loop: 1
Phase: Planning

## Current Focus

Branch inventory, trailer-branch comparison, model/runtime/format discovery, and live-folder planning before any cherry-picks.

## Assumptions

- The existing `trailer/good-*` branches contain the strongest trailer-specific experiments.
- The current branch is the safest base for a new running live branch.
- The new live folder should be exposed on web without deleting historical outputs.

## Risks / Unknowns

- The exact “14h delay” behavior may need to be represented as a scheduler/launcher setting rather than a literal sleep.
- Different branches may have incompatible launcher assumptions or model pins.
- The live folder might already have path or caching conventions that should be reused.

## Next Action

Inspect the three trailer branches and the active launcher scripts, then decide the first cherry-pick slice.

## Current Goal

Restore the full-width media canvas: the fixed left drawer overlays it, while the DailyDoase title stays top-left.

## Current Loop

Loop: 11
Phase: Complete

## Result

- `main` commit `dd7a0867` makes `main`, `.c-panel`, and `.c-panel__list` viewport-wide.
- Drawer left position is explicit and stays above media through its fixed menu layer.
- Local populated-folder browser check confirms the visual stacking and title placement.

## Next Action

Push or deploy only when requested.

## Current Goal

Repair the live CANK page after duplicate media and missing historical folders were reported.

## Current Loop

Loop: 10
Phase: Complete

## Current Focus

Remote CANK de-duplication, historical media recovery, stable CANK ordering, and service verification.

## Result

- Removed only 52 byte-identical duplicate CANK videos; 57 unique videos remain.
- Linked all 335 missing historical folders into the active `lib/GENERATIONS` root; 358 folders are now visible.
- CANK is pinned directly below Home and CANK files use numeric prefix order (`1-`, `2-`, `3-`).
- Remote service restarted and live browser verification passed.

## Next Action

None. Await user review.

## Current Goal

Fix the DailyDoase home page so the main movie is visible, the `dailyDoase` title no longer overlaps the sidebar, then redeploy and verify with a screenshot.

## Current Loop

Loop: 9
Phase: Review

## Current Focus

Home-page layout repair, video-first hero selection, remote restart, and visual verification.

## Assumptions

- The trailer generator and remote service should keep running while the home page fix lands.
- The live page may need a refresh if the browser or server cache lags behind the new bundle.

## Risks / Unknowns

- The remote service could still cache an older layout if a CDN or browser cache lingers.
- The current repo still has unrelated local modifications that should stay untouched.

## Next Action

Capture and record the fixed home screenshot, then update sprint notes and stop.

## Current Goal

Deploy the local no-fallback CANK trailer stack to the remote mini and verify it runs from the cleaned launcher.

## Current Loop

Loop: 2
Phase: In Progress

## Current Focus

The CANK wrapper now inherits the base trailer launcher instead of overriding image/video provider settings. The remote mini was synced and restarted, but the live semantic stream is still hitting the real Wikipedia `429` path.

## Assumptions

- The remote mini should mirror the current local launcher behavior exactly.
- A hard `429` is preferable to a synthetic fallback because the user asked for a proper deploy with no fallback.

## Risks / Unknowns

- The live semantic stream may still be rate-limited under continuous runs.
- Remote trailer processes may need another restart after file sync if the current child keeps old state.

## Next Action

Watch the remote log for the next trailer cycle or decide whether to reduce request pressure instead of reintroducing fallback behavior.

## Current Goal

Wire `CANK` into the live dailydoase.de index and verify it in the browser.

## Current Loop

Loop: 1
Phase: Complete

## Current Focus

`CANK` now appears in the live sidebar and the folder view opens at `/v/CANK`.

## Assumptions

- The uploaded CANK folder may exist on disk but is not wired into the public route list.
- The visible home view is the correct deployment surface for screenshot verification.

## Next Action

None.

## Current Goal

Build continuous CANK trailer deployment: keep semantic stream + taktmuster continuous, mirror new merged trailers into `lib/GENERATIONS/CANK`, and verify the live page screenshot.

## Current Loop

Loop: 1
Phase: Complete

## Current Focus

New scripts exist for the CANK-trailer live loop and the CANK sync loop. Local `lib/GENERATIONS/CANK` was refreshed newest-first. Live screenshot captured from `https://dailydoase.de/v/CANK`.

## Assumptions

- The live server reads `lib/GENERATIONS/CANK` directly.
- The first online trailer screenshot should verify the page, not a specific media file.

## Risks / Unknowns

- The server may cache folder listings and need a refresh or restart after sync.
- Continuous generation timing must stay aligned with the existing semantic-stream loop.

## Next Action

Optionally start the long-running CANK trailer generator plus sync loop on the target host.

## Current Goal

Implement scene-focus routing and render two new Glass Kaufhaus trailers from `kaufhaus`, `fleisch`, `LSD`, `people`, `terror`, and `Konsum`.

## Current Loop

Loop: 1
Phase: Review complete

## Current Focus

The compact planner selects environment or monster focus. Two real comparison trailers now verify the routing.

## Assumptions

- `kaufhaus`, `fleisch`, `LSD`, `people`, `terror`, and `Konsum` are the intended semantic words; `peopel` was a typo and `Konsum/de` means `Konsum` with German language tagging.
- The location image stays the room anchor; the protagonist image stays identity-only.
- BRD/1989 trailer tone is desired, not literal historical reconstruction.

## Risks / Unknowns

- The new word stream may push the semantic planner toward stronger horror/body-horror phrasing.
- Mirelo audio fallback still fails on local final video inputs and should remain non-fatal.
- Generated integration media is intentionally untracked.

## Next Action

Review the two rendered comparison trailers, then commit the focused implementation when approved.

## Compact Pipeline Refactor

Loop: 5
Phase: Complete

- Replaced active planner path with compact schema, one whole-plan structural repair, and direct FLUX/WAN prompts.
- Focused tests and webpack build pass. Full Jest remains blocked by script-style tests that call `process.exit` after Jest teardown.

## Live Render

Loop: 5
Phase: Complete

- User explicitly requested a new trailer render from the compact pipeline.
- Output uses a new folder and does not overwrite earlier trailers.
- GPT-5 Mini planned all six compact scenes in one request; FLUX and WAN completed all six clips.
- Final silent H.264 trailer: `GENRATIONS-KAUFHAUF/738-glas-kaufhaus-compact-pipeline-iteration-008/merged/1785929841774-collision-cut.mp4` (448x336, 17.428571 seconds).
- Mirelo audio fallback rejected the local video input; visual trailer remains complete.
- Comparison rerun used the historical three start terms `1983`, `Kaufhaus`, and `Kunstausstellung`; output is `GENRATIONS-KAUFHAUF/739-glas-kaufhaus-three-old-terms-comparison-001/merged/1785930735552-collision-cut.mp4`.

## Two-Round Monster Continuity Trailer

Loop: 1
Phase: Stopped by user

- A fresh two-iteration render was started in `GENRATIONS-KAUFHAUF/752-752-two-round-monster-continuity-trailers`.
- The user stopped the iteration before the trailer merged.
- Partial artifacts exist through scene 4, but no final merged trailer was produced for this halted run.
- Monster re-entry now requires the canonical complete Kaufhaus-monster reference. The renderer refuses a prompt-only green substitute; the canonical reference is preferred over a generated WAN frame.
- Pipeline v2: monster-free prompts and FLUX calls receive no protagonist reference; WAN is forbidden to introduce a monster or green humanoid. Every visible-monster scene now defaults to fresh canonical FLUX before WAN animation.

## Next Action

If the user wants the two-trailer output, start a fresh two-iteration render and let it finish to merge.

## Canonical Monster Entry v2 Render Attempt

Loop: 1
Phase: Blocked by transient provider failure

- Fresh output: `GENRATIONS-KAUFHAUF/754-754-canonical-monster-entry-v2-iteration-001/`.
- The Semantic Stream made the opening a monster-free location scene; this is planner-driven, not a fixed opening rule.
- Scene 1 completed with the strict monster-free WAN policy. Scene 2 failed during the WAN provider fetch, so there is no merged trailer.

## Taktmuster-Planned Canonical Monster Entry v2 Trailer

Loop: 1
Phase: Complete

- Taktmuster selected six scenes. Its dynamic count is now enforced by the structured planner schema rather than an arbitrary fixed test expectation.
- Output: `GENRATIONS-KAUFHAUF/757-757-canonical-monster-entry-v2-iteration-004/merged/1785942452919-collision-cut.mp4`.
- Video completed silently: final audio generation failed at external Mirelo and Runware services; all visual scenes and the merge completed.

## Live CANK-TRAILER Deployment

Loop: 1
Phase: Verified and running

- `cankTrailer` and `cankTrailerSync` run under Supervisor.
- Semantic stream stays `kaufhaus | fleisch | LSD | people | terror | Konsum`; mobile 9:16 taktmuster waits 14 hours after each completed trailer.
- A temporary Runware source-frame 503 retries the same clip three times with 15-second backoff.
- Publisher emits only `*-with-sound.mp4`, copies its required `.mp4.json`, and places WAV audio in `CANK-TRAILER/Sound`.
- First full server iteration: generation 783, H.264/AAC, 576x1024, 18.08 seconds.

## CANK Failure Recovery

Loop: 1
Phase: Review complete

- After a WAN clip exhausts its three retries, the current trailer is discarded.
- The still-live semantic streams immediately create two fresh recovery trailer iterations.
- After those two attempts, the normal fourteen-hour forward cadence resumes.
- Async planning/provider errors follow the same in-process path; Supervisor remains the guard for a true process-level crash.

## Next Action

Deploy this launcher/runtime update before starting independent `trailer/*` branch services.

## English CANK 784 Refresh

Loop: 1
Phase: Complete and scheduled

- Restarted the production `cankTrailer` service with the exact English stream: `Department store | Toy | Escalator | Clearance sale | Vernissage | Transformation`.
- Generation 784 completed six WAN scenes, merged, and produced a 576x1024 H.264/AAC sound trailer.
- The service is now waiting for its next normal fourteen-hour iteration.

## Local Three-Branch Trailer Batch

Loop: 1
Phase: Delivered

- Fifteen sound-ready mobile trailers were completed locally: five each for Good 1, Good 2, and Good 3.
- The three completed Node renderers were stopped after output verification because their event loops remained open after their finite limits.
- All fifteen final MP4s have an AAC stream. Mirelo direct failed once for Good 3; Runware Mirelo fallback created and muxed its final audio.
- Published to `/v/CANK-TRAILER-GOOD-1`, `/v/CANK-TRAILER-GOOD-2`, and `/v/CANK-TRAILER-GOOD-3`; each live folder holds five numbered MP4s and five standalone audio files.
- `cankTrailerWatchdog` is running under Supervisor: it checks the generator log every five minutes and restarts only after fifteen hours without progress, preserving the normal fourteen-hour planned wait.
