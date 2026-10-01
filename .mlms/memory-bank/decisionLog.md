# Decision Log

## S-0008 — Source cues and scene count are independent

**Date:** 2026-09-30
**Status:** Accepted for one-iteration prototype

Generate configurable semantic source stream (default 8 cues) independently from visible scene count. Planner receives all cues as private material and turns them into causal scenes.

## S-0009 — Final creative decision owns next word

**Date:** 2026-09-30
**Status:** Accepted for one-iteration prototype

`StoryTransport.nextTopic` comes from final scene's explicit `creativeDecision.nextWord`. Lexical extraction remains emergency fallback only and is recorded with reason/fallback metadata.

## S-0005 — Two films reuse one low-resolution protagonist image

**Date:** 2026-09-29
**Status:** Accepted for live verification

Both bounded iterations use a deterministic test queue: `selfie_01.jpg` then `selfie_02.jpg`. `love,en` and `animal,en` enter the same semantic-stream mix rather than one word being assigned to each film.

**Why:** This tests automated handoff from one visitor to next without needing a live camera yet.

## S-0006 — FIFO identity, not image-path equality, distinguishes returners

**Date:** 2026-09-29
**Status:** Accepted

Two consecutive uses of one selfie create two iteration-specific FIFO identities. The second iteration may select the first identity even when both refer to the same file path.

**Why:** Rejecting identical file paths silently disconnected repeat-image films and contradicted the accepted repeat-image input rule.

## S-0007 — Preserve current lead identity during cast-context composition

**Date:** 2026-09-29
**Status:** Accepted

Cast-context prompts now treat the current image as the exact facial anchor, keep its face unobstructed and dominant, keep returning visitors secondary, and reject facial blending, beautification, and hands crossing the lead face.

**Why:** The first two-person test preserved hair, clothing, and room but visibly changed the current woman's facial proportions.

## S-0004 — FIFO chooses people; semantic stream chooses interaction

**Date:** 2026-09-29
**Status:** Accepted for the Selfomat prototype

The first scene favors the newest active FIFO visitor; later scenes walk toward the oldest still-active visitor. The closing scene may include that person's FIFO neighbor as a second returner. An evicted visitor remains historical data but is never a candidate or reference image. The Semantic Stream does not choose a person: it asks the already-selected people for a short, visible physical gesture.

**Why:** The rule makes "next or last" and the occasional three-person selfie inspectable in stored scene plans, while preventing unjustified semantic matching from deciding who returns.

**Trade-off:** Semantic cues need a planner-provided action to become specific (for example, dancing rather than a generic gesture); the next live render decides whether that needs a dedicated action interpreter.

## Selfomat Decisions

### S-0001: Use a separate opt-in preset

Status: Accepted

Context:
The source branch serves a CCTV installation. Selfomat needs a candid phone viewpoint without changing that installation.

Decision:
Enable Selfomat only through a dedicated preset flag. Reuse existing StoryTransport and cast-context image rendering.

Consequences:
The first prototype can be tested offline and compared with the prior preset.

### S-0002: Select one prior person by recency

Status: Accepted for first prototype

Context:
No stable person-matching or semantic ranking system exists.

Decision:
Use the newest prior cast reference outside the current detected actor set. A single current actor remains the lead.

Consequences:
Selection is deterministic and inspectable. A future semantic ranking strategy may replace it.

## Prior Decisions (retained)

## Decisions

### D-0001: Use Memory Bank and a Bounded Documentation Loop

Status: Accepted

Context:
The generator spans several branches and render layers. Work needs durable context and reviewable decisions.

Decision:
Use `.mlms` memory plus small plan, verification, review, and retrospective loops.

Consequences:
Each implementation slice must update memory and point to its render-stage decision.

### D-0002: Work on the Actual Stable Branch

Status: Accepted by user

Context:
A clean documentation worktree was offered because unrelated dirty files exist.

Decision:
Work directly on `versions/glas-kaufhaus-shorty-book` as requested. Touch only new documentation and `.mlms` files.

Consequences:
Existing modified and generated files must remain untouched. Diff review must isolate new documentation.

### D-0003: Describe Before Refactoring

Status: Accepted

Context:
Current behavior is valuable but hard to read across modules.

Decision:
Produce a verified narrative and explicit decision papers before changing render code.

Consequences:
This loop changes no runtime behavior.

### D-0004: Organize Work by Render Stage

Status: Accepted

Context:
Shell presets, orchestration, planning, rendering, continuity, and post-production currently overlap across large files.

Decision:
Use named render stages and the narrative `Input -> Validation -> Decision -> Action -> Artifact -> Failure path` as shared architecture and review vocabulary.

Consequences:
Future code changes should expose one domain step per function or module and preserve artifacts at stage boundaries.

### D-0005: Keep Proposed Qwen Behavior Separate From Observed Runtime

Status: Accepted

Context:
Qwen3-VL production design is known, but current stable code still uses the generic LM Studio-compatible provider path and fail-open guard behavior.

Decision:
Document Qwen provider, one-call response, and fail-closed behavior as proposed until implemented and tested.

Consequences:
Documentation cannot imply current runtime already provides those guarantees.

### D-0006: Pin Semantic Stream 3.0.5 and Filter DOI/ISBN Titles

Status: Accepted by user and implemented

Context:
Semantic Stream 3.0.5 adds title filtering during `initStreams`.

