# System Patterns — Selfomat

## Working Pattern

Read scene plan, choose a current lead from one or more visible visitors, choose one earlier reference, adapt a short semantic interaction, then render through the existing cast-context path.

## Quality Pattern

The opt-in adapter must be pure and tested with two iterations, no past person, and group current-person inputs. Runtime flow stays readable from planner to scene adapter to cast-image attachment.

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
