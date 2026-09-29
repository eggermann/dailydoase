# Project Brief

## Goal

Turn one Selfomat StoryTransport artifact into a MiniMax Music 3 MP3 using `o4-mini` for the caption and lyrics.

## Problem

Story transport is inspectable but cannot yet drive a reproducible sound render.

## Desired Outcome

One command produces a saved audio blueprint and MP3 using the MiniMaxAI Hugging Face Space.

## Users / Stakeholders

- Artist/operator reviewing Selfomat story and sound together.

## Scope

### In Scope

- Read one StoryTransport JSON.
- Ask `o4-mini` for separate Music 3 fields.
- Call `MiniMaxAI/MiniMax-Music3` through Gradio.
- Save inspectable prompt and audio artifacts.

### Out of Scope

- Replacing legacy ACE, film muxing, or adding secrets.

## Constraints

- Technical: no image paths or keys in artifacts.
- Quality: citation/taxonomy noise must not become lyrics.
- Security: HF/OpenAI credentials remain environment-only.

## Definition of Done

- Request contract is tested.
- Runnable command validates and saves artifacts.
- MP3 is created when Space access succeeds.

## Open Questions

- Current Space endpoint/API signature.