Decision:
Use exact npm version `3.0.5` and pass `filter: ['doi', 'isbn']` for every stream initialization.

Consequences:
Wikipedia titles containing DOI or ISBN, case-insensitively, are consumed and skipped before they reach scene planning. Package-lock includes new 3.0.5 transitive dependencies.

### D-0007: Separate Topic Word From Semantic Cues

Status: Accepted by user and implemented as pure transport schema

Context:
Wikipedia-derived Semantic Stream text changes each step, but the artistic topic must remain the configured word.

Decision:
StoryTransport stores the first configured word as `topic`, all configured words as `topics`, and generated Semantic Stream responses separately as `semanticCues`.

Consequences:
Scene planning can preserve a stable topic while still using changing semantic material. Transport snapshots remain finite by carrying only a compact bridge from the previous iteration.

### D-0008: Store Vision-Observed Person Placement

Status: Accepted by user

Context:
Story action must know whether one or more visitors appear in foreground, background, left, right, front-facing, or side-facing positions.

Decision:
Each StoryTransport stores `people.count` and per-person `reference`, `description`, `position`, and `orientation`. Position stays empty when vision does not provide it; code does not guess.

Consequences:
Vision prompt and parser must provide structured actor placement before runtime integration is complete.

### D-0009: Persist Planned Narrative Transport Per Iteration

Status: Accepted and implemented

Context:
Visual `lastEndFRame` transport does not explain why the next story begins where it does.

Decision:
Keep an in-process StoryTransport controller, feed its compact previous bridge into the next scene-planner request, and save each completed planned transport under `story-transport/iteration-NNNN.json`.

Consequences:
The next iteration receives prior summary, final beat, and opening obligation. Scene-loop artifacts also embed the transport. Artifacts describe planned narrative state; they do not claim failed renders completed.

### D-0010: Gate Today's Paid Two-Trailer Run on a Real Person

Status: Accepted from user goal and current exhibition safety rule

Context:
Today's background and user differ from prior camera material. Current live frame shows only the upper room and no real person.

Decision:
Do not reuse the old visitor frame and do not start paid video generation until the strict local Qwen person check confirms a real person in today's capture.

Consequences:
Room truth stays current, visitor consent/presence remains explicit, and no model cost is spent on the wrong ceiling-only frame.

### D-0011: Use Current Mac Camera for Development Session

Status: Accepted by user

Context:
The Mac mini camera is the final exhibition source, but today's development session runs on the current Mac.

Decision:
Capture today's room and user through Photo Booth on the current Mac. Keep the generator's camera-image contract unchanged so the Mini can later supply the same kind of frame.

Consequences:
Current test avoids the remote camera's ceiling-only framing while preserving the eventual exhibition architecture.

### D-0012: Accept Trailing Text After Structured Vision JSON

Status: Implemented and verified

Context:
Qwen returned a valid top-level JSON object followed by one commentary line. The old parser then lost the actor array, so StoryTransport incorrectly recorded zero people despite a successful person gate.

Decision:
When vision output begins with `{`, parse through its final `}` and ignore only trailing model commentary. Do not treat embedded actor JSON inside labeled prose as a top-level response.

Consequences:
Person count, midground position, and back-facing orientation now reach future StoryTransport iterations. Existing rendered films remain unchanged.

### D-0013: Use Runware FLUX Kontext Pro for Two-Image Drift Correction

Status: Accepted and live-smoke-tested

Context:
Drift correction needs both the previous generated story frame and the newly captured camera-person frame. Runware FLUX Kontext Dev accepts only one reference image.

Decision:
Use Runware FLUX.1 Kontext Pro (`bfl:3@1`) with exactly two references, followed by Runware WAN 2.6 Flash (`alibaba:wan@2.6-flash`) for video.

Consequences:
Each transition can transport story state and current camera identity together. Kontext correction costs about USD 0.04 per still rather than the cheaper one-image Dev route.

### D-0014: Use a Ten-Image FIFO Instead of Persona Identity Matching

Status: Accepted by user and implemented

Context:
Face/person identity matching adds uncertain classification and unnecessary complexity to the exhibition loop.

Decision:
Keep at most ten chronological camera/person image references. A new image enters at the end; the oldest image leaves only when an eleventh distinct entry arrives. Story memory remains separate.

Consequences:
The image cache represents recent exhibition time, not biometric identity. Multiple people in one camera image remain together as one reference.

### D-0015: FLUX.2 Flex Omits Unsupported Diffusion Controls

Status: Implemented and live-verified

Context:
Runware `bfl:6@1` rejected `negativePrompt` with HTTP 400 during diagnostic generation `800`.

Decision:
Submit FLUX.2 Flex image-edit calls without `negativePrompt`, `steps`, or `CFGScale`, while retaining up to ten reference images.

Consequences:
Generation `801` successfully produced a FLUX.2 Flex correction from three FIFO references.

### D-0016: Never Stop an Iteration After Scene 1 Starts

Status: Accepted by user, implemented, and live-verified

Context:
Generation `801` paused before scene 3 because fresh camera frames contained no person. Presence should start an iteration, not interrupt its already-running story.

Decision:
Wait for a visible person only before iteration start. During a running iteration, attempt one fresh camera check. If no person is present, immediately reuse the last valid FIFO camera reference without waiting or duplicating its FIFO entry.

Consequences:
Generation `802` completed its exact 3–2–2 sequence and 7-second concat without a mid-iteration stop.
