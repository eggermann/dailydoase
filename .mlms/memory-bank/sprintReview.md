# Sprint Review

## Loop 1 Plan — Mandatory Semantic Story Engine

### Acceptance Criteria

- [ ] Structured records preserve every anchor and collision losslessly.
- [ ] Each selected stream's `getNext()` runs exactly once per assigned scene.
- [ ] Planner receives both records and compatibility strings.
- [ ] Hard validation covers causal physicalization, monster agency, clues, tension, consequence inheritance, and production prompts.
- [ ] Invalid entries receive targeted repair before strict failure or marked legacy fallback.
- [ ] Required debug artifacts and extended image-only summaries are saved.
- [ ] Focused tests pass and diff review finds no independent story path.

### Proposed Slices

1. Structured semantic baton.
2. Mandatory schema and causal validator.
3. Targeted repair and runtime wiring.
4. Artifact and FLUX/WAN propagation verification.

## Loop 1 Review — Mandatory Semantic Story Engine

### What Changed

- Structured Semantic Stream records are canonical; legacy strings serialize from them.
- Planner schema now requires the complete semantic cause, monster agency, consequence, clue, tension, continuity, and derivation chain.
- Validation rejects decorative use, unsupported absence, unrelated clues/tension, broken consequence IDs, and missing production-prompt propagation.
- Invalid entries receive two targeted repair attempts with cue, errors, and neighboring scenes before strict abort.
- Runtime saves source records, raw plan, validated plan, and per-scene validation report.
- FLUX and WAN prompt assembly share the physical semantic core in model-specific order.

### Acceptance Criteria Result

- [x] Structured records preserve every anchor and collision losslessly.
- [x] Each selected stream's `getNext()` runs exactly once per assigned scene.
- [x] Planner receives both records and compatibility strings.
- [x] Hard validation covers causal physicalization, monster agency, clues, tension, consequence inheritance, and production prompts.
- [x] Invalid entries receive targeted repair before strict failure.
- [x] Required debug artifact writers and extended image-only summaries are implemented.
- [x] Focused tests pass and diff review finds no independent planner prompt path.
- [ ] Two-round live image-only integration passes.
- [ ] Cheap two-clip continuity preview passes with the validated plan.

### Verification Result

- 36 focused semantic/planner/prompt tests passed.
- 84 Shorty-Book tests passed.
- Webpack compiled successfully.
- Syntax checks and `git diff --check` passed.
- Full Jest reached one unrelated existing mock camera-prompt expectation failure.
- Live run 724 stopped during Semantic Stream article setup and produced only `info.json`.

### Issues / Gaps

- Semantic Stream provider did not reach cue generation, so no live planner, FLUX, WAN, or semantic debug artifact could be inspected.

### User Demo Notes

- Blocked run folder: `GENRATIONS-KAUFHAUF/724-semantic-story-engine-image-only-test`.

## Loop 1 Retrospective — Mandatory Semantic Story Engine

### What Worked

- Canonical structured records removed regex dependence without breaking legacy cue strings.
- Validator and prompt tests make causal requirements executable rather than advisory.
- Custom camera planner prompts can no longer bypass semantic priority.

### What Was Confusing

- Existing runner exits cleanly during Semantic Stream setup without surfacing a useful terminal error.

### What To Improve Next Loop

- Preserve Semantic Stream setup failures as explicit run artifacts before retrying provider-backed integration.

### Process Decision

- Stop: implementation and local checks are green; live integration is blocked before the changed planner path.

## Loop 1 Plan — Fresh Sound Iteration

### Acceptance Criteria

- [ ] A new Semantic Stream plan is saved in a new generation folder.
- [ ] Every WAN scene duration is a whole number of seconds.
- [ ] Scene prompts enforce forward-only camera movement.
- [ ] A collision-cut concat and compact exhibition end card exist.
- [ ] Mirelo makes one final sound attempt; visual output survives failure.

## Loop 1 Review — Fresh Sound Iteration

### What Changed

- Promoted collision cuts and a continuous forward dolly from the test-resume runner into the normal trailer runtime.
- Replaced fractional timing with the whole-second `1+` rhythm.
- Removed the invented `Green Monster Ware Haus` label from prompts and the compact end card.

