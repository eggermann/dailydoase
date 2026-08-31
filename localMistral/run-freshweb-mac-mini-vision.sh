#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "${SCRIPT_DIR}/.." && pwd)

. "${SCRIPT_DIR}/env.mac-mini-vision.sh"

PRESET_PATH="${MAC_MINI_VISION_PRESET:-lib/generator/adapter/MIX-again-freshweb.prompt-fast-wan-strict-4-3.sh}"
TUNNEL_PID=""

# The strict preset sees this and does not launch a second connection.
export MAC_MINI_VISION_TUNNEL_ACTIVE=1

cleanup() {
  if [ -n "${TUNNEL_PID}" ] && kill -0 "${TUNNEL_PID}" 2>/dev/null; then
    kill "${TUNNEL_PID}" 2>/dev/null || true
    wait "${TUNNEL_PID}" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

if [ "${MAC_MINI_VISION_LOCAL}" != "1" ]; then
  ssh \
    -o BatchMode=yes \
    -o ExitOnForwardFailure=yes \
    -o ConnectTimeout=10 \
    -o "HostKeyAlias=${MAC_MINI_VISION_SSH_HOST_KEY_ALIAS}" \
    -N \
    -L "127.0.0.1:${MAC_MINI_VISION_LOCAL_PORT}:127.0.0.1:${MAC_MINI_VISION_REMOTE_PORT}" \
    "${MAC_MINI_VISION_SSH_TARGET}" &
  TUNNEL_PID=$!
fi

attempt=0
until curl -fsS "${LMSTUDIO_URL}/health" >/dev/null 2>&1; do
  if [ -n "${TUNNEL_PID}" ] && ! kill -0 "${TUNNEL_PID}" 2>/dev/null; then
    echo "mac-mini-vision SSH tunnel stopped before Qwen became reachable" >&2
    exit 1
  fi
  attempt=$((attempt + 1))
  if [ "${attempt}" -ge "${MAC_MINI_VISION_TUNNEL_TIMEOUT_SECONDS}" ]; then
    echo "mac-mini-vision Qwen health check failed at ${LMSTUDIO_URL}" >&2
    exit 1
  fi
  sleep 1
done

cd "${PROJECT_ROOT}"
sh "${PROJECT_ROOT}/${PRESET_PATH}" "$@"
