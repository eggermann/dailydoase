# Exhibition Agent Role

## One local AI machine

The exhibition has exactly one local AI machine: the Mac mini.

- Mac mini is the only permitted host for local vision and local language models.
- This Mac captures camera frames, runs the Node exhibition controller, stores logs,
  starts cloud render jobs, and plays completed movies.
- This Mac must not start, select, or silently fall back to LM Studio, Ollama,
  llama.cpp, or any other local model endpoint.

## Approved model routes

```text
Camera on exhibition Mac
  -> Mac mini over SSH/Tailscale: local Qwen3-VL vision
  -> OpenAI: scene planning
  -> Runware: image and Wan First/Last rendering
  -> Exhibition Mac: playback and archive
```

Cloud models are allowed because they are explicit render or planning services.
They are not a fallback for local camera vision without a visible log message.

## Required before every exhibition run

1. Confirm the Mac mini is reachable over Tailscale and SSH.
2. Confirm its vision server health endpoint answers `{"status":"ok"}`.
3. Log the vision provider, model name, and host for every camera analysis.
4. Abort camera analysis clearly if the Mac mini is unavailable. Do not use a
   model running on this Mac as fallback.

## Current correction

Run 821 used `lmstudio` with `mistralai/ministral-3-3b`. This is not an
approved exhibition vision route. It remains an archived test run only.

Before the next exhibition run, connect the generator's camera-vision adapter
to the Mac mini Qwen3-VL endpoint and verify the run artifact reports that
remote provider and model.
