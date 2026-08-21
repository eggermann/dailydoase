# Exact Render Report — Kaufhaus 3–2–2

This report records the actual inputs, prompts, model settings, outputs, and fallbacks used by generation `796`. It describes what happened, not only what was configured.

## Result

- Sequence: `The Retail Memory Awakens` → `Echoes of Terror` → `The Retail Flood`
- Shot durations: `3s, 2s, 2s`
- Final duration: `7.000s`
- Final video: `merged/1787260180929-concat.mp4`
- Video geometry: `1088 × 832`
- Frame rate: `12 fps`
- Frames: `84`
- Codec: `H.264`
- Audio: off
- Runware video cost: `$0.075 + $0.05 + $0.05 = $0.175`
- Drift correction: configured and called, but every FAL request failed with `403 Exhausted balance`; actual next-shot input therefore fell back to the raw previous last frame.

## Camera and image inputs

The live camera gate was tested immediately before this render. Because the person then left the live frame, this documented render froze the most recent real camera image:

`/Users/eggermann/Projekte/dailydoase/tmp/camera-probe/current-camera-2.jpg`

Persisted opening anchor:

`parts/opening-persona-reference.jpg`

Shot 1 start image:

`parts/opening-persona-reference.jpg`

Shot 2 intended inputs:

- Primary: `parts/1787260201058-runware-image-video-last-frame.png`
- Fresh person reference: `parts/1787260206404-persona-reference-scene-01.jpg`
- Drift result: unavailable because FAL rejected the request
- Actual start: raw `parts/1787260201058-runware-image-video-last-frame.png`

Shot 3 intended inputs:

- Primary: `parts/1787260230006-runware-image-video-last-frame.png`
- Fresh person reference: `parts/1787260232842-persona-reference-scene-02.jpg`
- Drift result: unavailable because FAL rejected the request
- Actual start: raw `parts/1787260230006-runware-image-video-last-frame.png`

## Semantic story input

Stable topic:

`wort`

Parallel topics:

`wort | terror | kaufhaus`

Actual semantic cues:

1. `dem Morphem Oldenbourg Grundriss der Geschichte eines Einzelhandelsgeschäfts, das Handelswaren aus Frankfurt am Main`
2. `ist diese Unterscheidung im Deutsches Wörterbuch Terror (Begriffsklärung) das Einzelhandelsgeschäft`
3. `, Flexion Einsatzgruppen der Sicherheitspolizei und des SD aus einer oder wenigen bestimmten Warengruppe(n) in hoher Handelsware`

Story model:

`gpt-4o-mini`

Exact vision prompt:

```text
Describe only the visible shot for continuity. Return concise labeled lines for Subject, Setting, Framing, Lighting, Location, Actors, Description, and what should stay consistent for the next video shot. Actors must be a JSON array with one object per real visible person using keys reference, description, position, and orientation. Use position to report depth and frame placement, for example foreground left, midground center, background right, or top center. Use orientation to report front-facing, side-facing, or back-facing. If two people are visible, return two separate actor objects. Do not include people shown only in posters, artwork, screens, mirrors, or reflections.
```

The complete exact scene-planner system prompt is stored without shortening in:

`scene-generator.camera-snapshot.live-1.json` → `scenePlanSystemPrompt`

The same artifact stores the exact vision response, source cues, raw model response, and sanitized applied scene plan. The current vision parser incorrectly reduced the response to a truncated Markdown-JSON fragment; therefore `storyTransport.people.count` became `0`, although the local presence/person detector correctly found the person.

## Story model response

### Shot 1 — The Retail Memory Awakens

- Beat: `A surreal light begins to swirl around the room, casting vivid colors that distort the space.`
- Story beat: `The room transforms as the colors awaken memories of a retail space, hinting at a deeper story.`
- Motion: `Colors swirl and pulse, creating a wave-like motion across the surfaces.`
- Camera: `The camera slowly pans to capture the full extent of the swirling colors.`
- Still prompt: `A vibrant swirl of colors envelops the room, with liquid paint-like textures flowing across surfaces.`
- Model video prompt: `Colors swirl and pulse, creating a dreamlike atmosphere in the room. The camera pans to reveal the vibrant transformation.`
- Model single-image prompt: `The room is alive with swirling, colorful lights that flow like liquid paint, creating a surreal and vivid scene.`

### Shot 2 — Echoes of Terror

- Beat: `The colors morph into shadowy figures that loom, representing the concept of terror in retail.`
- Story beat: `The transformation introduces a sense of fear and tension, as the once vibrant colors now represent lurking threats.`
- Motion: `The shadowy figures pulse and shift, creating an unsettling presence in the room.`
- Camera: `The camera zooms in on the figures, intensifying their menacing presence.`
- Still prompt: `Shadowy figures emerge from the swirling colors, their forms indistinct yet menacing.`
- Model video prompt: `The camera zooms in on shadowy figures that loom ominously, creating an unsettling atmosphere. The colors shift to darker tones, enhancing the tension.`
- Model single-image prompt: `Shadowy figures emerge from the vibrant colors, casting a menacing presence in the room.`

### Shot 3 — The Retail Flood

