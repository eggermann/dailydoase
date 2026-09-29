# Subgoal

## Parent Goal

Finish image-only Selfomat starter-photo series from sequential supplied selfies. Each queue image leads one iteration; `love,en | animal,en` runs as one mixed semantic stream.

## Goal

Generate one inspectable MP3 from `story-transport/iteration-0002.json`: `o4-mini` produces a MiniMax Music 3 description and tagged lyrics; the MiniMaxAI Hugging Face Space returns audio that is saved as MP3.

## Why Now

This proves that the existing inspectable story transport can become sound without changing the image-only Selfomat path.

## Status

completed

## Acceptance Criteria

- Story JSON is reduced to safe concrete audio source data.
- `o4-mini` emits separately validated `musicDescription` and tagged `lyrics`.
- The Space adapter submits the two fields in its discovered Gradio API shape.
- Focused tests cover prompt creation and request shape.
- A runnable script writes an MP3 with the configured HF token.

## Handoff to Parent

Implemented and verified. Iteration 2 produced a 57.39-second stereo MP3 through `o4-mini` and `MiniMaxAI/MiniMax-Music3`; focused tests and ffprobe checks pass. Parent can decide later whether to mux standalone sound into films.
