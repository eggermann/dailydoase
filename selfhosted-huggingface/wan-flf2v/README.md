---
title: Wan FLF2V
emoji: 🎞️
colorFrom: green
colorTo: gray
sdk: gradio
sdk_version: 5.22.0
app_file: app.py
pinned: false
---

# Wan FLF2V

Self-hosted Hugging Face Space for Wan first-frame / last-frame video generation.

This folder is intended for upload to a Hugging Face Space, not as a local app inside this repo.

## Input model

- one start frame
- one end frame
- Wan FLF2V Diffusers model inside the Space

## Recommended hardware

- `ZeroGPU` for small tests
- paid GPU for more reliable runs

## Useful environment variables

- `WAN_MODEL_ID`

## Notes

- The UI intentionally exposes a broad parameter range for testing.
- `Custom max area` overrides the default resize budget.
- Generated local temp outputs should not be committed.
