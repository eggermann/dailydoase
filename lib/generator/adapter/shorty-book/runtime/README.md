# Runtime modules

`LiveContextOrchestrator-runtime.js` is the process entrypoint. It wires the
providers together and starts the semantic-stream loop.

Modules in this directory own one runtime concern each:

- `config.js` — environment parsing, model selection, and the shared runtime
  configuration object.
- `scene-rhythm.js` — takt pattern, scene count, scene lengths, duration caps.
- `scene-loop-log.js` — human-readable runtime summary for one planned loop.
- `story-iteration.js` — one opening image, Vision description, semantic cues,
  and StoryTransport preparation.
- `media-providers.js` — image/video provider payloads and prompt callbacks.
- `camera-input.js` — queued, local, remote, or captured image selection plus
  scene-context image loading.
- `camera-session.js` — person gate, camera validation, queue consumption, and
  opening-reference lifecycle.
- `providers.js` — composition of scene generator, media providers, and camera
  session.
- `loop-config.js` — drift-correction and scene-loop contracts.
- `scene-loop.js` — scene planning, reality-intrusion replanning, and render
  context updates.
- `artifacts.js` — camera/scene-plan artifact persistence.
- `scene-rhythm.test.js` and `story-iteration.test.js` — pure contract tests;
  they do not start the live loop or call a provider.

`LiveContextOrchestrator-runtime.js` remains the 331-line composition root: it
connects these modules to the generator and contains no large domain
implementation.
Keep new modules dependency-injected so tests can run without starting the live
loop or contacting a provider.
