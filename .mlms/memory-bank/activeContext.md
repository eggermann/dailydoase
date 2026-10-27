# Active Context

## Current Goal
Implement EU RESKI artistic auto-mode, run ten exhibition iterations, and make provider tasks resumable.

## Current Loop
Loop: 1 · Phase: Implementation complete; live run pending four video tasks

## Shared Loop Budget
Root Context: .mlms
Used: 1
Maximum: 5

## Current Focus
Implementation and recovery changes complete. Reference film exists; glue built through iteration 7. Resume same run for four open video tasks.

## Assumptions
- The new feature branch starts at `32e27bbc`, as requested.
- Exhibition `generation.autoMode` defaults to false.
- `run-001` has 10 iterations; video tasks pending in iterations 8 and 9.

## Risks / Unknowns
- The worktree has no `.env`; the main repository `.env` exists and is resolved by `EU-reski-mix-arg-and-camera-moovs.start.sh`. Its contents were not read or copied.
- Run-time external credentials are deliberately not evaluated or printed.

## Next Action
Resume `npm run news:auto-10` when requested; poll saved task IDs, then let exhibition runner build First/Last-Frame glue after each complete iteration.
