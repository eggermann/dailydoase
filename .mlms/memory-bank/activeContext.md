# Active Context

## Current Goal

Make the Semantic Stream the mandatory causal story engine from `getNext()` through final FLUX/WAN prompts and end-frame continuity.

## Current Loop

Loop: 1
Phase: Review

## Current Focus

Mandatory semantic story-engine code is implemented and locally verified. Live image-only run `724-semantic-story-engine-image-only-test` stopped during Semantic Stream article setup before planner or FLUX execution.

## Assumptions

- `page-1.jpg` through `page-4.jpg` are the four poster pages.
- JSON artist entries provide the first structured person context.
- `1983`, `Kaufhaus`, and `de` are initial story words.
- BRD/1989 trailer tone is desired, not literal historical reconstruction.

## Risks / Unknowns

- Live Semantic Stream stopped after article setup logs for `1983` and `Kaufhaus`; run 724 contains only `info.json`.
- Full Jest has one unrelated existing failure in self-contained `camera-prompt-chain.mock-video.test.js`; touched Shorty-Book suite is green.
- Existing unrelated `lib/generator/adapter/trailer-context/output-prompt.txt` remains untouched.

## Next Action

Retry two-round image-only integration when Semantic Stream article access is available, then run cheap two-clip continuity preview.
