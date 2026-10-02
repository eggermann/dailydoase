# Progress — Selfomat

## Loop 6 — Real one-iteration merged film

### Done

- Fixed runtime dotenv root resolution; explicit `FRESHWEB_DOTENV_PATH` is supported.
- Removed Emergency-Plan from live Selfomat scene-loop calls; planner/provider failure now remains visible instead of inventing scenes.
- Ran one real low-quality iteration with `gpt-5.6-terra`, Taktmuster scene rhythm, semantic words `love | animal | Casino`, First/Last enabled, Runware persona references, and MiniMax Music-3.
- Generated six causal scenes; First/Last transitions rendered through Runware after Cakegreen config failure.
- Generated merged H.264/AAC film with Music-3: `GENERATION-SELFIEBOX/40-011-selfomat-intense-causal-low-quality-firstlast-gpt56terra-runware-ref/merged/1790926269843-with-minimax-sound.mp4`.
- Verified 16.01s duration, 1088x832, 8fps, H.264 video plus AAC audio.
- Verified root and nested HTML logs, six scene prompt JSON files, StoryTransport, Music-3 MP3/blueprint, and final mux metadata.

### Verification

- Focused config, scene-generator, and prompt-log suites: 3 suites, 22 tests passed.
- `git diff --check` passed.

## Loop 5 — Iteration structure trace

### Done

- Added one explicit `Iteration structure` block to the Selfomat TXT/HTML prompt log.
- Logged ordered stages: input, vision/assets, semantic stream, Taktmuster allocation, GPT scene planner, render prompts, and StoryTransport.
- Preserved semantic `title`, `cnt`, `prev`, and `next` as planner trace data; `cnt` remains a counter only.
- Passed structured vision context into the logger so person/location asset anchors are visible in the stage map.

### Verification

- Focused log and source-cue suites: 2 suites, 13 tests passed.
- JavaScript syntax checks and `git diff --check` passed.

### Limits

- No external image/model render was run.
- Existing dirty source and generated artifacts were preserved.

## Loop 4 — One-iteration semantic decision trace

### In Progress

- Replace scene-count-coupled semantic sampling with configurable source-cue count.
- Carry planner creative decisions and final next-word reason into StoryTransport.
- Extend colored HTML/TXT trace with runtime config and exact decision provenance.

### Acceptance Target

- One local/mock iteration produces 8 raw cues, 3 scenes, separate image prompts, and `completedTransport.nextTopic` equal to planner-selected final `nextWord`.
- No external visitor image upload required.

### Verification

- Focused Selfomat/planner/transport/log suites: 5 suites, 42 tests passed.
- Local mock artifact: `GENERATION-SELFIEBOX/4-selfomat-one-iteration-semantic-decision/selfomat-prompt-log/iteration-0001.html` and `.txt`.
- Artifact proves 8 cues, 3 scenes, `shelter` selected by final planner decision, and `planner-final-creative-decision` source.
- Full repository suite intentionally stopped: unrelated live tests require missing OpenAI key and native `sharp`; several tests also launch large FFmpeg fixture joins.

## Loop 2 — Image-Only Starter-Photo Series

### In Progress

- Run bounded Selfomat iterations from sequential queued selfies.
- Feed `love,en | animal,en` concurrently into Semantic Stream.
- Verify one generated starter photo per input, with no video call and no last-video-frame reference.
- Added readable per-iteration `selfomat-prompt-log/iteration-NNNN.txt` including vision, semantic inputs, FIFO context, planner prompts, and final render prompts.
- Passed 4 focused suites and 22 tests for prompt logging and Selfomat behavior.
- Passed focused Selfomat and StoryTransport tests: 2 suites, 16 tests.

### Blocked

- Previous video run reached planning but Runware rejected video with HTTP 400 insufficient credits. New image-only mode bypasses video/audio initialization and generation.
- Reduced cast-context identity drift with explicit lead-face anchoring and stronger negatives; focused generator/Selfomat regression passed: 2 suites, 45 tests.

## Done

- Created isolated `openStudios26/selfomat` branch from `exhibition/1928ee42-2iter`.
- Read generator path, StoryTransport, cast rendering, preset, tests, and previous project memory.
- Initialized Selfomat project brief.
- Added an opt-in Selfomat scene adapter, preset, and phone-specific image/video prompt path.
- Passed six focused suites and 107 tests; syntax and whitespace checks passed.
- Reviewed the branch diff without changing the existing production preset.
- Added people-chain selection: recent-to-old temporal handoff, semantic override, one optional extra returner, and an archived FIFO tail.
- Passed five focused suites and 94 tests after the people-chain extension.

