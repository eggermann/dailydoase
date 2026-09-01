# Active Context

## Current Goal

Implement Lost Audience visitor memory, returning-visitor re-identification, and interaction-aware first/last transitions from `origin/exhibition/person-fix-d6fab8c4--822-823`; produce one concatenated movie iteration.

## Current Loop

Loop: 9

Phase: Complete

## Current Focus

One finite live iteration completed with Mac-mini Qwen3-VL vision, a persisted returning-visitor event, and a verified H.264 concat.

## Assumptions

- Visitor return matching uses vision descriptions and reference continuity, not biometric identity.
- Existing visitors should remain present; a return supplies identity continuity only. The semantic stream virtualises any visible interaction.
- One run-local iteration is sufficient for this goal.

## Risks / Unknowns

- Descriptions can be incomplete or vary; return matching must stay conservative.
- The Mac mini has only Node 12 available, so its focused Jest test needs a current Node runtime before it can run there.
- Existing user changes remain isolated in the original worktree; this new worktree is clean.

## Next Action

Deliver the verified concat and keep the Mini sparse worktree for a later current-Node test if requested.
