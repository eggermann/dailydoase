# Sprint Review

## Loop Reviews

## Loop 1 Review

### What Changed

- Initialized MLMS project brief and memory bank.
- Added render pipeline exposé.
- Added branch source map for snapshot, stable, trailer foundation, and Good-1/2/3.
- Added eleven decision papers.
- Added verification ledger.

### Acceptance Criteria Result

- [x] Actual branch remained working branch.
- [x] Every render stage names inputs, decisions, actions, artifacts, failure path, and source owner where applicable.
- [x] Good-1, Good-2, and Good-3 contributions are separated.
- [x] Green Monster behavior is classified for rejection or generalization.
- [x] Qwen production design is separated from current runtime.
- [x] Source refs and documentation links are verified.
- [x] Focused stable tests pass.

### Verification Result

6 test suites passed; 84 tests passed. Git refs and README links resolve. Documentation whitespace check passed.

### Issues / Gaps

- No live Qwen, camera, paid render, sound, or deployment check was run.
- `.mlms/projectBrief.md` is ignored by the user's global Git ignore and will require explicit force-add if committed.
- Existing unrelated dirty files remain in worktree.

### User Demo Notes

Start at `docs/glas-kaufhaus-render-expose/README.md`, then work through decision checklist in `03-decision-papers.md`.

## Loop 1 Retrospective

### What Worked

- Following runtime in domain order exposed true decision boundaries.
- Git branch inspection separated reusable story mechanics from monster assumptions.
- Documentation-only slice preserved exhibition runtime.

### What Was Confusing

- `camera` normalizes to `reference-image-actor`.
- `localMistral` is an alias for generic LM Studio-compatible transport.
- Three Good branches include parallel production commits rather than one perfectly linear ancestry.

### What To Improve Next Loop

- Give Qwen provider a truthful name.
- Replace fail-open person gate first.
- Add one combined local vision response before importing larger story changes.

### Process Decision

Stop for decision review. No commit without permission.

## Loop 2 Review

### What Changed

- Updated npm `semantic-stream` to exact version `3.0.5`.
- Added global title filtering for `doi` and `isbn` during stream initialization.
- Added a focused test proving filter options reach the npm module adapter.

### Verification Result

- 8 focused suites passed; 91 tests passed.
- Installed dependency resolves as `semantic-stream@3.0.5`.
- Deterministic installed-package smoke skipped DOI and ISBN titles and returned the next title.
- Tracked-file whitespace check passed.

### Limits

- No live Wikipedia request, model generation, camera run, or deployment run.
- npm package does not ship its repository test files, so package behavior was checked with the installed code and a local deterministic smoke.
- Existing unrelated dirty and generated files remain untouched.

## Loop 2 Retrospective

### What Worked

- Filtering at `initStreams` keeps DOI/ISBN rejection inside the npm module.
- Exact dependency pin makes exhibition installs reproducible.

### Next Action

Run one controlled Semantic Stream loop with exhibition words when live-network verification is wanted.

### Process Decision

No commit without permission.

## Loop 3 Review

### What Changed

- Added finite StoryTransport schema and controller.
- Separated configured topic words from Semantic Stream cues.
- Added people count, per-person position, and orientation fields.

### Acceptance Criteria Result

- [x] Configured word becomes `topic`.
- [x] Semantic responses remain separate `semanticCues`.
- [x] Two iterations carry previous final beat and opening obligation.
- [x] Previous state does not recursively embed its own history.
- [x] Two-person placement is represented structurally.

### Verification Result

1 suite passed; 2 tests passed.

### Issues / Gaps

- Runtime vision parser does not yet populate position/orientation.
- Scene planner does not yet receive or persist transport.

### User Demo Notes

Test demonstrates iteration 1 topic `Kaufhaus`, two visitor positions, then iteration 2 topic `1989` with iteration 1 final beat as opening obligation.

## Loop 3 Retrospective

### What Worked

- Pure controller made the two-iteration contract testable without camera, network, or paid render calls.

### What Was Confusing

- Existing visual frame transport and new narrative transport are separate responsibilities.

### What To Improve Next Loop

- Make runtime artifact show both current transport and previous bridge.

### Process Decision

Continue to runtime integration. No commit without permission.

## Loop 4 Review

### What Changed

