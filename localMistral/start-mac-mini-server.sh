#!/bin/sh
set -eu

REMOTE_USER="${LOCAL_MISTRAL_USER:-dominikeggermann}"
REMOTE_HOST="${LOCAL_MISTRAL_HOST:-dominiks-Mac-mini.local}"
REMOTE_PORT="${LOCAL_MISTRAL_PORT:-8080}"
REMOTE_MODEL_PATH="${LOCAL_MISTRAL_MODEL_PATH:-~/.lmstudio/models/lmstudio-community/Ministral-3-3B-Instruct-2512-GGUF/Ministral-3-3B-Instruct-2512-Q4_K_M.gguf}"
REMOTE_THREADS="${LOCAL_MISTRAL_THREADS:-4}"
REMOTE_CONTEXT="${LOCAL_MISTRAL_CONTEXT:-2048}"

host_resolves_local() {
  python3 - "$REMOTE_HOST" <<'PY'
import ipaddress
import socket
import sys

host = sys.argv[1]
try:
    addrs = {item[4][0] for item in socket.getaddrinfo(host, 0, type=socket.SOCK_STREAM)}
except OSError:
    print("0")
    raise SystemExit(0)

is_local = any(ipaddress.ip_address(addr).is_loopback for addr in addrs)
print("1" if is_local else "0")
PY
}

START_CMD="
if pgrep -f 'llama-server.*${REMOTE_PORT}' >/dev/null 2>&1; then
  echo 'llama-server already running on port ${REMOTE_PORT}';
  exit 0;
fi

nohup ~/src/llama.cpp/build/bin/llama-server \
  -m ${REMOTE_MODEL_PATH} \
  -t ${REMOTE_THREADS} \
  -c ${REMOTE_CONTEXT} \
  -np 1 \
  --host 0.0.0.0 \
  --port ${REMOTE_PORT} \
  > ~/llama-server.log 2>&1 &

sleep 2
tail -n 20 ~/llama-server.log || true
"

if [ "$(host_resolves_local)" = "1" ]; then
  sh -c "$START_CMD"
else
  ssh "${REMOTE_USER}@${REMOTE_HOST}" "$START_CMD"
fi
