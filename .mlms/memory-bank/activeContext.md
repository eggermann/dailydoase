# Active Context

## Current Goal

Implement Lost Audience visitor memory, returning-visitor re-identification, and interaction-aware first/last transitions from `origin/exhibition/person-fix-d6fab8c4--822-823`; produce one concatenated movie iteration.

## Current Loop

Loop: 9

Phase: Blocked — external render balance

## Current Focus

Implementation and focused verification are complete. The finite live render stopped before clip one because the video provider has no currently available balance.

## Assumptions

- Visitor return matching uses vision descriptions and reference continuity, not biometric identity.
- Existing visitors should remain present; a return supplies identity continuity only. The semantic stream virtualises any visible interaction.
- One run-local iteration is sufficient for this goal.

## Risks / Unknowns

- Descriptions can be incomplete or vary; return matching must stay conservative.
- Live render needs a visible camera person, configured external providers, and available Runware balance.
- Existing user changes remain isolated in the original worktree; this new worktree is clean.

## Next Action

When Runware has free balance, rerun the one-iteration command. Verify `parts/visitor-memory.json`, then link the final concat MP4.
