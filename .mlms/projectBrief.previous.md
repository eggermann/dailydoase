# Project Brief

## Goal

Generate and document one live Glas Kaufhaus sequence from today's real camera on the current Mac. The sequence contains exactly three scenes lasting 3, 2, and 2 seconds. Keep `wort` as topic, preserve person and room through synchronous Runware FLUX.2 Flex correction with a ten-image FIFO camera-reference memory, and save exact prompts, inputs, provider payloads, responses, costs, clips, and final film.

## Problem

Working behavior is distributed across shell presets, orchestration code, generator classes, model adapters, Git branches, and generated artifacts. The exhibition snapshot proved that real visitors and semantic words can produce compelling stories, while later trailer branches improved narrative composition, motion, continuity, sound, and recovery. Those strengths are not yet organized into one inspectable design.

## Desired Outcome

One verified 7-second MP4, three verified source clips, two inspectable drift-correction stills, one StoryTransport artifact, and one human-readable exact render report.

## Users / Stakeholders

- Dominik, artist and operator.
- Exhibition visitors appearing in the camera frame.
- Future contributors maintaining the generator on the Mac mini.

## Scope

### In Scope

- Structured story transport for topic, Semantic Stream cues, people, positions, prior ending, and next opening obligation.
- Vision prompt and parser support for per-person frame position and orientation.
- Scene-planner integration and one JSON artifact per iteration.
- Deterministic verification of two consecutive iterations.
- Today's live camera capture and strict real-person gate.
- Two paid low-test-quality video iterations after a real person is confirmed.
- At least three causal scenes per trailer using the `ltxTrippy` prompt flavor.
- Proof-frame and MP4 verification.

- Current stable camera pipeline at `versions/glas-kaufhaus-shorty-book` (`12711b06`).
- Preserved exhibition snapshot at `837d143a`.
- `trailer/good-1-semantic-storytelling` (`18e255a0`).
- `trailer/good-2-narrative-motion` (`352a336f`).
- `trailer/good-3-protagonist-reentry` (`eaed396b`).
- Local Qwen3-VL person detection as a proposed production stage.
- Render stages, artifacts, ownership boundaries, failure paths, and decision papers.

### Out of Scope

- Deploying to the Mac mini.
- Deleting the Green Monster assets or old branches.
- Choosing every open artistic option without Dominik.

## Constraints

- Technical: final app runs directly on the Intel Mac mini; Qwen3-VL is served privately at `127.0.0.1:8080`.
- Product: generation starts only when a real visitor is present.
- Quality: preserve person identity, visible Kaufhaus geometry, semantic storytelling, and readable scene continuity.
- Security: no secrets in repository; local vision server remains loopback-only.
- Process: preserve unrelated dirty files on current branch.

## Definition of Done

- `topic` is derived from configured word input, not a Wikipedia title or generated summary.
- Today's camera frame contains one clearly visible real person.
- Exactly two trailers are rendered with at least three scenes each.
- Both trailers tell a causal, dreamy/trippy Kaufhaus story inside the captured room.
- Both MP4 files and representative proof frames pass media inspection.
- Vision story context contains visible-person count and per-person position/orientation when supplied by vision.
- Iteration two receives compact narrative state from iteration one.
- Story transport is persisted as inspectable JSON per iteration.
- Focused two-iteration and regression checks pass.
- Memory bank, review, retrospective, and next action are current.

## Open Questions

- Should raw visitor images be sent to external FLUX/WAN providers?
- Should the 1983 practical-effects look be fixed or selectable?
- Which provider should render production video?
- How often should a new camera frame re-anchor visitor identity and room geometry?
- Should Semantic Stream use a published package or the sibling local package during development?
