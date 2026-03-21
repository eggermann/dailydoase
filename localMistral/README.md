# localMistral

This folder wires the `dailydoase` Freshweb prompt pipeline to the local
Mistral-compatible server running on the Mac mini.

The local text model is:

- `Ministral-3-3B-Instruct-2512-Q4_K_M.gguf`

The OpenAI-compatible endpoint expected by these scripts is:

- local on Mac mini: `http://localhost:8080/v1`
- remote from another Mac on the LAN: `http://dominiks-Mac-mini.local:8080/v1`

## Files

- `env.local-mistral.sh`
  Exports the environment needed for the Freshweb scene-planning client to use
  the local OpenAI-compatible endpoint.
- `start-mac-mini-server.sh`
  Starts `llama-server` on the Mac mini over SSH.
- `start-mac-mini-vision-server.sh`
  Starts the multimodal `llama-server` on the Mac mini over SSH with `mmproj`.
- `test-chat.sh`
  Sends a simple chat request to the configured endpoint.
- `test-vision.sh`
  Sends a simple image + prompt request to the multimodal endpoint.
- `run-freshweb-local-mistral.sh`
  Loads the local Mistral env and runs the WAN 4:3 trippy Freshweb preset.

## Typical Use

From this project root:

```bash
sh localMistral/start-mac-mini-server.sh
sh localMistral/start-mac-mini-vision-server.sh
sh localMistral/test-chat.sh
sh localMistral/test-vision.sh
sh localMistral/run-freshweb-local-mistral.sh
```

The `start-mac-mini-*.sh` scripts work from either machine:

- on another Mac, they SSH into the Mac mini
- on the Mac mini itself, they detect the host resolves locally and start the server directly

## Fallback Flags

Use these when local Mistral should stay at the end of the chain instead of
being the primary text backend:

- `LOCAL_MISTRAL_AS_CHAT=1`
  Retries Freshweb scene-plan chat generation against the Mac mini after the
  primary chat request fails.
- `LOCAL_MISTRAL_AS_VISION=1`
  Appends `lmstudio` to the end of `FRESHWEB_VISION_PROVIDERS`.

Example:

```bash
LOCAL_MISTRAL_MODE=fallback LOCAL_MISTRAL_AS_CHAT=1 sh localMistral/run-freshweb-local-mistral.sh
```

Example with both flags:

```bash
LOCAL_MISTRAL_MODE=fallback LOCAL_MISTRAL_AS_CHAT=1 LOCAL_MISTRAL_AS_VISION=1 sh localMistral/run-freshweb-local-mistral.sh
```

## Important Limitation

This local Mistral setup is text-only. The wrapper therefore disables Freshweb
vision by default:

- `FRESHWEB_USE_VISION=0`

If you later want to keep external vision while using local Mistral only for
text scene planning, override that before launching:

```bash
FRESHWEB_USE_VISION=1 sh localMistral/run-freshweb-local-mistral.sh
```

The vision fallback uses the dedicated multimodal server on
`http://dominiks-Mac-mini.local:8082` by default.
