# Decision Log

## Decisions

### D-0001: Use Memory Bank + Mini-Loop

Status: Accepted

Context: Project needs a bounded, reviewable generation workflow.

Decision: Use `.mlms` project context and one controlled loop.

### D-0002: No Live Camera in First Slice

Status: Accepted

Context: First Glass Kaufhaus video should be reproducible and safe to test.

Decision: Use poster JPGs and JSON only; defer camera integration.

### D-0003: Mirelo Is Non-Fatal

Status: Accepted

Context: Audio enhancement is useful but must not block exhibition video.

Decision: Keep generated video and concatenate it when Mirelo fails.

### D-0004: Use Normal Semantic Stream

Status: Accepted

Context: User explicitly requires the normal semantic-stream behavior for the exhibition generator.

Decision: Do not add or use an offline semantic-stream mode. Fixed words continue through normal semantic-stream article lookup.

### D-0005: Do Not Fake Video When Backends Fail

Status: Accepted

Context: Fal returned `403 User is locked. Reason: Exhausted balance`; self-hosted WAN returned `Could not resolve app config`.

Decision: Preserve scene plans and poster snapshots, but do not label an animatic or partial output as the requested generated trailer.

### D-0006: Console Trace Model Prompt Response

Status: Accepted

Context: Exhibition debugging needs to show which model received which prompt and what it returned.

Decision: Enable scoped generator debug logging in the Glass Kaufhaus preset and log scene-planner chat request/response payloads through the existing sanitized logger.

Consequence: Console output is verbose by default for this preset; sensitive keys are masked by `lib/generator/logger.js`.

### D-0007: Rich Exhibition JSON Is Story Source of Truth

Status: Accepted

Context: `formen_der_abweichunf_datas.json` contains the Green Monster story, visual prompt, creative rule, 22 artist practices, fictional character roles, and monster contributions. Snapshot `composition.js` only contains legacy generic Robotics composition.

Decision: Build Glass Kaufhaus scene direction and scene-plan system prompt dynamically from the rich JSON. Use snapshot composition as historical reference only, not as the new story source.

### D-0008: Separate Location and Protagonist References

Status: Accepted

Context: Four people-free 4:3 photographs document the real Kaufhaus interior where the trailer takes place. The Green Warehouse Organism image defines the protagonist, not the architecture.

Decision: Rotate people-free Kaufhaus photos as local scene-context images while keeping the Green Warehouse Organism as a separate protagonist reference. Never reproduce people visible in documentary location photos. Do not use a live camera.
