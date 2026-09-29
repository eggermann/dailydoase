# Project Brief

## Goal

Produce two finished low-resolution Selfomat test films on `openStudios26/selfomat`. Film one starts from `selfie_01.jpg`; film two starts from next test image `selfie_02.jpg`. Each current image's first visible person is protagonist. Mixed Semantic Stream input: `love,en | animal,en`.

## Problem

The existing exhibition planner can recall people but does not consistently make the current visitor the lead or turn one past visitor into a small interaction. Its current preset uses CCTV aesthetics.

## Desired Outcome

Two completed, inspectable film outputs prove the opt-in Selfomat path with a fixed low-resolution selfie lead and simultaneous `love`/`animal` semantic input.

## Users / Stakeholders

- Exhibition visitors appearing in short films.
- Artist/operator selecting semantic words and running the installation.

## Scope

### In Scope

- Separate Selfomat preset.
- Reuse existing StoryTransport and cast-image path.
- A deterministic people-chain rule: only active FIFO visitors can return; the film moves from newest toward oldest, with an optional FIFO neighbor in the closing scene.
- Focused offline tests and readable code.

### Out of Scope

- Identity matching or biometric recognition.
- A third iteration, deployment, branch merge, or production preset changes.
- Deployment, branch merge, or production preset changes.

## Constraints

- Technical: Keep existing generator interfaces; opt in through the Selfomat preset.
- Product: Current visitor is visually primary; return at most one prior visitor.
- Time: Exactly two bounded generation iterations.
- Quality: Explain decisions in top-to-bottom domain order and test edge cases.
- Security: No credentials, raw visitor images, or generated media in the commit.

## Definition of Done

- Selfomat path implemented behind an explicit flag.
- Relevant focused tests pass.
- Diff reviewed; memory and retrospective updated.
- Both generated films and their scene-plan artifacts are inspected.

## Open Questions

- Visual quality and identity fidelity require a later camera/model test.
- Score weights may need artistic tuning after a real sequence.
