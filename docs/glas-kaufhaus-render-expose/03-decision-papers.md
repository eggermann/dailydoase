# Decision Papers

Each paper can be accepted, changed, or rejected independently. Status describes current agreement, not implementation state.

## DP-001 — Implementation Base

Status: **Accepted by user**

### Context

Stable branch contains proven live camera and exhibition runtime. Trailer branches contain richer story mechanics but replace camera visitor with fixed Monster and Kaufhaus references.

### Decision

Implement on `versions/glas-kaufhaus-shorty-book`, commit `12711b06`. Import selected behavior stage by stage. Do not merge an entire trailer branch.

### Why

Camera capture, person gating, visible-room grounding, identity handling, output organization, and operational history remain intact.

### Consequences

- More deliberate extraction work.
- Lower risk of hidden monster assumptions.
- Every imported behavior needs focused tests.

### Acceptance checks

- Existing strict camera tests stay green.
- No Green Monster path becomes required.
- One iteration can still start from a real camera frame.

## DP-002 — Protagonist and Location Source

Status: **Accepted in concept**

### Context

Snapshot used visible visitor and room as story truth. Trailer used separate Monster identity and Kaufhaus photos.

### Decision

Camera snapshot is canonical source for:

- Current visitor identity.
- Current visitor pose and relation to others.
- Current Kaufhaus geometry.
- Current exhibition light and objects.

Optional static Kaufhaus photographs may repair geometry, but may not replace current camera truth.

### Consequences

Planner must distinguish identity, room, and semantic mutation inside one source image. Re-anchor must preserve visitor and room together.

### Acceptance checks

- Generated opening visibly derives from accepted camera frame.
- No default Monster asset is loaded.
- Room remains recognizable after three scenes.

## DP-003 — Local Person Gate

Status: **Accepted in concept; implementation pending**

### Context

Final app runs on Mac mini. Qwen3-VL-2B is available through private llama.cpp server at `127.0.0.1:8080`. Current provider alias points to LM Studio conventions and guard disables itself after one provider error.

### Decision

Add explicit local Qwen/OpenAI-compatible provider. Production calls loopback directly; development Mac may use SSH/Tailscale tunnel. Person gate fails closed.

### Required response

```text
PERSON_PRESENT: yes|no
PERSON_COUNT: integer
PERSON_STRENGTH: 0-100
PERSON_DESCRIPTION: concise visible description
ROOM_DESCRIPTION: concise visible room geometry
```

### Failure policy

- No person: wait, then capture again.
- Unknown response: treat as no person.
- Server unavailable: log, wait, retry health and inference.
- Never silently disable gate.

### Timing defaults to test

- Request timeout: 60 seconds.
- Empty-frame wait: 5–10 seconds.
- One analysis call per candidate frame.
- Persona burst: one frame initially.

### Acceptance checks

- Poster or mannequin returns no person.
- One real visitor returns person present.
- Server outage never starts generation.
- Same response supplies gate and story context.

## DP-004 — Semantic Story Unit

Status: **Proposed**

### Context

Stable branch produces ordered cues. Good-1 creates stronger causal collisions.

### Decision

Each scene receives:

```text
inherited anchor
+ fresh semantic term
-> visible action
-> local room response
-> visitor choice/reaction
-> lasting consequence
```

Consequence becomes next scene anchor. Terms should not appear merely as labels or literal props.

### Alternatives

1. Keep stable sequential cue text only.
2. Use Good-1 collision records and generalize monster fields. **Recommended.**
3. Ask one model to invent complete story from all words without incremental stream state.

### Consequences

Story becomes explainable per scene. Prompt artifact can show exact semantic cause.

### Acceptance checks

- Every scene artifact records anchor and collision.
- Every scene has concrete visible action and consequence.
- Adjacent scenes are causally connected.
- No scene falls back to generic exhibition coverage.

## DP-005 — Scene Continuity and Re-anchor

Status: **Proposed**

### Context

Good-2 carries exact consequence. Good-3 re-seeds Monster after off-frame absence. Camera installation needs same class of decision without Monster vocabulary.

### Decision

Carry from previous scene:

- Visitor pose and position.
- Object placement.
- Light direction and exposure state.
- Material residue or local transformation.
- Camera/viewpoint state.

Use previous WAN last frame while confidence remains sufficient. Request fresh verified camera frame when visitor identity or room geometry becomes unreliable.

### Re-anchor options

- Fixed interval, such as every third scene.
- Planner decision based on scene transition.
- Vision confidence check against canonical camera frame. **Recommended after first simple interval implementation.**

### Acceptance checks

- Scene 2 visibly starts from scene 1 consequence.
- Re-anchor never introduces another visitor.
- Camera frame refresh does not reset story consequence without an explicit transition.

