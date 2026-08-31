#!/bin/sh
set -eu

# Private Qwen3-VL server on Dominik's Intel Mac mini. The runner opens an
# SSH tunnel, so Freshweb only ever calls the loopback URL below.
export FRESHWEB_VISION_CONFIG="${FRESHWEB_VISION_CONFIG:-mac-mini-vision}"
export MAC_MINI_VISION_SSH_TARGET="${MAC_MINI_VISION_SSH_TARGET:-dominikeggermann@dominiks-mac-mini-ts-3}"
export MAC_MINI_VISION_REMOTE_PORT="${MAC_MINI_VISION_REMOTE_PORT:-8080}"
export MAC_MINI_VISION_LOCAL_PORT="${MAC_MINI_VISION_LOCAL_PORT:-18080}"
export MAC_MINI_VISION_LOCAL="${MAC_MINI_VISION_LOCAL:-0}"
export MAC_MINI_VISION_MODEL="${MAC_MINI_VISION_MODEL:-Qwen3-VL-2B-Instruct-Q4_K_M.gguf}"
export MAC_MINI_VISION_TUNNEL_TIMEOUT_SECONDS="${MAC_MINI_VISION_TUNNEL_TIMEOUT_SECONDS:-20}"

if [ "${MAC_MINI_VISION_LOCAL}" = "1" ]; then
  export LMSTUDIO_URL="${LMSTUDIO_URL:-http://127.0.0.1:${MAC_MINI_VISION_REMOTE_PORT}}"
else
  export LMSTUDIO_URL="${LMSTUDIO_URL:-http://127.0.0.1:${MAC_MINI_VISION_LOCAL_PORT}}"
fi
export LMSTUDIO_MODEL="${LMSTUDIO_MODEL:-${MAC_MINI_VISION_MODEL}}"

# Qwen is intentionally a cheap presence gate only. Scene planning stays on
# its configured chat provider and the recurring persona description is off.
export FRESHWEB_REQUIRE_PERSON_IN_CAMERA="${FRESHWEB_REQUIRE_PERSON_IN_CAMERA:-1}"
export FRESHWEB_CAMERA_PRESENCE_VISION_PROVIDERS="${FRESHWEB_CAMERA_PRESENCE_VISION_PROVIDERS:-mac-mini-vision}"
export FRESHWEB_USE_WEBCAM_PERSONA_REFERENCE="${FRESHWEB_USE_WEBCAM_PERSONA_REFERENCE:-0}"
