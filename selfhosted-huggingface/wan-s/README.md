---
title: Wan S
emoji: 🎬
colorFrom: blue
colorTo: gray
sdk: gradio
sdk_version: 5.22.0
app_file: app.py
pinned: false
---

# Wan S

Self-hosted Hugging Face Space for Wan image-to-video.

This folder is intended for upload to a Hugging Face Space, not as a local app inside this repo.

## Modes

- `Local GPU`
  Loads the selected Wan Diffusers model inside the Space.
- `Remote endpoint`
  Sends a JSON request to your own external endpoint and only uses the Space as a UI shell.

## Recommended hardware

- `ZeroGPU` for small tests
- paid GPU for stable or repeated use

## Supported model flow

- official Wan presets
- custom Diffusers-compatible Wan repo IDs

## Useful environment variables

- `WAN_MODEL_PRESET`
- `WAN_DEFAULT_FPS`
- `WAN_DEFAULT_NUM_FRAMES`
- `WAN_DEFAULT_STEPS`
- `WAN_DEFAULT_GUIDANCE`
- `WAN_DEFAULT_SEED`

## Notes

- `Custom max area` overrides the preset resolution budget.
- `Remote endpoint` is useful when you want fixed billing outside Hugging Face Space GPU quotas.
- Generated local temp outputs should not be committed.
