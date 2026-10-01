# Project Brief

## Goal

Implement and verify one Selfomat iteration end-to-end, with generated HTML trace as acceptance artifact. Use local/reference visitor input, analyse it, generate causal Taktmuster scenes, keep source-cue count independent from scene count, and derive final `nextWord` from last visible consequence into StoryTransport.

## Problem

The existing exhibition planner can recall people but does not consistently make the current visitor the lead or turn one past visitor into a small interaction. Its current preset uses CCTV aesthetics.

## Desired Outcome

One offline-safe, inspectable iteration proves input -> vision -> semantic stream -> scene planner -> scene prompts -> StoryTransport. HTML/TXT log shows exact request args, raw fragments, static rules, generated decisions, final prompts, and next-word reason.

## Users / Stakeholders

- Exhibition visitors appearing in short films.
- Artist/operator selecting semantic words and running the installation.

## Scope

### In Scope

- `sourceCueCount` (default 8) independent from `sceneCount`.
- GPT creative decision fields: visual event, person action, transformation, residue, next word, reason, camera move.
- Final `nextWord` selected from visible consequence; lexical fallback only when planner output is absent.
- Separate image prompt (one final visible state) and video prompt (temporal change).
- Focused offline tests and colored HTML/TXT trace.

### Out of Scope

- Identity matching or biometric recognition.
- Multi-iteration production run, external paid rendering, deployment, branch merge, or push.

## Constraints

- Technical: Keep existing generator interfaces; opt in through the Selfomat preset.
- Product: Current visitor is visually primary; return at most one prior visitor.
- Time: One bounded local/mock generation iteration.
- Quality: Explain decisions in top-to-bottom domain order and test edge cases.
- Security: No credentials, raw visitor images, or generated media in the commit.

## Definition of Done

- Selfomat path implemented behind an explicit flag.
- Relevant focused tests pass.
- Diff reviewed; memory and retrospective updated.
- One generated HTML/TXT trace is inspected.
- `completedTransport.nextTopic === selected nextWord` is tested.

## Open Questions

- Visual quality and identity fidelity require a later camera/model test.
- Score weights may need artistic tuning after a real sequence.
