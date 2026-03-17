---
title: Wan Mixed
emoji: 🎬
colorFrom: blue
colorTo: gray
sdk: gradio
sdk_version: 5.22.0
app_file: app.py
pinned: false
---

# Wan Mixed

Self-hosted Hugging Face Space that exposes both Wan image-to-video and Wan first-last-frame generation from one Space.

## API compatibility

- `/generate_video_safe`
  Single-image image-to-video, compatible with the existing `wan-s` client path.
- `/generate_video`
  First-last-frame video generation, compatible with the existing `wan-flf2v` client path.

## Default models

- Single-image: `Wan-AI/Wan2.2-I2V-A14B-Diffusers`
- First-last: `Wan-AI/Wan2.1-FLF2V-14B-720P-diffusers`

## Why this exists

- one Space URL instead of two
- one billing target on Hugging Face
- no immediate adapter rewrite required if both clients point to the same Space ID

## Notes

- The Space unloads the currently active pipeline when switching between I2V and FLF2V modes.
- Generated local temp outputs should not be committed.