## In Progress

- Image-only starter-photo preset and regression coverage.
- Nested StoryTransport-to-MiniMax Music 3 slice is complete.

## Current Blocker

- Child subgoal `002-merged-film` has a real video run prepared, but it is paused before external egress. A genuine film requires sending the local test selfie and prompts to configured external vision/image/video providers and may incur provider charges. Explicit user authorization is required.

## Audio Slice Handoff

- `story-music/iteration-0002.mp3` exists beside the requested StoryTransport artifact.
- It is 60.070 seconds, stereo, 44.1 kHz; the WAV source and JSON blueprint are beside it.
- Four focused story-music tests pass.
- No audio is muxed into films yet.

## Next

- Supervised live-camera/model test with a current visitor, a recent previous visitor, and an archived visitor; inspect rendered identity, cast count, and accidental-selfie style.
- Listen to the standalone MP3 before deciding on future film/audio integration.

# Prior Progress (retained)

## Done

- Chosen current branch as required working branch.
- Preserved unrelated dirty work.
- Traced shell entry chain.
- Traced Semantic Stream orchestration loop.
- Traced camera capture, person gate, vision, planning, scene rendering, continuity, concatenation, and Mirelo stages.
- Inspected Good-1, Good-2, and Good-3 branch deltas.
- Wrote HRNF render pipeline exposé.
- Wrote branch source map.
- Wrote eleven decision papers.
- Wrote source and verification ledger.
- Verified six focused suites and 84 tests.
- Verified document links, Git refs, and whitespace.
- Updated npm `semantic-stream` from `^3.0.0` to exact `3.0.5`.
- Added case-insensitive DOI and ISBN title filtering at stream initialization.
- Added and passed filter-forwarding test plus installed-module smoke.
- Added pure StoryTransport schema and controller.
- Verified configured word remains topic while Semantic Stream responses remain cues.
- Verified two deterministic iterations carry prior final beat and two detected person positions without recursive state growth.
- Extended default vision prompt to request structured person position and orientation.
- Extended vision parser and summary with `peopleCount`, position, and orientation.
- Passed StoryTransport into scene planner and scene-loop summary.
- Added chronological `story-transport/iteration-NNNN.json` artifacts.
- Verified two successive planner calls: iteration two contains iteration one's topic, final beat, and opening obligation.
- Verified custom vision prompt overrides still receive structured actor-placement requirements.
- Passed 11 focused suites and 122 tests.
- Completed syntax, whitespace, dependency, and diff-scope review.
- Started Loop 6 for today's live two-trailer exhibition story.
- Verified Tailscale, SSH, Mac-mini camera, and private Qwen3-VL server connectivity.
- Captured today's 1920x1080 live frame.
- Strictly verified that current frame contains no real person.
- Repeated live capture and strict Qwen person gate; second current frame also contains no person.
- Completed third independent capture and strict person check; same ceiling-only physical blocker confirmed.
- Switched today's development source to the current Mac camera as instructed.
- Captured and saved the current exhibition-room frame through Photo Booth.
- Strict local-frame check found no visible person yet.
- Captured a new 944x566 current-Mac camera frame with one real person in the exhibition room.
- Qwen3-VL strictly returned `PERSON_PRESENT` and described the person as midground center, back-facing, in a black tank top.
- Rendered exactly two iterations with three 3-second scenes each using `alibaba:wan@2.6-flash`.
- Verified two H.264 MP4s: 1088x832, 24 fps, 9 seconds each.
- Verified iteration two receives iteration one's final consequence and opening obligation.
- Extracted six proof frames and two contact sheets.
- Fixed vision JSON parsing when Qwen appends commentary after a valid JSON object.
- Passed 29 focused vision and StoryTransport tests.
- Rendered generation `798` as one exact 3–2–2 sequence.
- Verified three WAN clips at 3.000, 2.000, and 2.000 seconds.
- Verified final H.264 concat at 7.000 seconds, 1088x832, 12 fps, and 84 frames.
- Verified three Runware FLUX Kontext Pro calls with two references each.
- Recorded reported model cost of USD 0.295.
- Generated midpoint and cut-boundary proof sheets.
- Wrote `EXACT-RENDER-REPORT.md` with prompts, settings, call mapping, costs, artifacts, and honest visual review.

## In Progress

- None for Loop 8.

## Next

- Require visible actor action or actor interaction in scene planning without rejecting atmosphere/effect content.
- Fix fenced opening-vision JSON so StoryTransport records the visible person.
