#!/bin/sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
VOLUME=/Volumes/DAILYDOASE_MEDIA
OUTPUT="$VOLUME/dailydoase-generations/eu-reski/GENERATIONS/news/exhibition/mac-mini/scene-campaign-10h"
export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export MAGICK_BIN=/Applications/MAMP/Library/bin/convert
export FC_MATCH_BIN="$ROOT/deploy/mini-font-match.sh"
export FFMPEG_BIN=/usr/local/bin/ffmpeg
export NEWS_OUTPUT_DIR="$OUTPUT"
export EXHIBITION_CODEX_REPAIR="${EXHIBITION_CODEX_REPAIR:-1}"
export EXHIBITION_COOPERATIVE_RESTART="${EXHIBITION_COOPERATIVE_RESTART:-1}"
export NEWS_SCENE_PATH=eu-reski-news/scenes/campaign-10h
export NEWS_ENV_FILE="${NEWS_ENV_FILE:-/Users/dominikeggermann/Projekte/dailydoase/.env}"
export NEWS_STYLE_REFERENCE="${NEWS_STYLE_REFERENCE:-/Users/dominikeggermann/Projekte/EU-RESKI/guernica-by-pablo-picasso.jpg!Large.jpg}"
export GUERNICA_DIRECTORY="${GUERNICA_DIRECTORY:-/Users/dominikeggermann/Projekte/EU-RESKI/guernica_elemente_maskiert}"
cd "$ROOT"

while ! /sbin/mount | /usr/bin/grep -F " on $VOLUME " >/dev/null; do
  echo 'Waiting for DAILYDOASE_MEDIA volume.'
  /bin/sleep 30
done
mkdir -p "$OUTPUT"
if [ -f "$OUTPUT/.campaign-complete" ]; then
  if python3 "$ROOT/deploy/verify-exhibition-campaign-complete.py" "$ROOT" "$OUTPUT"; then
    echo 'The exhibition campaign has already completed.'
    exit 0
  fi
  rm -f "$OUTPUT/.campaign-complete"
fi
while /usr/bin/pgrep -f '/eu-reski-news/scripts/exhibition-runner.mjs' >/dev/null; do
  echo 'Waiting for the current exhibition run to finish.'
  /bin/sleep 30
done

if python3 "$ROOT/deploy/verify-exhibition-campaign-complete.py" "$ROOT" "$OUTPUT"; then
  touch "$OUTPUT/.campaign-complete"
  echo 'The exhibition campaign has already completed.'
  exit 0
fi
if python3 - "$OUTPUT/exhibition-state.json" <<'PY'
import json, sys
try:
    workers = json.load(open(sys.argv[1])).get('sceneWorkers', {})
    finished = bool(workers) and all(worker.get('status') == 'completed' for worker in workers.values())
except Exception:
    finished = False
raise SystemExit(0 if finished else 1)
PY
then
  if [ "${CAMPAIGN_NEW_RUN:-0}" != 1 ]; then
    echo 'Saved workers finished below their configured iteration counts; starting a new Run and retaining prior Run directories.'
    CAMPAIGN_NEW_RUN=1
  fi
fi

if [ "${CAMPAIGN_NEW_RUN:-0}" = 1 ]; then
  npm run news:exhibition:from-scene-json -- --new-run --generation-interval=10h
else
  npm run news:exhibition:from-scene-json -- --generation-interval=10h
fi
python3 "$ROOT/deploy/verify-exhibition-campaign-complete.py" "$ROOT" "$OUTPUT" || {
  echo 'Campaign still has unfinished or under-counted Scene workers; completion marker withheld.' >&2
  exit 1
}
touch "$OUTPUT/.campaign-complete"
