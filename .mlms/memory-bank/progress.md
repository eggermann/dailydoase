# Progress

## Done
- Confirmed clean detached worktree at analysis snapshot `32e27bbc`.
- Created `codex/eu-reski-artistic-auto-mode`.
- Read supplied specification, analysis artifacts, repository instructions, and prior memory. Preserved prior project brief at `projectBrief.previous.md`.
- Confirmed auto-mode insertion point after article selection and before Story planning.
- Confirmed no `.env` in this worktree; the exhibition start script resolves credentials via `NEWS_ENV_FILE` or the main repository `.env`.
- Added default-off config and CLI switches, structured director decision validation, effective-flag constraints, saved per-iteration decisions, and resume validation.
- Added `news:auto-10` and documented `npm run news:auto-10`; user later authorized and ran ten live iterations.
- Added six mock-based unit tests for activation, schema validation, legacy effects, iteration independence, executable mode, and resume behavior.
- Live run created ten iterations and auto decisions. Seven iterations have First/Last-Frame glue built; video tasks remain in iterations 8 and 9.
- Added 60-second video poll windows, `pending_media` status and task summaries, same-ID polling on resume, and Hugging Face fail-closed handling for unknown submission outcomes.
- Focused Jest suite passed (6/6 earlier; 8/8 after recovery changes); syntax checks and `git diff --check` passed.

## In Progress
- None. User redirected follow-on work to a new five-iteration set matching run-003.

## Next
- Review and commit the run-003-style reproduction snapshot and relevant config/runner changes; do not push.

## Run-003-style five-iteration reproduction
- Completed five iterations using HF FLUX Klein, masked Guernica figure references, the full-painting style reference, article-photo references off, and P-Video 2 Pro at 480p.
- First/Last-Frame glue was generated as iterations completed; merged film duration is 133.416688 seconds.
- Added a tracked reproduction snapshot with both films, run records, settings, hashes, and copied Guernica reference assets.
- Earlier no-Guernica partial run remains separate and untouched.
- Validation: all five records show figure refs on, article refs off, and catalog + style roles; ffprobe reports 133.416688 seconds; git diff check passes.
