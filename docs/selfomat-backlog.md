# Selfomat backlog

## Optional opening intro — later

Status: deferred. Do not enable for normal Selfomat runs yet.

Goal: an atmospheric generated opening image may run for one short intro beat,
then transition into the accepted real selfie frame. Scene 1 starts only after
that selfie frame, so the current visitor remains the identity anchor.

```text
generated atmospheric intro
  -> short first/last transition
  -> accepted real selfie frame
  -> scene 1
```

Prerequisite: real selfie -> scene 1 -> later scene render chain is stable and
visually verified. This must be an optional `openingIntro`, separate from the
current `FRESHWEB_OPENING_START_ENABLED` replacement mechanism.