- Vision prompt now requests one structured object per real visible person.
- Vision parser preserves people count, position, and orientation.
- Scene planner receives current topic, current person placement, and previous story bridge.
- Runtime saves one StoryTransport JSON per iteration and embeds it in scene-loop summaries.

### Acceptance Criteria Result

- [x] Two visible people remain separate actors.
- [x] Position and orientation survive vision parsing and summary.
- [x] Topic and previous final beat reach planner prompt.
- [x] Transport artifact naming is chronological and inspectable.
- [x] Existing scene rendering summary keeps transport metadata.

### Verification Result

5 suites passed; 96 tests passed. Syntax and tracked-file whitespace checks passed.

### Issues / Gaps

- No live Qwen, camera, Semantic Stream network request, paid render, sound, or deployment run.
- Dedicated final test still needed to prove two successive planner requests use transported state.

### User Demo Notes

Runtime writes `story-transport/iteration-0001.json`, then iteration 2 receives its compact final beat and obligation.

## Loop 4 Retrospective

### What Worked

- Structured actor JSON avoids guessing position from free prose.
- Planner sees narrative and spatial transport in one readable context string.

### What Was Confusing

- Transport is finalized after planning, before video rendering; artifact therefore represents planned story state.

### What To Improve Next Loop

- Verify two actual planner calls with deterministic mock responses.

### Process Decision

Continue to final verification. No commit without permission.

## Loop 5 Review

### What Changed

- Added deterministic two-planner-iteration integration test.
- Ensured custom vision prompt overrides also request structured actor placement.
- Completed broad focused regression and code-control review.

### Acceptance Criteria Result

- [x] `topic` comes from configured word input.
- [x] Semantic results stay separate cues.
- [x] People count, position, and orientation reach StoryTransport.
- [x] Iteration two receives iteration one's final beat and opening obligation.
- [x] One inspectable transport JSON is written per iteration.
- [x] Relevant regressions pass.
- [x] Existing unrelated dirty files remain untouched.

### Verification Result

- Dedicated StoryTransport suite: 4 tests passed, including exactly two planner calls.
- Focused regression: 11 suites passed; 122 tests passed.
- Node syntax checks passed for all changed runtime modules.
- Tracked and new-file whitespace checks passed.
- Installed dependency resolves as `semantic-stream@3.0.5`.
- Full unfiltered Jest run is not green because existing `MIX-again-freshweb.one-iteration.test.js` imports after Jest teardown and calls `process.exit(1)`; targeted affected suites remain green.

### Issues / Gaps

- No live Qwen, camera, Wikipedia, paid model, audio, deployment, or exhibition hardware run.
- StoryTransport artifact represents planned narrative state; it is created before video render completion.
- Process restart does not yet reload the latest transport artifact; in-process exhibition iterations are covered.

### User Demo Notes

Iteration 1 can contain two people at different positions. Iteration 2 receives the first final beat, current new people placement, stable topic word, and new Semantic Stream cues in one planner context.

## Loop 5 Retrospective

### What Worked

- Separate controller kept two-iteration behavior deterministic and free of paid calls.
- Mandatory placement appendix protects strict custom vision prompts from losing person positions.
- Finite previous bridge prevents transport JSON from growing recursively.

### What Was Confusing

- Full repository Jest command includes executable integration files with asynchronous module side effects.
- Narrative completion occurs at planning time while visual completion occurs after rendering.

### What To Improve Next Loop

- Add rendered/failed status update after final video completion if operational history must distinguish plan from completed film.
- Optionally restore latest StoryTransport artifact after process restart.

### Process Decision

Goal complete. Stop before commit and ask user.

## Loop 6 Review

### What Changed

- Reframed current goal as a real two-trailer exhibition run.
- Verified Mini connection, camera capture, and local Qwen vision path.
- Captured today's room at 1920x1080.
- Ran strict real-person check.

### Acceptance Criteria Result

- [x] Camera and private vision connection work.
- [x] Today's room frame was captured.
- [ ] Real user visible in frame.
- [ ] Two three-scene trippy trailers rendered.
- [ ] Two MP4s and proof frames verified.

### Verification Result

Camera capture succeeded three times. Reduced 960px images succeeded through Qwen3-VL. All three strict results: `PERSON_PRESENT: no`; visible evidence is ceiling lights, poles, and window, without face, torso, or human body.

