# Active Context

## Current Goal
Save and commit a reproducible five-iteration exhibition run matching run-003.

## Current Loop
Loop: 2 · Phase: Complete; final review and commit

## Shared Loop Budget
Root Context: .mlms
Used: 2
Maximum: 5

## Current Focus
Five iterations completed with Guernica figure and full-painting references, article references off, and incremental First/Last-Frame glue. Film, run records, reference inputs, settings snapshot, and reconstruction recipe are staged for commit.

## Assumptions
- User explicitly authorized live generation and commit after the earlier no-generation scope.
- Reference run-003 used masked Guernica figure crops and the full-painting style reference; article-photo references were off.
- Provider outputs can vary across time, so records and final MP4 are retained alongside the reconstruction recipe.

## Risks / Unknowns
- The worktree has no `.env`; the main repository `.env` is resolved by the start script. Its contents were not read or copied.
- Full per-scene working outputs are large and remain local; committed snapshot contains final films, run records, and source reference assets.

## Next Action
Review staged file list, commit requested reproduction snapshot and relevant runner/config changes; do not push.
