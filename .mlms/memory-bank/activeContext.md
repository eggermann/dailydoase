# Active Context — Selfomat

## Current Goal

Implement and verify one Selfomat iteration end-to-end. Use local/reference input, analyse it, generate causal Taktmuster scenes, keep source-cue count independent from scene count, derive final `nextWord` from last visible consequence, and publish colored HTML/TXT prompt trace.

## Current Loop

Loop: 4

Phase: Committed -> focused checks green; Taktmuster design next

## Shared Loop Budget

Root Context: .mlms
Used: 4
Maximum: 5

## Current Focus

Slice implemented: `sourceCueCount=8`, creative decision/residue/nextWord transport, and colored HTML/TXT trace. Preserve existing dirty files. Focused tests green; full suite blocked by unrelated live/sharp/API-key tests.

Before rendering each film, write a readable `selfomat-prompt-log/iteration-NNNN.txt` next to its output. It records source image, semantic topics and cues, display text, vision prompt/result, scene-planner prompt/context, and every final still/image/video prompt.

## Assumptions

- Both source images are intentionally low resolution and clear enough for initial vision.
- Test queue is an implementation stand-in for later live camera input.
- `love` and `animal` are concurrent input words, not one word per film.

## Risks / Unknowns

- External image/video generation can fail or take longer than local checks.
- First iteration has no earlier FIFO visitor, so it is a one-person film; second iteration's new person stays lead while first FIFO person may return.
- Previous video calls failed with Runware HTTP 400: insufficient credits; image-only mode now skips video and audio model initialization.

## Next Action

Commit `41d4e93d` records semantic decision slice. Next: decide whether `2|4|4` is fixed scene-duration pattern or generated Taktmuster pattern.

# Prior Goal Context (retained)

## Current Goal

Render and document one live 3–2–2 Kaufhaus sequence with `wort` as topic, synchronous camera re-anchoring, Runware FLUX Kontext Pro drift correction, and a verified final film.

## Current Loop

Loop: 8

Phase: Completed and verified

## Current Focus

Generation `802` is complete: exact 3-second, 2-second, and 2-second WAN clips; FLUX.2 Flex FIFO transitions with 3, 4, and 5 references; and an exact 7-second concat. Person checks can no longer pause an iteration after scene 1 starts.

## Assumptions

- The camera frame should replace the Green Monster as protagonist reference.
- The real camera frame also supplies current Kaufhaus geometry.
- Qwen3-VL should perform person gating directly on the Mac mini.
- Good-3 monster-specific entry logic is design evidence, not code to copy unchanged.
- `topic` means configured input word; Wikipedia-derived text remains a semantic cue.
- Person position is model-observed structured metadata, not guessed from prose when absent.
- Each trailer has at least three causal scenes.
- Low test quality uses the proven Runware Wan 2.6 Flash single-image path.
- Paid rendering starts only after strict person detection confirms today's user.

## Risks / Unknowns

- Existing camera guard disables itself after a vision error.
- Existing persona burst can multiply Qwen CPU latency.
- Raw visitor frames may still leave the Mini during external image/video generation.
- Good branches depend on `file:../semantic-stream`; current branch now pins published npm `3.0.5`.
- Process restart does not yet reload the latest StoryTransport artifact.
- Existing unrelated dirty files must remain untouched.
- Visual strength is dreamy and cumulative, but lighter than the requested "heavy trippy" maximum.
- Generated identity drifts from bald/back-facing to dark-haired/front-facing in iteration two.
- Mirelo audio failed with `fetch failed`; silent MP4s remain valid.
- Current opening vision parser loses the actor array when JSON is wrapped as a one-line Markdown fence; StoryTransport says zero people despite visible and transition-detected person.
- Full-frame moderate Kontext correction preserves identity but resets too much generated story after scene 1.

## Next Action

Strengthen planner output from text/light effects to explicit `actorAction` or `actorsInteraction`; preserve the now-verified no-mid-iteration-stop rule.