### Issues / Gaps

- Camera points too high.
- Paid generation correctly not started.
- Existing unrelated dirty files remain untouched.

### User Demo Notes

Lower camera toward working area and stand visibly in frame. Then rerun person gate and start two iterations.

## Loop 6 Retrospective

### What Worked

- Strict person-only prompt corrected the broader vision model's false-positive interpretation of a clamp/pole.
- Hardware validation separated camera failure from framing failure.

### What Was Confusing

- General room analysis initially hallucinated a person where only equipment was visible.

### What To Improve Next Loop

- Use strict person gate before full room description and before any paid provider call.

### Process Decision

Blocked after three identical live checks. Resume same goal after today's real user is visibly framed.

## Loop 6 Resumed Review

### Acceptance Criteria Result

- [x] Current-Mac camera frame contains a real visible user.
- [x] Stable topic is `wort`.
- [x] Exactly two iterations rendered.
- [x] Each iteration contains three causal scenes.
- [x] Iteration two receives iteration one's final consequence.
- [x] Two MP4s and six proof frames are saved and technically verified.
- [x] Vision parser now preserves person position/orientation when Qwen appends commentary.

### Verification Result

- Two H.264 MP4s: 1088x832, 24 fps, 9 seconds each.
- Six successful Runware clips; total reported cost: USD 0.45.
- Focused vision and StoryTransport suites: 29 tests passed.
- Qwen person gate consistently found the user in the source frame.

### Honest Visual Review

- Real room and black-clad person remain visible anchors.
- Letter fragments and colored light grow across the two iterations.
- Result is dreamy and strange, but not yet maximally heavy/trippy.
- Person identity drifts in iteration two.
- Mirelo sound generation failed; both verified films are silent.

### Process Decision

Low-quality two-iteration proof complete. Stop before another paid render and let the user choose the artistic next step.

## Loop 7 Review

### What Changed

- Routed drift correction through Runware FLUX.1 Kontext Pro with two reference images.
- Rendered one exact 3–2–2 sequence as generation `798`.
- Saved exact WAN and FLUX payloads/responses, scene prompts, narrative transport, proof sheets, and a human-readable exact render report.

### Acceptance Criteria Result

- [x] Exactly three scenes.
- [x] Exact durations `3s, 2s, 2s`.
- [x] Three Runware WAN clips succeeded.
- [x] Previous story frame and camera-person anchor reached each internal transition correction.
- [x] Final film is exactly 7 seconds.
- [x] Exact prompts, image paths, model settings, responses, and costs are inspectable.
- [x] Visual review and known gaps are documented.

### Verification Result

- Source clips: 3.000s / 36 frames, 2.000s / 24 frames, 2.000s / 24 frames.
- Final: H.264, 1088x832, 12 fps, 84 frames, 7.000s.
- WAN cost: USD 0.175. FLUX cost: USD 0.12. Total: USD 0.295.
- Two proof sheets inspected: scene midpoints and eight frames around both cuts.
- Relevant adapter/generator regression before render: 48 tests passed; final Runware helper check: 11 tests passed.

### Issues / Gaps

- Live gate saw no current person five times; run used the latest verified person frame from the same session.
- One-line Markdown-fenced vision JSON still loses structured actor metadata in StoryTransport.
- Full-frame moderate drift correction resets too much of the generated visual story after scene 1.
- Generator creates one extra outgoing FLUX continuity still after final scene, even when max iterations is one.

### User Demo Notes

Open `merged/1787261298175-concat.mp4`, then compare `proof/scene-midpoints.jpg` and `proof/transition-frames.jpg`. Read `EXACT-RENDER-REPORT.md` for every call.

## Loop 7 Retrospective

### What Worked

- Runware Pro accepted exactly two references and removed FAL balance dependency.
- Exact duration override produced a real 3–2–2 structure without Taktmuster drift.
- JSON sidecars made provider cost and input transport verifiable.

### What Was Confusing

- Console says `Updated async persona reference`, although next-scene drift waits for the resulting reference before generation.
- Technical continuity improved while planned story escalation became visually weaker.

### What To Improve Next Loop

- Separate person correction from whole-frame story correction.
- Skip outgoing correction when no later sequence will render.
- Parse one-line fenced vision JSON as structured data.

### Process Decision

Goal complete. Stop before another paid render. No commit without user permission.

