# Render Pipeline Exposé

## Story in One Sentence

Receive a real camera frame, confirm a visitor is present, understand visitor and room, collide semantic words into a scene sequence, render each scene from a controlled visual anchor, join clips, add sound, save enough evidence to explain what happened, then wait for the next encounter.

## Complete Iteration

```text
Preset
  -> model/runtime initialization
  -> semantic streams
  -> camera capture
  -> person gate
  -> visual description
  -> scene count and rhythm
  -> ordered source cues
  -> structured scene plan
  -> plan sanitation and artifact
  -> opening/start frame
  -> scene clip loop
       -> start-frame decision
       -> video-mode decision
       -> provider prompt
       -> WAN render
       -> normalize clip
       -> extract last frame
       -> optional drift repair
  -> concatenate clips
  -> Mirelo sound
  -> final artifacts
  -> stop or schedule next iteration
```

## Ownership Layers

| Layer | Question | Current owner |
|---|---|---|
| Control | What installation preset is active? | Shell presets in `lib/generator/adapter/` |
| Loop | When does another iteration run? | `semantic-stream.js` |
| Live context | What is visible now? | `LiveContextOrchestrator-runtime.js` |
| Story | What does each semantic cue cause? | `source-cues.js`, `scene-generator.js`, `webcam-defaults.js` |
| Render | Which frame, prompt, model, and duration produce each clip? | `generator.js`, `video-utils.js`, `init-models.js` |
| Continuity | What survives into the next scene? | `generator.js`, `drift-correction.js` |
| Post-production | How are clips and sound assembled? | `generator.js`, `mirelo-utils.js`, FFmpeg helpers |
| Evidence | How can a run be reconstructed? | JSON artifacts, prompts, frames, logs, `PostTo.js` |

## Step 0 — Resolve Installation Preset

### Input

Operator starts:

```sh
sh lib/generator/adapter/MIX-again-freshweb.prompt-fast-wan-strict-4-3.sh
```

### Decision

Shell defaults are layered. Earlier scripts export artistic and provider choices; later scripts fill only missing values.

### Action

Current chain:

```text
strict-4-3
  -> wan-trippy-4-3
  -> middle-cost-4-3
  -> node MIX-again-freshweb.js
```

### Output

Environment describes words, visual direction, scene rhythm, image/video dimensions, provider routing, drift behavior, camera behavior, and polling.

### Current stable facts

- `VIDEO_MODE_PRESET=storyDrivenMixed` survives from strict preset.
- Strict preset currently chooses prompt flavor `default`.
- Camera mode is exported as `camera`; runtime normalizes it to `reference-image-actor`.
- Person presence is required.
- First camera/person providers are named `localMistral`, an alias for current `lmstudio` adapter.
- Explicit FAL single-image video prevents continuous paid polling unless enabled.

### Source

- `MIX-again-freshweb.prompt-fast-wan-strict-4-3.sh`
- `MIX-again-freshweb.prompt-fast-wan-trippy-4-3.sh`
- `MIX-again-freshweb.middle-cost-4-3.sh`
- `normalizeStoryMode()` in `LiveContextOrchestrator-config.js`

## Step 1 — Initialize Output and Models

### Input

Resolved adapter configuration.

### Validation

Generator checks its output signature and initializes required model classes.

### Decision

Models are selected by normalized type names. First/last model is skipped when configuration forces image-to-video only. Video fallbacks remain lazy where possible.

### Action

`generator.setVersion()` imports Shorty Book, calls `Generator.init()`, creates or selects generation folder, then stores folder as `config.outputDir`.

`initModels()` initializes:

- Mirelo sound model.
- Primary first/last video model when needed.
- Primary single-image video model.
- Video fallback candidates.
- Base image model.
- Optional persona-reference image model.
- Optional opening FLUX Kontext model.
- Optional drift-correction model.

### Output

One `Generator` owns provider instances and one generation directory.

### Artifact

`info.json` records configuration. Generation commit index records source commit when available.

### Failure

