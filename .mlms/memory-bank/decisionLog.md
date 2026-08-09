# Decision Log

## D-0018: Give portrait trailers their own end-card composition

Status: Accepted

Context:
The compact end card was designed around short landscape output and used absolute vertical coordinates. In a 576×1024 CANK trailer it left most of the frame empty.

Decision:
Use a portrait-specific SVG only when a compact trailer is taller than wide. Scale type from width and place the information across the upper half over the extracted final scene.

Consequences:
Landscape cards retain their proven composition; 9:16 cards are readable and visually present.

## D-0019: Replace the live CANK stream seed words

Status: Accepted

Decision:
The CANK launcher now seeds exactly: `Department store`, `Toy`, `Horror`, `Landscape`, `Art exhibition`, and `Animals`, all marked English.

Consequences:
Restarting the live runner starts a fresh semantic stream with those six terms; no existing completed trailer is changed.

## D-0020: Render portrait cards by compositing the scene locally

Status: Accepted

Context:
The server SVG renderer ignored embedded image data and reduced CSS font shorthand to tiny fallback text.

Decision:
For portrait cards, Sharp resizes the extracted final-scene image and composites an SVG overlay with explicit DejaVu font properties.

Consequences:
The CANK end-card is independent of the server SVG image-URI and font-shorthand behavior.

## Decisions

### D-0030: Preserve Archive While Restoring Live Generation Folders

Status: Accepted

Context: The public CANK view had only 10 active folders after the site switched to `lib/GENERATIONS`, while the remote archive still contained 357 historical folders. CANK also contained 52 byte-identical video duplicates.

Decision: Hard-link only missing archive folders into `lib/GENERATIONS`, preserving the archive in place. Remove only CANK media duplicates proven identical by SHA-256, keeping the lowest numeric prefix because `1-`, `2-`, `3-` defines newest-first publishing order.

Consequences: History returns without a destructive migration or doubled storage. CANK has one copy per proven media asset, remains first below Home, and uses its numeric publication order.

### D-0029: Prefer Video Hero on the DailyDoase Home Page

Status: Accepted

Context: The home page was selecting the newest file overall, which could be a still image and left the landing view looking broken or secondary.

Decision: Select the newest playable video for the home hero when one exists, keep the image fallback for folders without video, and offset the page content so the fixed sidebar no longer overlaps the title.

Consequences: The landing page now opens on the actual movie-first asset, the sidebar/title collision is removed, and the remote service shows the intended hero without changing the trailer pipeline.

### D-0027: Test Against the Local Semantic-Stream Checkout

Status: Accepted

Context: The user updated `semantic-stream` to 3.0.4 locally before the registry version was available to the repo.

Decision: Point this repo at `file:../semantic-stream` so local and remote tests run the sibling checkout directly.

Consequences: The repo can validate the new module immediately, but the pin is now a local-path dependency instead of a published npm release.

### D-0028: Upgrade the Remote Mini to Node 22.23.2

Status: Accepted

Context: The remote mini was still on Node 16.15.0, which broke `semantic-stream@3.0.4` because `ReadableStream` and the required engine level were missing.

Decision: Install Node 22.23.2 into the user-local account on the mini and repoint `/usr/local/bin/node`, `npm`, and `npx` at that install.

Consequences: The remote trailer loop and the focused semantic-stream tests can now run under the module’s supported runtime without touching system-owned packages.

### D-0025: Keep the CANK Launcher Minimal

Status: Accepted

Context: The live CANK deploy should match the local base trailer launcher instead of layering extra provider or model overrides in a wrapper.

Decision: Let `MIX-again-freshweb.glas-kaufhaus-cank-trailer.sh` set only the live folder, polling interval, max iterations, and semantic word stream, then delegate to the shared trailer launcher.

Consequences: The deploy path stays aligned with local behavior, and future provider changes belong in the shared base launcher instead of the CANK wrapper.

### D-0026: Fail Fast on Real Semantic-Stream Rate Limits

Status: Accepted

Context: The user asked for no fallback. The live remote run still hits Wikipedia `429` during semantic word lookup.

Decision: Do not restore synthetic/offline semantic-stream behavior to mask a rate limit. Treat the `429` as the real failure mode and surface it directly.

Consequences: Trailer generation may stall under rate limiting, but the output stays honest and the deploy matches the requested no-fallback behavior.

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

### D-0020: Keep the Location Image Fixed and the Protagonist Identity-Only

Status: Accepted

Context: The new trailer run needed a stable room reference while allowing semantic drift in action and atmosphere.

Decision: Use the Kaufhaus image as the immutable location anchor and use the monster image only for protagonist identity and motion vocabulary. Allow drift only as continuity correction.

Consequences: The semantic word stream can change the scene content without replacing the photographed room or re-designing the location.

### D-0021: Add Handheld Mobile-Device Realism

Status: Accepted

Context: The rerender needed to read less like polished synthetic cinema and more like a candid phone recording.

