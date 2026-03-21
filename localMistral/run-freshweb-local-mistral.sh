#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "${SCRIPT_DIR}/.." && pwd)

. "${SCRIPT_DIR}/env.local-mistral.sh"

DEFAULT_PRESET="lib/generator/adapter/MIX-again-freshweb.prompt-fast-wan-trippy-4-3.sh"
PRESET_PATH="${LOCAL_MISTRAL_PRESET:-$DEFAULT_PRESET}"

port_is_open() {
  python3 - "$1" "$2" <<'PY'
import socket
import sys

host = sys.argv[1]
port = int(sys.argv[2])

try:
    with socket.create_connection((host, port), timeout=2):
        print("1")
except OSError:
    print("0")
PY
}

wait_for_port() {
  host="$1"
  port="$2"
  attempts="${3:-20}"

  i=0
  while [ "$i" -lt "$attempts" ]; do
    if [ "$(port_is_open "$host" "$port")" = "1" ]; then
      return 0
    fi
    i=$((i + 1))
    sleep 1
  done

  return 1
}

ensure_chat_server() {
  if [ "$LOCAL_MISTRAL_MODE" != "primary" ] && [ "${LOCAL_MISTRAL_AS_CHAT:-0}" != "1" ]; then
    return 0
  fi

  if [ "$(port_is_open "$LOCAL_MISTRAL_HOST" "$LOCAL_MISTRAL_PORT")" = "1" ]; then
    return 0
  fi

  echo "[localMistral] chat server not reachable on ${LOCAL_MISTRAL_HOST}:${LOCAL_MISTRAL_PORT}; starting it..."
  sh "${SCRIPT_DIR}/start-mac-mini-server.sh"
  wait_for_port "$LOCAL_MISTRAL_HOST" "$LOCAL_MISTRAL_PORT" || {
    echo "[localMistral] failed to reach chat server on ${LOCAL_MISTRAL_HOST}:${LOCAL_MISTRAL_PORT} after startup" >&2
    exit 1
  }
}

ensure_vision_server() {
  if [ "${LOCAL_MISTRAL_AS_VISION:-0}" != "1" ]; then
    return 0
  fi

  if [ "$(port_is_open "$LOCAL_MISTRAL_HOST" "$LOCAL_MISTRAL_VISION_PORT")" = "1" ]; then
    return 0
  fi

  echo "[localMistral] vision server not reachable on ${LOCAL_MISTRAL_HOST}:${LOCAL_MISTRAL_VISION_PORT}; starting it..."
  sh "${SCRIPT_DIR}/start-mac-mini-vision-server.sh"
  wait_for_port "$LOCAL_MISTRAL_HOST" "$LOCAL_MISTRAL_VISION_PORT" || {
    echo "[localMistral] failed to reach vision server on ${LOCAL_MISTRAL_HOST}:${LOCAL_MISTRAL_VISION_PORT} after startup" >&2
    exit 1
  }
}

ensure_chat_server
ensure_vision_server

cd "${PROJECT_ROOT}"
exec sh "${PROJECT_ROOT}/${PRESET_PATH}" "$@"