### Acceptance Criteria Result

- [x] A new Semantic Stream plan is saved in `720-glas-kaufhaus-fresh-sound-iteration-1`.
- [x] Six new WAN clips exist.
- [x] Scene prompts receive forward-only camera instruction.
- [x] Collision-cut concat and compact exhibition end card exist.
- [x] Mirelo made one final sound attempt and left `1785854923010-mirelo-video-sound.error.json`; visual output survived.

### Verification Result

- Shell and Node syntax checks passed.
- 39 focused Shorty-Book and end-card tests passed.
- `git diff --check` passed before generation.
- Manual file verification found six WAN MP4 parts and `merged/1785854923010-collision-cut.mp4`.

### Issues / Gaps

- External Mirelo did not deliver audio. Its generated error artifact is retained for later diagnosis.

### User Demo Notes

- Fresh visual output: `GENRATIONS-KAUFHAUF/720-glas-kaufhaus-fresh-sound-iteration-1/merged/1785854923010-collision-cut.mp4`.

## Loop 1 Retrospective — Fresh Sound Iteration

### What Worked

- A live Semantic Stream completed and produced a full six-clip run.
- Whole-second timing removed provider-duration ambiguity.
- Collision cuts turn repeated handoff frames into intentional semantic breaks.

### What Was Confusing

- Mirelo fails after visual concat even though the desired fallback policy preserves output.

### What To Improve Next Loop

- Inspect the saved Mirelo error artifact and make one small, isolated audio-provider fix before another full paid run.

### Process Decision

- Stop: the requested fresh visual iteration is complete; sound is externally blocked and must be diagnosed separately.

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

## Loop 3 Review — Two-Scene WAN Cost Probe

### What Changed

- Added `resume-two-video-preview-from-snapshot.mjs`.
- The two-video shell preset now reads the saved first two semantic scenes from folder 717 instead of starting a new Wikipedia-backed Semantic Stream.
- It renders scene 1 from one FLUX Kontext Kaufhaus/monster frame, renders scene 2 from the extracted scene-1 WAN final frame, concatenates silently, and then creates a small review copy.
- Existing completed previews are detected to prevent accidental paid rerenders.

### Acceptance Criteria Result

- [x] Two real WAN clips exist.
- [x] Each clip is exactly 2.0 seconds.
- [x] Scene 2 starts from the actual scene-1 last-frame PNG.
- [x] Lossless concat is exactly 4.0 seconds.
- [x] Small 272×208 silent preview is exactly 4.0 seconds.
- [x] No new Wikipedia request occurred during the successful media run.

### Verification Result

- `zsh -n lib/generator/adapter/MIX-again-freshweb.glas-kaufhaus-two-video-preview.sh` passes.
- Preview model initialization succeeds with `alibaba:wan@2.6-flash`.
- `ffprobe` confirms both concat files are 4.000 seconds.
- Scene metadata confirms scene 2 uses scene 1's extracted `-last-frame.png` as its start frame.

### Output

- Lossless concat: `GENRATIONS-KAUFHAUF/glas-kaufhaus-two-video-preview-loop-1/merged/1785850789364-concat.mp4`
- Small review copy: `GENRATIONS-KAUFHAUF/glas-kaufhaus-two-video-preview-loop-1/merged/two-scene-preview-272x208.mp4`

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

## Semantic Story Engine Live Iteration Review

### What Worked

- Deterministic consequence inheritance removed the prior false semantic failures.
- All six scene contracts passed strict validation before media generation.
- Failure isolation preserved a complete silent trailer when sound providers failed.

### What Failed

- One FLUX prompt crossed Runware's 3000-character limit and fell back to the prior frame.
- The fallback frame exposes a bright magenta reference background in the merged trailer.
- Mirelo prompt request failed, then Runware Mirelo rejected the inline video data URL.

### Result

- Six clips, 17.428571-second H.264 collision cut, and complete semantic debug artifacts produced.
- Visual iteration complete; audio completion remains a focused follow-up that does not require rerendering video.

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