Decision: Add handheld mobile-device realism to the trailer prompts: slight shake, natural exposure shifts, autofocus breathing, mild compression artifacts, and no studio gloss.

Consequences: Future trailer runs inherit a more grounded, documentary-like visual texture while keeping the same semantic content and location anchor.

### D-0022: Expand the Semantic Stream Mid-Iteration

Status: Accepted

Context: The user added `terror` and `Konsum/de` to the active trailer word chain after the handheld rerender.

Decision: Treat `terror` as the English semantic word and `Konsum/de` as `Konsum` with German language tagging, then rerun the trailer with the same Kaufhaus anchor and protagonist-identity rule.

Consequences: The scene planner shifts to rupture and consumption scenes without losing the room anchor or the mobile-device visual style.

### D-0023: Route References by Scene Focus

Status: Accepted

Context: The active trailer route repeatedly forced monster construction into scenes whose semantic event belonged to the room, objects, people, or a trace.

Decision: Require `sceneFocus` in compact plans and include the monster reference only for `monster` or `mixed` scenes, unless `monsterPresence` is explicitly absent.

Consequences: Environment-focused FLUX and WAN scenes stay monster-free while monster-focused scenes retain identity continuity.

### D-0024: Mirror New Trailers Into CANK Newest-First

Status: Accepted

Context: The live page at `/v/CANK` should surface the latest generated trailer first, and the trailer generator needs a repeatable live-deploy path.

Decision: Copy merged generation outputs into `lib/GENERATIONS/CANK` with descending creation order so the newest trailer gets `1-`. Add a polling sync loop plus a CANK-trailer launcher that keeps semantic stream and taktmuster iteration continuous.

Consequences: New trailers can be mirrored into the live folder without manual renaming, and the live page can sort newest content first.

### D-0024: Prefer `lib/GENERATIONS` on Server Bootstrap

Status: Accepted

Context: The live deployment already stores the current generation cache under `lib/GENERATIONS`, while a stale top-level `GENERATIONS` tree can exist on the host.

Decision: Prefer `lib/GENERATIONS` before the top-level `GENERATIONS` folder when booting the server on the deployment host.

Consequences: The live site refreshes from the same folder tree used by the deployed uploads, so new folders like `CANK` appear after restart.

### D-0025: Publish Only Sound-Ready CANK Trailers

Status: Accepted

Context: A silent collision cut can exist before the final Mirelo fallback mux; DailyDoase needs an adjacent `.mp4.json` sidecar to resolve a video route.

Decision: Publish only `*-with-sound` movies, preserve the existing live result otherwise, copy the `.mp4.json` sidecar, and put final WAV assets under `CANK-TRAILER/Sound`.

Consequences: Visitors receive a complete mobile trailer; raw sound remains separately accessible.

### D-0031: Advance After Failed CANK Trailer Rather Than Repeating It

Status: Accepted

Context: Repeating a failed WAN trailer prompt wastes media credit and stalls the semantic stream.

Decision: Keep the existing three same-clip retries. If they are exhausted, discard the failed trailer prompt, run two new iterations from the existing Semantic Stream instances, then resume the normal fourteen-hour delay.

Consequences: Recovery produces forward semantic material, avoids an immediate Supervisor restart for handled async failures, and preserves normal behavior for presets that do not enable this policy.

### D-0032: Publish Every Sound-Ready Trailer per Branch

Status: Accepted

Context: A generation directory can contain several completed trailers. Selecting only its newest movie silently drops earlier validated iterations.

Decision: The CANK publisher now selects every `*-with-sound` movie, accepts a generation-match filter, and publishes each branch to its own `CANK-TRAILER-GOOD-*` folder with newest-first numbered prefixes.

Consequences: All five iterations per branch remain comparable on the live site and each has a standalone sound asset.

### D-0033: Keep the Continuous Trailer Service Alive Through Stalls

Status: Accepted

Context: Supervisor restarts a crashed process, but cannot see a Node process that is alive while an external request is permanently stuck.

Decision: Run a separate `cankTrailerWatchdog` service. It checks the CANK generator log every five minutes and restarts `cankTrailer` only after fifteen hours without output. The fifteen-hour threshold exceeds the intentional fourteen-hour cadence.

Consequences: Normal waits remain uninterrupted; a provider/network stall cannot leave the production generator alive-but-idle indefinitely.

### D-0034: CANK-TRAILER Publishing Is Append-Only

Status: Accepted

Context: Restarting the continuous renderer must make a fresh trailer live without erasing earlier public CANK trailers.

Decision: The publisher creates target folders when absent, reuses an already-published filename for the same source artifact, and only copies newly completed sound trailers plus their sidecars and sound files. It never clears `lib/GENERATIONS/CANK-TRAILER`.

Consequences: Each completed trailer remains accessible; fresh trailers are added as newest-first entries without overwriting old video artifacts.
