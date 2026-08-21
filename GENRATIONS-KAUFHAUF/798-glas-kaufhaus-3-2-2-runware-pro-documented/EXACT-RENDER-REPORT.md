# Exact Render Report — Kaufhaus 3–2–2 / Runware Pro

This report records generation `798` as rendered on 20 August 2026. It distinguishes configured intent, submitted provider calls, saved artifacts, and visual result.

## Verified result

- Sequence: `The Whispering Words` → `Terror of the Unseen` → `Flood of Memories`
- Scene durations: `3s → 2s → 2s`
- Final duration: `7.000s`
- Final film: `merged/1787261298175-concat.mp4`
- Video: H.264, `1088 × 832`, `12 fps`, `84 frames`
- Audio: off
- Three source clips: `36 + 24 + 24` frames
- Three WAN calls succeeded: `$0.075 + $0.05 + $0.05 = $0.175`
- Three FLUX Kontext Pro calls succeeded: `$0.04 × 3 = $0.12`
- Total reported model cost: `$0.295`

The first two Kontext stills transport one scene into the next. The third still prepares an outgoing continuity frame after scene 3 for a possible later sequence; it is not used inside this 7-second film.

## Camera source and person gate

The initial live-camera attempt returned `NO_PERSON` five times, so no paid call started. The documented run then used the latest verified real camera image from the same session:

`/Users/eggermann/Projekte/dailydoase/tmp/camera-probe/current-camera-2.jpg`

Persisted opening anchor:

`parts/opening-persona-reference.jpg`

Transition person checks succeeded:

1. After scene 1: `PERSON_PRESENT: yes`, strength `98`, glasses, short hair, smiling slightly.
2. After scene 2: `PERSON_PRESENT: yes`, strength `95`, glasses, black tank top.

The opening vision response contains one front-facing person at `Foreground center`, but its Markdown-fenced one-line JSON was reduced to truncated prose by the current parser. Therefore `storyTransport.people.count` incorrectly records `0`. Transition person checks still found and used the person. This is a metadata bug, not evidence that the source image lacks a person.

## Semantic and narrative input

- Stable story topic: `wort`
- Parallel semantic topics: `wort | terror | kaufhaus`
- Story arc: words appear → words become threatening shadows → shadows burst into memories
- Story model: `gpt-4o-mini`
- Full semantic cues, vision response, planner prompt, raw plan, and applied plan: `scene-generator.camera-snapshot.live-1.json`
- Finite narrative memory: `story-transport/iteration-0001.json`

## Scene 1 — The Whispering Words — 3 seconds

- Start frame: `parts/opening-persona-reference.jpg`
- Narrative beat: words begin taking form around the man.
- WAN output: `parts/1787261317765-runware-image-video.mp4`
- WAN response: `parts/1787261317765-runware-image-video.json`
- Cost: `$0.075`

Exact submitted WAN prompt:

