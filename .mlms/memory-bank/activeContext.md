# Active Context

## Current Goal

Generate one fresh Glass Kaufhaus trailer video from a new Semantic Stream plan. Preserve source-language cue identity while using English translations in FLUX and WAN production prompts.

## Current Loop

Loop: 4
Phase: Review

## Current Focus

Completed fresh collision-mode trailer iteration in `731-semantic-english-trailer-iteration-2`. The saved plan preserves six German source cue pairs and English translations. FLUX and WAN production payloads use the English terms. Six WAN clips, a collision-cut merge, and end card were produced. Audio remains optional and failed non-fatally.

## Assumptions

- `page-1.jpg` through `page-4.jpg` are the four poster pages.
- JSON artist entries provide the first structured person context.
- `1983`, `Kaufhaus`, and `de` are initial story words.
- BRD/1989 trailer tone is desired, not literal historical reconstruction.

## Risks / Unknowns

- Full Jest has one unrelated existing failure in self-contained `camera-prompt-chain.mock-video.test.js`; touched Shorty-Book suite is green.
- Existing unrelated `lib/generator/adapter/trailer-context/output-prompt.txt` remains untouched.
- Generated integration media is intentionally untracked.

## Next Action

Keep generated media uncommitted. Review the current source diff and commit only after a new explicit user request.

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
