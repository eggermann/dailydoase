# Decision Log

## Decisions

### D-0017: Build Lost Audience From the Person-Fix Branch

Status: Accepted by user

Context:
`person-fix` already introduces a newly detected live visitor into a First/Last destination without a scene jump, but it retains only the latest persona reference.

Decision:
Fork `origin/exhibition/person-fix-d6fab8c4--822-823` as `exhibition/lost-audience`. Keep a bounded run-local visitor memory, use conservative description-token return matching, and make a return an interaction-aware destination event.

Consequences:
The feature preserves camera continuity and does not make a biometric identity claim. Old visitor references are bounded and inspectable as run artifacts.

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

### D-0017: Lost Audience Uses Run-Local Descriptive Memory

Status: Implemented and focused-test verified

Context:
The `person-fix` branch can introduce a fresh camera visitor, but has no record that a previously seen visitor has returned.

Decision:
Keep at most ten run-local visitor records, match conservative normalized vision-description tokens, and retain up to three recent camera references per remembered visitor. This is continuity matching, not biometric identification.

Consequences:
New and returning visitors can force the next First/Last transition while keeping the story start frame as continuity truth.

### D-0018: Semantic Stream Owns Returning-Visitor Interaction

Status: Implemented and focused-test verified

Context:
Memory can identify a return but cannot decide what the return should visibly mean.

Decision:
Use the current semantic stream's `actorsInteraction`, falling back to story event or beat, to virtualise visible interaction. Never hard-code a look, gesture, dialogue, or touch.

Consequences:
Visitor memory supplies continuity; the semantic stream supplies scene meaning.

### D-0019: Use Mac-mini Qwen3-VL Through a Local SSH Tunnel

Status: Live-verified

Context:
Qwen3-VL runs privately on the Mac mini at `127.0.0.1:8080`, so the work Mac could not reach it by direct hostname.

Decision:
Forward local port `18080` through SSH and set the live run's `LMSTUDIO_URL` and `LMSTUDIO_MODEL` explicitly to that tunnel and Qwen3-VL model.

Consequences:
Opening and transition captures use the actual Mac-mini vision server. A remote code test remains blocked only by the Mini's Node 12 runtime, not vision availability.
