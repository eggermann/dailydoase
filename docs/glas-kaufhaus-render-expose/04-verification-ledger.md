# Verification Ledger

## Verification Standard

This exposé separates:

- Source-observed stable behavior.
- Source-observed branch behavior.
- Proposed architecture.

No model generation or deployment was started during documentation loop.

## Git Refs Verified

| Role | Ref | Commit |
|---|---|---|
| Preserved live exhibition | `snapshot/freshweb-exhibition-animal-fries-2026-07-11` | `837d143a` |
| Stable camera base | `versions/glas-kaufhaus-shorty-book` | `12711b06` |
| Trailer foundation | `versions/glas-kaufhaus-shorty-book--trailer` | `5299338c` |
| Good-1 | `trailer/good-1-semantic-storytelling` | `18e255a0` |
| Good-2 | `trailer/good-2-narrative-motion` | `352a336f` |
| Good-3 | `trailer/good-3-protagonist-reentry` | `eaed396b` |

## Stable Source Evidence

| Claim | Source owner |
|---|---|
| Strict preset requires person and enables camera persona reference | `MIX-again-freshweb.prompt-fast-wan-strict-4-3.sh` |
| Shell chain ends in canonical JS entry | strict, trippy, middle-cost presets and `MIX-again-freshweb.js` |
| Camera alias normalizes to reference-image-actor | `normalizeStoryMode()` |
| Semantic streams come from Node package | root `semantic-stream.js` import and `package.json` |
| Loop keeps or advances prompt based on success | `_.getLoop()` |
| Camera capture tries node-webcam, FFmpeg, then imagesnap | `getIamge()` |
| Person guard ignores art/mannequins/reflections | `DEFAULT_CAMERA_PRESENCE_PROMPT` |
| Guard currently disables itself on provider error | `captureValidatedCameraShot()` |
| Main vision becomes continuity and story context | `promptFunktion()` |
| Count and lengths are separate Taktmuster streams | `resolveSceneCount()`, `refreshResolvedSceneLengths()` |
| Scene plan uses JSON schema and count fallback | `createSceneGenerator()`, `generateScenePlanWithFallback()` |
| Camera plan is sanitized before use | `sanitizeWebcamCameraScenePlan()` |
| Opening frame follows explicit decision order | `resolveStartFrame()` |
| Scene loop records each prompt and last frame | `continueSceneLoop()` |
| Clips are normalized before continuity handoff | `finalizeGeneratedVideo()` |
| Final video concatenates before final-only Mirelo | `finalizeSceneLoopResult()` |
| Mirelo failure preserves original video | `addMireloAudioAndUpload()` |

## Branch Evidence

| Claim | Git evidence |
|---|---|
| Good-1 restores semantic monster storytelling | commit `2e8becee` |
| Good-1 adds canonical scene entry and focus module | commit `c609d3e4` |
| Good-1 varies semantic Mirelo sound | commit `18e255a0` |
| Good-2 strengthens narrative continuity and camera motion | commit `b17bb391` |
| Good-2 adds photographic realism and provider prompt compaction | commits `933f2911`, `749fece8`, `11fa7c67` |
| Good-3 re-anchors after off-frame scenes | commit `a8638f98` |
| Good-3 adds Semantic Stream timeout | commit `54e71845` |
| Good-3 enforces gritty 1983 practical effects | commit `eaed396b` |

## Proposed-Only Claims

These are not implemented on current branch:

- Provider named `qwenLocal`.
- Automatic model discovery from `/v1/models` inside generator.
- One combined Qwen presence/person/room response.
- Fail-closed retry after local vision server error.
- Generic visitor re-entry confidence logic.
- Explicit collision anchor and consequence fields on stable branch.
- Privacy-class logging for outbound frames.
- Selectable style profile.

## Qwen Runtime Evidence Supplied by Operator

- llama.cpp server: `127.0.0.1:8080` on Mac mini.
- Model: Qwen3-VL-2B-Instruct Q4_K_M.
- Vision encoder: Qwen3-VL F16 mmproj.
- OpenAI-compatible `/v1/chat/completions` endpoint.
- `/v1/models` returns loaded model ID.
- Confirmed 2048x1152 request time: 27.75 seconds end to end.
- Server is loopback-only.

This evidence informs decision papers but was not remotely re-tested in this documentation loop.

## Checks Completed

### Semantic Stream 3.0.5 update

- npm registry metadata confirmed release `3.0.5` and Node requirement `>=22`.
- Local Node is `v24.9.0`.
- Installed package reports `3.0.5`.
- Package source confirms `filter` is case-insensitive and repeatedly advances past matching titles.
- Application passes `['doi', 'isbn']` to every `initStreams` call.
- Deterministic installed-package smoke skipped `DOI 10.1000/test` and `Book ISBN 978-test`, returning `Kaufhaus story`.
- Semantic cache/loop tests: 2 suites passed, 7 tests passed.

### Focused tests

Command:

```sh
npm test -- --runInBand \
  lib/generator/adapter/shorty-book/LiveContextOrchestrator-config.test.js \
  lib/generator/adapter/helpers/camera-presence.test.js \
  lib/generator/adapter/helpers/scene-generator.test.js \
  lib/generator/adapter/shorty-book/init-models.test.js \
  lib/generator/adapter/shorty-book/webcam-defaults.test.js \
  lib/generator/adapter/tests/shorty-book.generator.test.js
```

Result: 6 suites passed, 84 tests passed, 0 failed.

### Documentation and source checks

- All five exposé files exist.
- README links resolve.
- All six documented Git refs resolve to recorded commits.
- New documentation contains no whitespace errors under `git diff --no-index --check`.
- Current branch remained `versions/glas-kaufhaus-shorty-book`.
- Pre-existing `deploy/ssh-config.cjs` change and generated folders were not modified.

### Not run

- Live Qwen3-VL request.
- Camera capture.
- Paid image or video generation.
- Mirelo generation.
- Deployment.

These remain implementation-loop acceptance checks, not documentation-loop checks.
