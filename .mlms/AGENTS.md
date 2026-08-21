# AGENTS.md

## Codex Workflow

Before implementation work:

1. Read `.mlms/projectBrief.md`.
2. Read every file in `.mlms/memory-bank/`.
3. Read `docs/glas-kaufhaus-render-expose/README.md`.
4. Identify current loop phase from `.mlms/memory-bank/activeContext.md`.

During work:

1. Keep changes small and tied to one render-stage decision.
2. Preserve the proven live-camera path until its replacement passes focused tests.
3. Separate observed current behavior from proposed behavior.
4. Record source branch and commit for every imported trailer behavior.
5. Run focused checks before accepting a render-stage change.

After meaningful work:

1. Update active context and progress.
2. Record accepted or rejected architecture decisions.
3. Append review and retrospective notes.
4. State one concrete next action.
