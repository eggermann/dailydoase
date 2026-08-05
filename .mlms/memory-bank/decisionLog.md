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

### D-0009: Verify Images Before Video

Status: Accepted

Context: User needs visible generation proof before paying for or debugging WAN video generation.

Decision: Run two image-only rounds through one persistent Semantic Stream. Disable WAN and Mirelo initialization, store every scene still in one shared folder, and treat decodable image files plus per-round summaries as completion evidence.

### D-0010: Treat FLUX Kontext Pro as Fixed-Control Model

Status: Accepted

Context: Runware rejected `CFGScale`, `steps`, `negativePrompt`, and arbitrary `448Ã336` dimensions for `bfl:3@1`.

Decision: Omit unsupported inference controls and map requested dimensions to the nearest supported FLUX Kontext Pro aspect ratio. For the Kaufhaus 4:3 test this resolves to `1184Ã880`.

### D-0011: Precompose Protagonist Into Canonical Locations

Status: Accepted

Context: Supplying a full poster as secondary reference copied people, typography, and page layout. Supplying raw location plus a clean cutout still allowed FLUX Kontext to replace the Kaufhaus with a generic dark room.

Decision: Maintain four canonical photographs that already combine the exact Kaufhaus view with one isolated monster. Use each combined image as the sole visual reference and apply semantic changes as localized edits only.

### D-0012: Use Saved Semantic Cues for the Paid Two-Video Probe

Status: Accepted

Context: The normal Semantic Stream received Wikipedia `429` before it reached any paid media request. Folder 717 already contains an accepted, real scene plan and its original Semantic Anchor/Collision cues.

Decision: The minimal two-video probe reuses the first two saved scenes from folder 717. It makes no fresh Semantic Stream request, but preserves the original `1983 â NATO-Doppelbeschluss â Betriebsform` collision chain.

Consequence: The probe tests FLUX/WAN visual continuity and concat reliability, not fresh Wikipedia availability.

### D-0013: Whole-Second 1+ WAN Rhythm

Status: Accepted

Context: Runware WAN accepts whole-second durations. Fractional scene plans required duration repair and could expose repeated final frames.

Decision: Use the direct `1+` Taktmuster (`5 â 2 â 3 â 2 â¦`) with no fractional multiplier.

### D-0014: Collision Cuts and Forward Camera Grammar

Status: Accepted

Context: Raw concatenation visibly duplicated chained last frames and individual WAN camera moves could conflict.

Decision: Remove held boundary frames, insert a short fade-to-black collision, and apply a continuous forward dolly. Require forward-only camera movement in future scene prompts.

### D-0015: Structured Semantic Cues Are Canonical

Status: Accepted

Context: Free-form cue strings force downstream code to recover semantic anchors and collisions with regular expressions.

Decision: Consume each stream step once into a structured cue record, then derive the legacy string from that record. Pass both forms downstream.

Consequences: Validation and repair use lossless structured values; legacy callers can continue consuming cue strings.

### D-0016: Validate Before Structural Normalization

Status: Accepted

Context: Pre-validation inheritance correction could hide a planner reset or wrong consequence ID.

Decision: Validate the raw planned semantic fields first. Keep deterministic structural inheritance as an explicit utility, not an automatic mask before targeted repair.

Consequences: Broken inheritance reaches the repair loop and strict collision mode aborts if it remains invalid.

### D-0017: Compact Oversized FLUX Prompts by Semantic Fields

Status: Accepted

Context: Real image-only integration exceeded Runware's 3000-character prompt limit because causal and location prose was duplicated.

Decision: When a FLUX prompt is oversized, rebuild it from each mandatory semantic field plus concise Kaufhaus and safety constraints. Do not blindly truncate the complete prompt.

Consequences: Provider limits are respected while anchor, collision, inheritance, physicalization, tactic, action, agency evidence, presence, consequence, and decisive still remain explicit.

### D-0018: Resume Saved Validated Plans Without New Terms

Status: Accepted

Context: A strict false negative stopped round 2 after its terms and plan were already saved.

Decision: Let the image-only resume entry point accept an explicit validated plan path and merge partial retry summaries.

Consequences: Media retries do not consume another Semantic Stream term or regenerate the plan.

### D-0019: Separate Cue Identity From Prompt Language

Status: Accepted

Context: Semantic Stream can return German or other non-English terms, while FLUX/WAN production prompts should be English.

Decision: Preserve exact source terms in `semanticAnchor` and `semanticCollision`. Generate `semanticAnchorEnglish` and `semanticCollisionEnglish` inside the existing planner response and prefer them in production prompts.

Consequences: Exact cue validation remains lossless, no extra API or stream call is added, and model-facing prompts receive English terms or English physical meaning.

### D-0015: Prefer one compact whole-sequence planner

Status: Accepted

Context: Repeated semantic fields and per-scene repairs made the active trailer path costly and brittle.

Decision: Plan all scenes once from structured cue records; validate only structure and cue identity; allow one whole-plan repair.

Consequences: Production FLUX and WAN prompts consume direct planner fields with short reusable constraints.
