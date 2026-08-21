# Glas Kaufhaus Render Exposé

Status: working decision set

Working branch: `versions/glas-kaufhaus-shorty-book`

Stable commit: `12711b06`

Verified: 2026-08-17

## Goal

Understand the generator before changing it. Keep the proven live-camera behavior, recover the best story and motion mechanics from three trailer branches, replace the Green Monster with the real camera visitor, and make every render decision inspectable.

## Read in This Order

1. [Render Pipeline Exposé](01-render-pipeline-expose.md) — what one iteration does now.
2. [Branch Source Map](02-branch-source-map.md) — what each preserved branch contributes.
3. [Decision Papers](03-decision-papers.md) — choices to accept, change, or reject before implementation.
4. [Verification Ledger](04-verification-ledger.md) — source evidence and checks.

## Language Used in These Papers

- **Observed** means behavior exists on current stable branch and was traced to source.
- **Branch evidence** means behavior exists in named Git branch but not necessarily current branch.
- **Proposed** means intended hybrid behavior; code does not implement it yet.
- **Decision required** means artist/operator choice remains open.

## Working Rule

No broad merge. Move one named render-stage behavior at a time, add its test seam, inspect its artifact, then continue.
