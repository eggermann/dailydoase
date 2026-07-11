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
