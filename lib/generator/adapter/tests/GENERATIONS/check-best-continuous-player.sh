#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "${SCRIPT_DIR}/../../../../.." && pwd)
BEST_FOLDER="lib/generator/adapter/tests/GENERATIONS/best/parts"

cd "${REPO_ROOT}"

echo "[1/5] rebuild best parts alias folder"
chmod +x lib/generator/adapter/tests/GENERATIONS/rebuild-best-parts-folder.sh
sh lib/generator/adapter/tests/GENERATIONS/rebuild-best-parts-folder.sh >/dev/null

echo "[2/5] count linked videos"
find "${BEST_FOLDER}" -maxdepth 1 -type l \( -name '*.mp4' -o -name '*.mov' -o -name '*.webm' \) | wc -l

echo "[3/5] check server file syntax"
/usr/local/bin/node --check lib/server/index.cjs

echo "[4/5] restart local server on :4000"
pkill -f "lib/server/test.cjs" || true
nohup /usr/local/bin/node lib/server/test.cjs >/tmp/dailydoase-server.log 2>&1 &
sleep 2

echo "[5/5] query player API"
curl "http://localhost:4000/continuous-video-api?folder=${BEST_FOLDER}"

echo
echo "Open:"
echo "http://localhost:4000/continuous-video?folder=${BEST_FOLDER}"
