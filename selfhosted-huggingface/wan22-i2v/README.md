---
title: Wan 2.2 I2V
emoji: 🎬
colorFrom: cyan
colorTo: gray
sdk: gradio
sdk_version: 5.22.0
app_file: app.py
pinned: false
---

# Wan 2.2 I2V

Self-hosted Hugging Face Space for the official `Wan-AI/Wan2.2-I2V-A14B-Diffusers` image-to-video model.

This Space is a practical alternative test target when `wan-flf2v` transitions drift or fail on large first/last-frame gaps.

## Input model

- one start image
- official Wan 2.2 I2V Diffusers model

## Recommended hardware

- `ZeroGPU` for small tests
- paid GPU for repeated or higher-resolution runs

## Useful environment variables

- `WAN_MODEL_ID`
- `WAN_DEFAULT_MAX_AREA`
- `WAN_DEFAULT_NUM_FRAMES`
- `WAN_DEFAULT_FPS`
- `WAN_DEFAULT_STEPS`
- `WAN_DEFAULT_GUIDANCE`
- `WAN_DEFAULT_SEED`

## Notes

- This is not a first/last-frame Space. It is a cleaner Wan 2.2 I2V baseline.
- `Custom max area` overrides the resize budget directly.
- Generated local temp outputs should not be committed.
