# Sprint Review

No implementation review yet.

## Loop 1 Plan Review

### Proposed Slice

Build one deterministic poster-driven Glass Kaufhaus generation path with at least three scenes, then save the first concatenated video.

### Acceptance Criteria

- [ ] Poster/JPG and JSON inputs are recorded.
- [ ] Warehouse/Kaufhaus scene prompt includes supplied words and 1989 trailer framing.
- [ ] Main poster figure and artist/person context are represented in generation metadata.
- [ ] First video part is generated and saved.
- [ ] `final.mp4` is concatenated and saved.
- [ ] Mirelo failure remains non-fatal.

### Open Before Implementation

- Choose primary poster reference or use all four pages as context.
- Confirm first-run words and output duration.

## Loop 1 Review

### What Changed

- Added `MIX-again-freshweb.glas-kaufhaus-trailer.sh`.
- Added `glas-kaufhaus-trailer.mjs` to validate poster inputs, inject exhibition metadata, and run the trailer.
- Kept normal semantic-stream article lookup as required.
- Used the Green Monster Ware Haus reference image as the local protagonist frame.

### Acceptance Criteria Result

- [x] Four poster pages and three context JPGs are validated.
- [x] Exhibition JSON is read into the run manifest model.
- [x] At least three scene plans are generated.
- [x] Warehouse/BRD-1989 direction and ordered word cues are passed to planning.
- [ ] First video part is generated.
- [ ] Concatenated `final.mp4` is saved.
- [ ] Mirelo failure behavior is not yet exercised because video generation did not reach Mirelo.

### Verification Result

- Syntax checks passed for new JS and shell files.
- `git diff --check` passed.
- JS/shell syntax and diff checks passed.
- Normal semantic-stream request hit Wikipedia `429 Too Many Requests`.
- First backend attempt: WAN Space init/runtime error; Fal fallback returned `403` exhausted balance.
- Second attempt: self-hosted WAN app config unresolved; Fal fallback again returned `403`.
- Output contains poster snapshot and scene-plan JSON, no MP4.

### Issues / Gaps

- Need working WAN Space configuration or available Fal balance before video can be generated.
- Runner now searches both generation roots for the output manifest.

### User Demo Notes

- No live camera used.
- No commit or push performed.

## Loop 1 Retrospective

### What Worked

- Poster selection was clear: the 1536×1024 Green Monster Ware Haus image already contains the intended warehouse and main figure.
- Three-scene plan formed before the normal semantic-stream request hit Wikipedia rate limiting.

### What Was Confusing

- The configured zero-GPU and self-hosted Spaces were not resolvable from this environment.
- Fal balance failure prevents fallback validation.
- No offline semantic-stream bypass retained.

### What To Improve Next Loop

- Validate one video backend with a cheap single-clip probe before running all three scenes.
- Then rerun the existing three-scene runner and verify concat output.

### Process Decision

- Stop and wait for backend availability or user-provided routing choice.

## Loop 2 Review

### What Changed

- Added persistent two-round image-only mode and shared output naming.
- Fixed POSIX shell prompt parsing and executable script handoff.
- Started Semantic Streams sequentially to reduce Wikipedia request bursts.
- Removed unsupported `CFGScale` from Runware `bfl:3@1` requests.
- Added snapshot resume using the valid six-scene plan saved in folder 717.

### Acceptance Criteria Result

- [x] Runner reaches the real OpenAI scene planner and Runware image endpoint.
- [x] Six-scene Semantic Stream plan is saved and resumable without new Wikipedia requests.
- [ ] At least one generated scene image exists.
- [ ] Both rounds have summaries in one shared output folder.

### Verification Result

- Semantic Stream, image-only generator, and Runware request-builder tests pass.
- Shell syntax passes under `sh` and `zsh`.
- Runware rejected `CFGScale`; targeted fix and tests pass.
- Resumed request still returns `400 Bad Request`; no image was written.

### Issues / Gaps

- Next Runware validation error must be captured with request references redacted.
- Mini-loop reached configured five-loop limit before image creation.

### User Demo Notes

- Existing generation folder: `GENRATIONS-KAUFHAUF/717-glas-kaufhaus-shorty-book-image-only-test`.
- It contains scene plan and config, but currently no scene PNG.

## Loop 2 Retrospective

### What Worked

- Provider errors produced precise fixes for shell parsing, rate limiting, and `CFGScale`.
- Saved snapshot prevents repeated OpenAI planning and Wikipedia initialization.

### What Was Confusing

- Upstream Semantic Stream turns Wikipedia `429` errors into recursive page titles.
- Disabling Runware debug also hid the small structured provider error body.

### What To Improve Next Loop

- Redact data URLs in network logs while keeping Runware error bodies visible.
- Probe one scene until valid before rendering all six.

### Process Decision

- Stop at max loop count; continue with focused Runware payload diagnosis next.

## Loop 2 Completion Continuation

### What Changed

- Captured each remaining structured Runware validation error.
- Removed unsupported `steps` and `negativePrompt` for `bfl:3@1`.
- Added supported-dimension normalization; 4:3 resolves to `1184×880`.
- Resumed the saved online Semantic Stream scene plan without repeating Wikipedia or OpenAI planning.

### Acceptance Criteria Result

- [x] Six real scene PNGs exist in the persistent generation folder.
- [x] Every PNG decodes at `1184×880` RGBA.
- [x] All six files have distinct SHA-256 hashes.
- [x] `run-01-summary.json` lists six existing outputs.

### Verification Result

- 58 focused tests pass.
- Node and shell syntax checks pass.
- `git diff --check` passes.
- Manual visual inspection confirms generated Green Monster warehouse scenes.

### Issues / Gaps

- Poster typography and side information panels remain visible in generated scenes despite negative prompt intent.
- Full live round 2 remains separate quality/continuity work; current image-existence goal is complete.

### Process Decision

- Goal complete; stop before video generation.

## Image Reference Correction Review

### What Changed

- Removed the full exhibition poster from image-generation references.
- Extracted one clean transparent Green Monster protagonist.
- Precomposed the monster into all four real Kaufhaus photographs.
- Locked semantic rendering to localized monster/light edits while preserving room pixels and camera geometry.

### Verification Result

- Corrected Run 5 contains six decodable `1184×880` PNGs and one six-scene summary.
- Visual contact-sheet review confirms Kaufhaus architecture across all six scenes.
- Exactly one monster protagonist is present; no people, portraits, humanoid sculptures, or poster layout remain.