```text
 Start from ```json { "Subject": "Self-portrait of a man", and let the image break away from plain webcam realism; keep the same real person. Let A cascade of words begins to swirl around the man, take over the scene; the room warps, the light flickers, and the frame mutates like. Build the mood around A cascade of words begins to swirl around the, while ```json { "Subject": "Self-portrait of a man", "Setting": stays just readable enough. Keep the source camera orientation unmirrored; preserve the real left-right layout from the source frame and avoid a mirrored selfie look. Keep the camera motion uneasy, unstable, and hallucinatory.
```

Transition 1:

- Primary story reference: `parts/1787261317765-runware-image-video-last-frame.png`
- Camera/person reference: `parts/1787261321117-persona-reference-scene-01.jpg`
- FLUX result and exact prompt: `parts/1787261329526-image-actor-in-scene.png` and `.json`
- Model: Runware FLUX.1 Kontext Pro, `bfl:3@1`
- References: `2`
- Output dimensions: `1184 × 880`
- Cost: `$0.04`
- This corrected still becomes scene 2's actual start frame.

## Scene 2 — Terror of the Unseen — 2 seconds

- Start frame: `parts/1787261329526-image-actor-in-scene.png`
- Narrative beat: words transform into shadows and introduce terror.
- WAN output: `parts/1787261348748-runware-image-video.mp4`
- WAN response: `parts/1787261348748-runware-image-video.json`
- Cost: `$0.05`

Exact submitted WAN prompt:

```text
 Keep the exact same real person as the saved webcam anchor image. Identity anchor from local vision: PERSON_PRESENT: yes
PERSON_STRENGTH: 98
Person wearing glasses, short hair, smiling slightly in a well-lit indoor setting. Start from ```json { "Subject": "Self-portrait of a man", and let the image break away from plain webcam realism; keep the same real person. Let The atmosphere shifts as the words morph into shadows, creating take over the scene; the room warps, the light flickers, and the frame mutates like. Build the mood around The atmosphere shifts as the words morph into shadows,, while ```json { "Subject": "Self-portrait of a man", "Setting": stays just readable enough. Keep the source camera orientation unmirrored; preserve the real left-right layout from the source frame and avoid a mirrored selfie look. Keep the camera motion uneasy, unstable, and hallucinatory.
```

Transition 2:

- Primary story reference: `parts/1787261348748-runware-image-video-last-frame.png`
- Camera/person reference: `parts/1787261351698-persona-reference-scene-02.jpg`
- FLUX result and exact prompt: `parts/1787261361674-image-actor-in-scene.png` and `.json`
- Model: Runware FLUX.1 Kontext Pro, `bfl:3@1`
- References: `2`
- Output dimensions: `1184 × 880`
- Cost: `$0.04`
- This corrected still becomes scene 3's actual start frame.

## Scene 3 — Flood of Memories — 2 seconds

- Start frame: `parts/1787261361674-image-actor-in-scene.png`
- Narrative beat: shadows burst into a flood of memories.
- WAN output: `parts/1787261382410-runware-image-video.mp4`
- WAN response: `parts/1787261382410-runware-image-video.json`
- Cost: `$0.05`

Exact submitted WAN prompt:

```text
 Keep the exact same real person as the saved webcam anchor image. Identity anchor from local vision: PERSON_PRESENT: yes
PERSON_STRENGTH: 95
Person wearing glasses, black tank top, indoors with partial reflection of surroundings. Start from ```json { "Subject": "Self-portrait of a man", and let the image break away from plain webcam realism; keep the same real person. Let The shadows burst into a flood of vibrant memories, transforming take over the scene; the room warps, the light flickers, and the frame mutates like. Build the mood around The shadows burst into a flood of vibrant memories,, while ```json { "Subject": "Self-portrait of a man", "Setting": stays just readable enough. Keep the source camera orientation unmirrored; preserve the real left-right layout from the source frame and avoid a mirrored selfie look. Keep the camera motion uneasy, unstable, and hallucinatory.
```

Outgoing continuity still:

- Primary: `parts/1787261382410-runware-image-video-last-frame.png`
- Result and exact call: `parts/1787261393295-image-actor-in-scene.png` and `.json`
- Cost: `$0.04`
- Not included in final 7-second concat.

## Exact provider settings

WAN video:

- Provider: Runware
- Model: `alibaba:wan@2.6-flash`
- Mode: single-image image-to-video
- Dimensions: `1088 × 832`
- Frame rate after normalization: `12 fps`
- Durations: `3, 2, 2`
- Seed: `0`
- Audio: off
- Retry count: `0`
- Fallbacks: none

FLUX drift correction:

- Provider: Runware
- Model: FLUX.1 Kontext Pro, `bfl:3@1`
- Level: `moderate`
- References: previous generated end frame + camera/person anchor
- Actual supported dimensions: `1184 × 880`
- Seed: `0`
- Context buffer: off
- Camera reference: on
- Exact positive prompts, data-URI inputs, task UUIDs, image URLs, seeds, and costs are preserved in each `parts/*image-actor-in-scene.json`.
- Config still records steps `24`, guidance `3.4`, and a negative prompt. Kontext Pro does not accept those Dev-only diffusion controls, so the Runware adapter correctly omits them from actual Pro payloads.

## Concatenation

- Later clips trim their first `0.125s` to avoid repeated boundary frames.
- Each trimmed clip is re-timed to its requested duration.
- Final target and verified result: `7.000s`, `84` frames, `12 fps`.
- Concat input list: `merged/concat.txt`

## Visual review

- Person identity and room geometry remain strong across all three scenes.
- Scene 1 visibly introduces typographic word material.
- Both cut boundaries are technically clean and keep matching geometry.
- Moderate FLUX correction pulls scenes 2 and 3 strongly back toward camera realism.
- Result preserves person better than generation `796`, but visual story escalation is weaker: shadows and memory flood are much less visible than the planner describes.
- Next artistic tuning should reduce re-anchor strength or apply correction only to person regions, not replace the whole visual consequence.

Proof images:

- `proof/scene-midpoints.jpg`
- `proof/transition-frames.jpg`

## Artifact index

- `info.json`: resolved runtime configuration
- `scene-generator.camera-snapshot.live-1.json`: vision, semantics, exact planner prompt, raw plan, applied plan
- `story-transport/iteration-0001.json`: narrative transport
- `parts/scene-prompts/*.json`: exact start frame, prompt, duration, and video mapping per scene
- `parts/*runware-image-video.json`: exact WAN payload and response
- `parts/*image-actor-in-scene.json`: exact FLUX payload and response
- `1787261298175-scene-loop.json`: final sequence summary
- `merged/1787261298175-concat.mp4`: final film
