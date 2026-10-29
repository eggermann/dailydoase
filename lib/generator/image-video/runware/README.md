# Runware MiniMax H3 Max Turbo

Select `runwareH3MaxTurbo` for first/last-frame scenes or single-image scenes. The adapter sends keyframes through `inputs.frameImages` (`image` + `frame`), uses `resolution` (not `width`/`height`), and keeps H3's generated audio in the output.

```dotenv
RUNWARE_API_KEY=...
FRESHWEB_FIRST_LAST_VIDEO_MODEL_TYPE=runwareH3MaxTurbo
FRESHWEB_SINGLE_VIDEO_MODEL_TYPE=runwareH3MaxTurbo
FRESHWEB_RUNWARE_H3_RESOLUTION=480p
FRESHWEB_RUNWARE_H3_SOUND_PROMPT=Quiet room tone, soft movement sounds, no music.
```

`FRESHWEB_RUNWARE_H3_SOUND_PROMPT` is optional. When set, adapter appends it as a `Sound:` clause to each scene's visual prompt. Omit it to let H3 infer audio from the scene prompt. If every clip uses H3, the scene-loop merger keeps H3 audio and does not send the film through Mirelo.

Provider requests must be 5–15 seconds. Shorter planned scenes are generated at 5 seconds and trimmed to their requested scene duration, so they still cost the 5-second minimum. A planned scene over 15 seconds fails explicitly instead of silently changing its duration. `480p` is the default economy tier; `768p` is also supported.
