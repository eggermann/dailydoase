# Active Context

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