If every candidate of a required video type fails initialization, startup fails. Recoverable fallback initialization errors are logged and kept lazy.

### Source

- `setVersion()` in `lib/generator/index.js`
- `Generator.init()` in `shorty-book/generator.js`
- `initModels()` in `shorty-book/init-models.js`
- `PostTo.checkSignature()` and `PostTo.handleNewSeries()`

## Step 2 — Initialize Semantic Streams and Enter Loop

### Input

Configured word/language pairs.

### Validation

Word stream initialization is cached by serialized word list. Failed initialization is removed from cache.

### Decision

One adapter config gets one model instance and one loop. Polling time determines whether loop ends, retries same failed prompt, or schedules fresh iteration.

### Action

`semantic-stream.js` imports Node package `semantic-stream`, calls `initStreams(words)`, then runs `config.promptFunktion(streams, config)` before `model.prompt(...)`.

### Output

Initialized semantic streams and one iteration boundary.

### Failure

- Failed model result may retain old prompt for retry.
- Polling plus `retryOnFailure` schedules retry.
- Zero polling with false result throws.

### Source

- `getWordStreams()`
- `_.getLoop()`
- `resolveLoopOutcome()`
- default export in root `semantic-stream.js`

## Step 3 — Capture Camera Frame

### Input

Camera dimensions, device, quality, warm-up, output folder, and optional fallback image.

### Decision

Configured protagonist URL, URL list, or image path wins. Otherwise capture live camera.

### Action

Live capture tries in order:

1. `node-webcam`
2. FFmpeg AVFoundation
3. `imagesnap`
4. configured static fallback

Image is rotated and resized with Sharp.

### Output

Absolute JPEG path plus source label.

### Failure

If every capture method fails and no fallback exists, iteration throws.

### Source

- `resolveConfiguredCameraImage()`
- `captureValidatedCameraShot()`
- `captureWebcamImage()`
- `getIamge()` in `lib/helper/getIamge.js`

## Step 4 — Gate on Real Person Presence

### Input

Captured frame.

### Validation

Vision prompt asks for exactly `PERSON_PRESENT` or `NO_PERSON` and excludes posters, artwork, screens, mirrors, statues, mannequins, and reflections.

### Decision

- Person present: continue.
- No person or unknown: wait and capture again.
- Provider error today: disable guard for remaining process and continue.

### Output

Accepted frame or repeated wait loop.

### Current risk

Fail-open error behavior contradicts installation rule that generation starts only for a real visitor.

### Proposed production behavior

Use Qwen3-VL directly at `127.0.0.1:8080`. Keep guard fail-closed: server error pauses and retries instead of bypassing person requirement.

### Source

- `DEFAULT_CAMERA_PRESENCE_PROMPT`
- `createCameraPresenceDetector()`
- `captureValidatedCameraShot()`

## Step 5 — Understand Person and Room

### Input

Accepted camera frame and vision prompt.

### Decision

Vision provider order comes from resolved webcam settings. Current helper accepts `localMistral` as alias for OpenAI-compatible `lmstudio` transport.

### Action

Vision request produces actor, setting, framing, lighting, location, description, and continuity text. Runtime summarizes this into `visionStoryContext` and keeps full text as opening continuity.

### Output

- Full vision response.
- Compact story context.
- Optional persisted persona reference.
- Vision JSON beside frames under `parts/vision-store/`.

### Current duplication risk

Presence detection, main frame description, and five-shot persona burst can call local vision repeatedly. On Qwen3-VL CPU timing around 28 seconds, this can delay one iteration by minutes.

### Proposed production behavior

One structured Qwen response per candidate frame should provide person presence, count, confidence/strength, person description, and room description. Reuse that response for gate, persona, and story context. Default burst count becomes one.

### Source

- `createWebcamFrameVision()`
- `createFrameVisionHelper()`
- `describeCameraPerson()`
- `captureBestPersonaReferenceShot()`
- `persistOpeningPersonaReference()`

## Step 6 — Resolve Scene Count and Rhythm

### Input

