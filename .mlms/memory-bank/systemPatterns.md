# System Patterns — Selfomat

## Working Pattern

Read one input frame, analyse visible person/room, collect independent semantic cues, ask planner for causal scene decisions, render one final state per scene, then store final residue and `nextWord` in StoryTransport.

## Quality Pattern

Source-cue count never derives from scene count. Final `nextWord` comes from final creative decision, not raw last token. Runtime flow stays readable from planner to scene adapter to cast-image attachment and colored prompt trace.

## Iteration Trace Pattern

Each iteration log presents the same ordered stages: input, vision/assets, semantic `prev/title/next`, Taktmuster allocation, GPT planner request, scene render prompts, and StoryTransport result. Full prompt payloads remain in their detailed sections; the stage map provides the compact overview.

# Prior System Patterns (retained)

## Working Pattern

Use one render-stage slice at a time:

1. Name the domain event.
2. Identify current owner and inputs.
3. State current decision and failure behavior.
4. Define proposed change.
5. Add focused test seam.
6. Verify artifacts and logs.
7. Review before moving downstream.

## Narrative Pattern

Every render step follows:

`Input -> Validation -> Decision -> Action -> Artifact -> Failure path`

## Quality Pattern

- Keep orchestration readable from top to bottom.
- Keep provider details behind named adapters.
- Never hide fallback or privacy boundaries.
- Preserve camera and story evidence as JSON artifacts.
- Distinguish observed behavior from proposed behavior.

## Story Transport Pattern

Keep narrative transport separate from visual frame transport:

1. Configured word becomes stable `topic`.
2. Semantic Stream responses become ordered `semanticCues`.
3. Vision supplies current location and structured people placement.
4. Scene planner produces current arc.
5. Final planned beat becomes next iteration's opening obligation.
6. Persist finite transport without recursively embedding full history.

## Camera Reference FIFO Pattern

1. Preserve chronological camera/person image references without identity matching.
2. Keep at most ten images.
3. Append each new valid person shot.
4. Evict only the oldest image when capacity is exceeded.
5. Keep narrative/person descriptions outside the image FIFO.