## Loop 8 Review

### What Changed

- Replaced actor-reference LRU behavior with FIFO behavior capped at ten images.
- Routed the exhibition preset to Runware FLUX.2 Flex (`bfl:6@1`).
- Removed unsupported FLUX.2 Flex diffusion controls after a live HTTP 400 response.
- Started fresh 3–2–2 generation `801`.

### Acceptance Criteria Result

- [x] FIFO capacity and ordering are covered by tests.
- [x] FLUX.2 Flex accepts three chronological references.
- [x] Scene 1 is exactly 3 seconds.
- [x] Scene 2 is exactly 2 seconds.
- [ ] Scene 3 is exactly 2 seconds.
- [ ] Final concat is exactly 7 seconds.

### Verification Result

- Focused implementation regression: 3 suites and 47 tests passed.
- FLUX.2 payload regression: 9 tests passed.
- Generation `801`: first clip 3.000s; second clip 2.000s; one successful FLUX.2 Flex correction.
- Scene 3 was not submitted after 35 consecutive `NO_PERSON` camera checks.

### Issues / Gaps

- User/person left the camera view before the second transition.
- Planner still favors room effects over explicit actor action.
- Fenced opening-vision JSON still records `visiblePeople: 0` in StoryTransport.

### User Demo Notes

Inspect `GENRATIONS-KAUFHAUF/801-glas-kaufhaus-3-2-2-fifo-actors-fixed/parts`. Resume with a person visibly framed; do not treat diagnostic generation `800` as the accepted run.

## Loop 8 Retrospective

### What Worked

- Live provider error exposed the exact unsupported FLUX.2 parameter.
- FIFO reference count grew visibly from the real camera history.
- Person absence stopped future scene progression without cancelling completed provider work.

### What Was Confusing

- The opening prompt saw a person while structured StoryTransport still reported zero because of fenced JSON parsing.

### What To Improve Next Loop

- Require explicit actor action in planner output.
- Fix fenced structured vision parsing.
- Complete one fresh run while a person remains in view through both transition captures.

### Process Decision

Pause for a visible camera person; GOAL remains incomplete. No commit.

## Loop 8 Resumed Review

### What Changed

- Limited person waiting to the opening gate.
- Running iterations now reuse the last valid FIFO camera reference immediately when a fresh shot has no person.
- Prevented duplicate fallback paths from consuming FIFO slots.
- Rendered complete generation `802`.

### Acceptance Criteria Result

- [x] Scene 1 is exactly 3 seconds and 36 frames.
- [x] Scene 2 is exactly 2 seconds and 24 frames.
- [x] Scene 3 is exactly 2 seconds and 24 frames.
- [x] Final concat is exactly 7 seconds and 84 frames.
- [x] FLUX.2 Flex FIFO calls contain 3, 4, and 5 references.
- [x] A missing later visitor can no longer pause the running iteration.

### Verification Result

- Runtime syntax check passed.
- Four focused suites passed; 52 tests passed.
- Three WAN clips and final H.264 concat passed `ffprobe` duration/frame checks.
- All three FLUX.2 Flex calls succeeded.

### Honest Visual Review

- Person identity and room remain stable.
- Visible action remains weak: mostly text overlays, light changes, mouth/eye movement, and little body action.

### Process Decision

No-mid-iteration-stop GOAL complete. Next loop should enforce actor action in planning. No commit.

## Loop 9 Review — Lost Audience

### What Changed

- Created `exhibition/lost-audience` from `origin/exhibition/person-fix-d6fab8c4--822-823` in a clean worktree.
- Added bounded descriptive visitor memory and return events with earlier camera-reference continuity.
- Persisted visitor state as `parts/visitor-memory.json`.
- Forced a First/Last destination for a new or returning visitor even when the planner selected single-image continuation.
- Routed returning-visitor interaction through the current semantic stream instead of a fixed social gesture.

### Verification Result

- Focused generator suite: 47/47 passed.
- Syntax and whitespace checks passed.
- Live one-iteration startup captured the opening persona frame and generated a three-scene semantic plan.
- First Runware video request returned insufficient available balance because credits were reserved by active requests; no scene video or concat was produced.

### Process Decision

Implementation is ready. Wait for provider balance, then rerun the finite command and verify the resulting concat. No commit.