Explicit count/lengths or Taktmuster settings.

### Decision

If explicit scene count exists, use it. Otherwise Taktmuster emits next count and bias adjusts it. A separate Taktmuster emits per-scene length. Multiplier, bias, and minimum quality floor then apply.

Single-image camera scenes are capped by stability maximum.

### Output

Requested scene count and ordered duration list.

### Source

- `createTaktmusterRuntime()`
- `resolveSceneCount()`
- `refreshResolvedSceneLengths()`
- `applyRequestedSceneDurations()`

## Step 7 — Read Ordered Semantic Source Cues

### Input

Semantic streams and scene count.

### Decision

Current reference-image-actor mode forces sequential stream mixing. One cue is requested per scene.

### Action

`buildSourceCues()` invokes prompt creator repeatedly and returns ordered text cues.

### Output

One source cue per planned scene.

### Current weakness

Stable cues are ordered but do not explicitly serialize inherited anchor plus fresh collision.

### Trailer improvement

Good-1 adds collision cue records. Good-3 adds a timeout around `stream.getNext()`.

### Source

- Stable `source-cues.js`
- Good-3 `source-cues.js` at `eaed396b`

## Step 8 — Generate Structured Scene Plan

### Input

- Scene count and durations.
- Ordered source cues.
- Vision story context.
- Visual direction.
- Mode and prompt flavor.

### Validation

Planner requests JSON schema. Parsed scene count must equal requested count.

### Decision

Planner defines title, beat/story beat, start-frame source, video mode, fresh-image flag, camera-shot flag, still prompt, video prompt, motion cue, and camera cue.

### Action

`generateScenePlanWithFallback()` calls scene generator. If model returns fewer valid scenes, it may retry at smaller scene count. Other errors propagate.

### Output

Raw structured scene plan.

### Story rule today

Cues form ordered story spine. Each next scene should happen because of previous scene and leave visible residue.

### Trailer improvement

Good-1 makes collision cause, semantic action, and consequence explicit fields. Good-2 strengthens exact consequence handoff and chooses camera behavior after event.

### Source

- `createSceneGenerator()`
- `generateScenePlanWithFallback()`
- `DEFAULT_WEBCAM_CAMERA_SCENE_SYSTEM_PROMPT`

## Step 9 — Sanitize Plan and Save Evidence

### Input

Raw scene plan.

### Validation

Reference-image-actor invariants are checked and normalized:

- Scene 1 starts fresh and uses single-image mode.
- Later single-image scenes chain from previous last frame.
- Later first/last scenes start from previous last frame and receive fresh camera destination.
- Unsupported room changes and ungrounded entities are constrained.

### Action

Runtime applies video-mode defaults, sanitizes camera scene plan, applies provider durations, composes optional opening FLUX prompt, and saves snapshot artifact.

### Output

Applied scene plan used by generator.

### Artifacts

- `scene-generator.camera-snapshot.live-1.json`
- Console summary of cues, scene titles, modes, durations, and frame sources.

### Source

- `describeWebcamCameraScenePlanIssues()`
- `sanitizeWebcamCameraScenePlan()`
- `saveCameraSnapshotArtifact()`
- `saveWebcamScenePlanArtifact()`

## Step 10 — Resolve Opening Frame

### Input

Applied scene 1, opening camera/persona reference, optional Kaufhaus context image, previous run last frame, and opening strategy.

### Decision order

1. Reuse previous movie last frame when configured.
2. Generate opening FLUX Kontext frame when active.
3. Use provided opening image path.
4. Generate new still image.

### Output

Start frame with image path and prompt metadata.

### Source

- `promptSceneLoop()`
- `restorePreviousMovieLastFrame()`
- `resolveStartFrame()`
- `generateOpeningFluxContextFrame()`

## Step 11 — Render Every Scene Clip

### Input

Current start frame and scene plan entry.

### Decision A: start-frame source

Scene may use:

- Existing current frame.
- Previous WAN last frame.
- Fresh generated image.
- Fresh verified camera shot.
- FLUX-composed scene-context frame.
- Drift-corrected previous last frame.

