# Branch Source Map

## Functional Family

```text
preserved live exhibition snapshot (837d143a)
                 \
                  proven camera behavior
                   \
stable camera base (12711b06)
        |
        +-- trailer foundation (5299338c)
                    |
                    +-- Good-1 semantic storytelling (18e255a0)
                              |
                              +-- Good-2 narrative motion (352a336f)
                                        |
                                        +-- Good-3 protagonist re-entry (eaed396b)
```

Good branches contain parallel production/deploy commits, so this diagram describes functional progression, not strict ancestry of every commit.

## Preserved Exhibition Snapshot

Ref: `snapshot/freshweb-exhibition-animal-fries-2026-07-11`

Commit: `837d143a`

### What made it distinctive

- Real camera frame is stage, identity source, and room anchor.
- A person must be present before generation begins.
- Vision records visible actors, gaze, clothing, room geometry, and relations to artwork.
- `storyDrivenMixed` allows scene planner to choose single-image or first/last rendering.
- `ltxTrippy` permits semantic words to overtake plain webcam realism.
- Words were `exhibition animal | fries`.
- Camera/persona reference can be refreshed and used for drift repair.

### What snapshot commit itself changed

The preserved commit changed the strict preset words from generic exhibition terms to `exhibition animal | fries` and added operating notes. Most camera machinery already existed below it.

### Take forward

- Camera as visible truth.
- Person gate.
- Vision-grounded social story.
- `storyDrivenMixed` plus optional `ltxTrippy` intensity.

### Do not copy blindly

- Older runtime and provider behavior.
- Paid polling defaults.

## Stable Camera Base

Ref: `versions/glas-kaufhaus-shorty-book`

Commit: `12711b06`

### Improvements after snapshot fork

- Webcam capture and strict prompt fixes.
- Text-artifact suppression.
- Seen-90 continuity preset.
- Split protagonist reference from scene-context references.
- Renamed and modularized Live Context Orchestrator.
- Prevented unwanted reruns.
- Added self-hosted WAN test routing.
- Preferred ZeroGPU WAN space before paid FAL fallback.

### Current changes that reduced snapshot character

- Default words became `exhibition opening | people | artwork | point of view`.
- Strict preset changed prompt flavor from `ltxTrippy` to `default` because later trippy plans could collapse toward single-image behavior.
- Paid FAL polling became disabled by default.

### Take forward

Use this branch as implementation base. It owns live camera capture, person gate, vision grounding, scene loop, artifacts, provider fallback, and stable exhibition operation.

## Trailer Foundation

Ref: `versions/glas-kaufhaus-shorty-book--trailer`

Commit: `5299338c`

### Added architecture

- Kaufhaus dossier and location images.
- Semantic collision source cues.
- Compact multi-scene trailer runner.
- Scene-context FLUX composition.
- End-frame analysis and planned continuity.
- Planner-controlled start-frame strategy.
- Runware WAN 2.6 Flash video path.
- Collision transitions and end card.
- Rich console logging and dedicated generation folder.

### Hardcoded artistic assumption

Green Monster image is protagonist identity. Live webcam persona is disabled.

### Take forward

- Collision vocabulary.
- Compact plan schema.
- Explicit scene-start strategies.
- Location/context composition.
- Trailer artifacts and logging.

### Generalize first

Replace `monster` domain names and invariants with `camera protagonist`, `visible visitor`, or neutral `protagonist` concepts.

## Good-1: Semantic Storytelling

Ref: `trailer/good-1-semantic-storytelling`

Commit: `18e255a0`

### Main contribution

Semantic terms stop being decoration. Each scene receives an inherited anchor and a fresh collision. Their friction produces a physical action, scene consequence, and next story state.

### Useful mechanics

- Compact validated scene plan.
- Scene focus and scene-duration modules.
- Stronger source-cue-to-action mapping.
- Scene consequence carried downstream.
- Semantic Mirelo prompt variation.
- Sound toggle and recovery paths.
- Tests around scene planning, drift, duration, and audio.

### Monster coupling

- Canonical monster entry logic.
- Monster-visible and monster-free focus categories.
- Monster-specific prompt safety.

### Take forward

Semantic anchor/collision, causal story fields, duration rules, semantic sound, recovery.

### Reject or rename

Canonical monster identity and monster-only prompt rules.

## Good-2: Narrative Motion

Ref: `trailer/good-2-narrative-motion`

Commit: `352a336f`

### Main contribution

Next scene begins from exact visible consequence of previous scene: pose, object position, residue, light, and shadow. Camera/viewpoint is selected after physical event, reducing generic repeated motion.

### Useful mechanics

- Stronger narrative continuity.
- Motivated viewpoint and camera motion.
- Prompt compaction for FLUX limits.
- Photographic realism lock.
- Scene-focus refinements.

### Take forward

- Consequence baton.
- Event-before-camera decision order.
- Prompt-size guard.
- Optional photographic grounding.

### Decision required

Photographic realism may be structural, while dark thriller styling should remain selectable.

## Good-3: Protagonist Re-entry and Production Guarding

Ref: `trailer/good-3-protagonist-reentry`

Commit: `eaed396b`

### Main contribution

When monster leaves frame and later returns, runtime re-seeds canonical identity instead of trusting a monster-free end frame. Semantic Stream calls also receive a timeout. Visual lock becomes specifically 1983 practical effects.

### Useful mechanics

- Semantic `getNext` timeout, default 90 seconds.
- Explicit off-frame detection.
- Re-entry as a first-class continuity event.
- Strong 1983 material and camera vocabulary.

### Take forward

- Semantic timeout.
- Generic protagonist re-anchor concept: when a camera visitor disappears or identity confidence drops, use a fresh verified camera frame.

### Do not copy unchanged

- Monster detection vocabulary.
- Foam-latex monster realism lock.
- Forced 1983 look unless artist accepts it.

## Dependency Difference

| Ref | `semantic-stream` dependency |
|---|---|
| Snapshot | `^3.0.0` |
| Stable base commit `12711b06` | `^3.0.0` |
| Current working tree | `3.0.5` from npm, title filter `doi` + `isbn` |
| Trailer foundation | `^3.0.2` |
| Good-1 | `file:../semantic-stream` |
| Good-2 | `file:../semantic-stream` |
| Good-3 | `file:../semantic-stream` |

Good branches use a real Node module, but from a sibling local folder. Current working tree now chooses reproducible npm package `3.0.5`. Root orchestration passes `filter: ['doi', 'isbn']` into `initStreams`, so matching titles are consumed and skipped before reaching story planning.

## Recommended Extraction Order

1. Stable camera base remains running reference.
2. Add Good-3 semantic timeout independently.
3. Add Good-1 collision cue bundle and compact scene schema.
4. Generalize Good-1 story fields away from monster naming.
5. Add Good-2 consequence baton and event-before-camera ordering.
6. Add generic visitor re-anchor inspired by Good-3.
7. Add semantic Mirelo and recovery.
8. Decide visual period lock and external model routing last.