## DP-006 — Event Before Camera Motion

Status: **Proposed from Good-2**

### Context

Generic camera verbs can repeat and dominate story.

### Decision

Planner order:

1. Resolve semantic collision.
2. Decide visitor action.
3. Decide room consequence.
4. Decide what viewer needs to see.
5. Choose one camera behavior.

Camera behavior is result, not starting template.

### Acceptance checks

- Adjacent scenes avoid same dominant motion unless story needs it.
- Camera cue explains how it reveals event.
- No visible camera device or operator is invented.

## DP-007 — Visual Period Style

Status: **Decision required**

### Context

Good-2 adds photographic realism. Good-3 forces 1983 practical-effects look. Original request referenced BRD television trailer 1989.

### Options

1. **1989 BRD television trailer** — period broadcast texture, documentary-commercial language.
2. **1983 practical dark fantasy** — Good-3 grain, fluorescent practicals, handmade effects.
3. **Current camera realism** — present-day live installation image with semantic transformation.
4. **Selectable preset** — shared structure with style profile switch. Recommended for continued artistic comparison.

### Structural rule independent of choice

Real Kaufhaus geometry and camera visitor remain source truth. Style may change texture, light, movement, and grading, not identity or room topology.

### Acceptance checks

- Style profile appears once in control preset.
- Story planner does not hardcode period vocabulary.
- Provider prompts receive selected style consistently.

## DP-008 — Video and Image Providers

Status: **Decision required after prototype**

### Current stable path

- Video: explicit FAL WAN turbo single-image and FAL WAN first/last.
- Presence: local OpenAI-compatible vision alias.
- Drift/opening: FLUX Kontext configuration.

### Trailer path

- Image/context: Runware FLUX Kontext `bfl:3@1`.
- Video: Runware WAN 2.6 Flash `alibaba:wan@2.6-flash`.
- Sound: Mirelo with Runware fallback.

### Options

1. Stable providers first, change story only.
2. Runware trailer providers immediately.
3. Provider-neutral interfaces plus A/B preset. **Recommended.**

### Acceptance checks

- Story artifact identical before provider routing.
- Provider failure cannot regenerate a different story plan silently.
- Prompt, request model, response, duration, and output file remain logged.

## DP-009 — Camera Image Privacy Boundary

Status: **Decision required before public exhibition**

### Context

Qwen person check can remain fully local. External FLUX/WAN calls may still upload raw or derived visitor frames.

### Options

1. Allow raw camera frame to external provider with installation consent.
2. Locally transform/anonymize before external upload.
3. Keep raw frames local and use self-hosted image/video generation.
4. Send only text description; lose exact visitor mixing.

### Required decision record

- What leaves Mac mini.
- Which provider receives it.
- How long local and remote artifacts persist.
- How visitors are informed.

### Acceptance checks

- Runtime logs privacy class for every outbound image.
- No hidden provider fallback changes privacy class.
- Operator can disable external camera-image upload with one preset flag.

## DP-010 — Semantic Stream Packaging

Status: **Accepted and implemented in working tree**

### Context

Stable commit uses `semantic-stream ^3.0.0`; trailer foundation uses `^3.0.2`; Good branches use sibling dependency `file:../semantic-stream`.

### Decision

Pin published npm package exactly at `semantic-stream 3.0.5`. Initialize streams with case-insensitive title filters `doi` and `isbn`.

```js
initStreams(words, {
  filter: ['doi', 'isbn'],
});
```

Matching titles are consumed and skipped; next non-matching title continues semantic story.

### Acceptance checks

- Fresh install resolves same implementation.
- Installed package reports version `3.0.5`.
- Application tests verify filter options reach module.
- Deterministic installed-module smoke skips DOI and ISBN titles.
- Runtime contains no duplicate semantic traversal implementation.
- Good-3 `getNext` timeout remains separate future extraction.

## DP-011 — Sound Strategy

Status: **Proposed**

### Options

1. Mirelo after each clip.
2. Mirelo once after concatenation. Recommended baseline.
3. Silent exhibition mode.

### Recommendation

Use final-only sound first. Build one sound prompt from semantic collisions and scene consequences. Keep silent fallback if Mirelo fails.

### Acceptance checks

- Video survives sound failure.
- Sound prompt records scene progression.
- Final duration matches concatenated film.

## Decision Checklist for Next Session

- [ ] Choose visual style profile.
- [ ] Choose external camera-image privacy policy.
- [ ] Choose first prototype provider route.
- [x] Use npm `semantic-stream 3.0.5` with `doi` and `isbn` filters.
- [ ] Choose first re-anchor policy.
- [ ] Accept or revise one-call Qwen response contract.