### Decision B: video mode

- `singleImage`: one start image animates through image-to-video model.
- `firstLast`: start image plus generated/captured destination image drives first/last model.

### Action

1. Build scene context.
2. Resolve start frame.
3. Resolve video mode.
4. Build provider-facing prompt.
5. Quantize/cap duration for backend.
6. Render with primary video model.
7. Retry same clip when configured.
8. Try model fallbacks in order.
9. Normalize FPS, dimensions, and duration.
10. Optionally force destination image at clip end.
11. Extract last frame.
12. Optionally add per-scene Mirelo audio.
13. Save prompt artifact.
14. Hand last frame to next scene, optionally through drift correction.

### Output

One normalized MP4, one extracted last frame, prompt metadata, and next start frame.

### Artifacts

- `parts/*scene-XX*.mp4`
- `parts/*-last-frame.png`
- `parts/scene-prompts/XX-scene-prompt.json`
- Optional per-scene sound outputs.

### Failure

- Same clip retry preserves scene context.
- Provider fallback changes model, not story plan.
- Drift correction failure falls back to raw last frame.
- Opening/context FLUX failure falls back to existing start image.

### Source

- `continueSceneLoop()`
- `generateSceneClip()`
- `prepareVideoGeneration()`
- `generateVideoData()`
- `finalizeGeneratedVideo()`
- `resolveChainedStartFrameFromLastEnd()`

## Step 12 — Concatenate and Add Final Sound

### Input

Ordered rendered clips and all generated scene prompts.

### Validation

At least one clip must exist.

### Action

1. Concatenate multiple MP4 clips losslessly.
2. Probe total duration.
3. Save scene-loop summary.
4. If audio was not added per scene, join scene prompts and request one Mirelo track.
5. Mux video and audio.
6. Optionally pass final result to upload gate.

### Output

Concatenated silent video or final video with sound.

### Artifacts

- `merged/<timestamp>-concat.mp4`
- `<timestamp>-scene-loop.json`
- `<timestamp>-mirelo-video-sound.json`
- `merged/<timestamp>-with-sound.mp4`

### Failure

Mirelo request or mux failure returns original video rather than losing successful render.

### Source

- `finalizeSceneLoopResult()`
- `addMireloAudioAndUpload()`
- `concatMp4Lossless()`
- `muxVideoAndAudio()`

## Step 13 — End or Schedule Next Encounter

### Input

Generator success value and polling policy.

### Decision

- Polling zero: finish.
- Polling non-zero after success: schedule new iteration.
- Failure plus retry enabled: retry old prompt.
- Failure plus retry disabled: stop scheduling.

### Output

Completed iteration, scheduled next run, scheduled retry, or failed stop.

### Source

- `_.getLoop()` and `resolveLoopOutcome()` in root `semantic-stream.js`

## Proposed Hybrid Pipeline

Current structure remains, with four deliberate replacements:

```text
Current person gate
  -> one local Qwen3-VL analysis, fail-closed

Current sequential source cue
  -> inherited anchor + fresh semantic collision + timeout

Current generic scene residue
  -> explicit consequence baton from Good-2

Current monster re-entry idea
  -> generic visitor identity/room-confidence re-anchor
```

No Green Monster prompt, asset, focus, or identity lock enters hybrid path.

## Proposed Module Story

Future orchestration should be readable in this order:

```js
const cameraFrame = await captureVisitorFrame();
const liveContext = await analyzeVisitorAndRoom(cameraFrame);

if (!liveContext.personPresent) {
  return waitForVisitor();
}

const semanticCues = await advanceSemanticStory();
const scenePlan = await planVisitorStory({ liveContext, semanticCues });
const verifiedPlan = verifyScenePlan(scenePlan);
const renderedScenes = await renderSceneSequence(verifiedPlan);
const finalFilm = await finishFilm(renderedScenes);

return saveIterationEvidence(finalFilm);
```

This is narrative target, not current API.