- Beat: `The shadows dissolve, and a flood of liquid light bursts forth, engulfing the room in a surreal spectacle.`
- Story beat: `The flood of light signifies a release from the previous tension, transforming the space into a vibrant spectacle.`
- Motion: `The liquid light flows and spreads, overtaking the room with its brightness.`
- Camera: `The camera pulls back to capture the entire room being engulfed by the liquid light.`
- Still prompt: `A flood of liquid light spills across the room, transforming everything in its path.`
- Model video prompt: `The camera pulls back as a flood of liquid light engulfs the room, transforming the atmosphere into a vibrant spectacle. The shadows dissolve into brightness.`
- Model single-image prompt: `A flood of liquid light spills across the room, transforming the space into a surreal and vibrant spectacle.`

## Exact prompts submitted to Runware

### Shot 1 — 3 seconds

````text
 Start from ```json { "Subject": "Self-portrait of a man", and let the image break away from plain webcam realism; keep the same real person. Let A surreal light begins to swirl around the room, casting take over the scene; the room warps, the light flickers, and the frame mutates like. Build the mood around A surreal light begins to swirl around the room,, while ```json { "Subject": "Self-portrait of a man", "Setting": stays just readable enough. Keep the source camera orientation unmirrored; preserve the real left-right layout from the source frame and avoid a mirrored selfie look. Keep the camera motion uneasy, unstable, and hallucinatory. 
````

### Shot 2 — 2 seconds

````text
 Keep the exact same real person as the saved webcam anchor image. Identity anchor from local vision: PERSON_PRESENT: yes
PERSON_STRENGTH: 95
Person wearing glasses, short-sleeved black top, smiling. Start from ```json { "Subject": "Self-portrait of a man", and let the image break away from plain webcam realism; keep the same real person. Let The colors morph into shadowy figures that loom, representing the take over the scene; the room warps, the light flickers, and the frame mutates like. Build the mood around The colors morph into shadowy figures that loom, representing, while ```json { "Subject": "Self-portrait of a man", "Setting": stays just readable enough. Keep the source camera orientation unmirrored; preserve the real left-right layout from the source frame and avoid a mirrored selfie look. Keep the camera motion uneasy, unstable, and hallucinatory. 
````

### Shot 3 — 2 seconds

````text
 Keep the exact same real person as the saved webcam anchor image. Identity anchor from local vision: PERSON_PRESENT: yes
PERSON_STRENGTH: 95
Person smiling with glasses, shirtless upper body, indoors. Start from ```json { "Subject": "Self-portrait of a man", and let the image break away from plain webcam realism; keep the same real person. Let The shadows dissolve, and a flood of liquid light bursts take over the scene; the room warps, the light flickers, and the frame mutates like. Build the mood around The shadows dissolve, and a flood of liquid light, while ```json { "Subject": "Self-portrait of a man", "Setting": stays just readable enough. Keep the source camera orientation unmirrored; preserve the real left-right layout from the source frame and avoid a mirrored selfie look. Keep the camera motion uneasy, unstable, and hallucinatory. 
````

These malformed `Start from ```json` fragments are an actual observed prompt bug caused by the truncated Markdown-JSON vision response. They are preserved here exactly.

## Exact video settings

Provider and model:

- Provider: `Runware`
- Model: `alibaba:wan@2.6-flash`
- Mode: single-image image-to-video
- Width: `1088`
- Height: `832`
- FPS: `12`
- Seed: `0`
- Randomize seed: `false`
- Audio: off
- Retry count: `0`
- Fallback models: none

Saved runtime configuration also contains legacy model fields:

- `steps: 8`
- `sampling_steps: 18`
- `guide_scale: 4`
- `shift: 5`
- `aspect_ratio: 4:3`

The actual Runware payload persisted per shot contains only `frameImages`, `prompt`, `duration`, `width`, `height`, and `seed`.

## Exact image and drift settings

General still-image model configuration:

- Type: `imageActorInScene`
- Model: `Qwen/Qwen-Image-Edit-2511`
- Provider: `fal-ai`
- Width: `640`
- Height: `480`
- Steps: `16`
- Guidance: `3`
- Seed: `0`
- Negative prompt: `blurry, low detail, warped anatomy, broken perspective`

Drift correction:

- Enabled: `true`
- Level: `moderate`
- Apply to chained single-image shots: `true`
- Apply to first-last shots: `false`
- Use fresh camera/person reference: `true`
- Context buffer: disabled
- Model: `black-forest-labs/FLUX.1-Kontext-dev`
- Provider: `fal-ai`
- Width: `1088`
- Height: `832`
- Steps: `24`
- Guidance: `3.4`
- Seed: `0`
- Negative prompt: `different person, different location, changed outfit, new props, distorted face, blurry, low detail`
- Actual result: failed for both transitions with `403 Forbidden — Exhausted balance`; raw last frames were used.

## Concatenation

- Later clips trim `0.125s` from the beginning to avoid repeated boundary frames.
- Each trimmed clip is re-timed back to its requested duration.
- Final target: exactly `7s`, `84` frames at `12fps`.
- Output: `merged/1787260180929-concat.mp4`

## Source artifacts

- `info.json`: complete resolved generator configuration
- `scene-generator.camera-snapshot.live-1.json`: exact scene-planner system prompt, vision input, semantic cues, raw and applied plans
- `story-transport/iteration-0001.json`: sequence memory passed toward the next iteration
- `parts/scene-prompts/*.json`: scene timing, frame source, generated prompt, and file mapping
- `parts/*runware-image-video.json`: exact Runware payload, task UUID, seed, cost, and response
- `parts/*persona-reference*.json`: exact local person-detector response
- `1787260180929-scene-loop.json`: final sequence summary
