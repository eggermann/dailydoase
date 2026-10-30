#!/bin/sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
VOLUME=/Volumes/DAILYDOASE_MEDIA
OUTPUT="$VOLUME/dailydoase-generations/eu-reski/GENERATIONS/news/exhibition/mac-mini/scene-campaign-10h"
export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export NEWS_OUTPUT_DIR="$OUTPUT"
export NEWS_SCENE_PATH=eu-reski-news/scenes/campaign-10h
export NEWS_ENV_FILE="${NEWS_ENV_FILE:-/Users/dominikeggermann/Projekte/dailydoase/.env}"
cd "$ROOT"

while ! /sbin/mount | /usr/bin/grep -F " on $VOLUME " >/dev/null; do
  echo 'Waiting for DAILYDOASE_MEDIA volume.'
  /bin/sleep 30
done
mkdir -p "$OUTPUT"
if [ -f "$OUTPUT/.campaign-complete" ]; then
  echo 'The five-iteration campaign has already completed.'
  exit 0
fi
while /usr/bin/pgrep -f '/eu-reski-news/scripts/exhibition-runner.mjs' >/dev/null; do
  echo 'Waiting for the current exhibition run to finish.'
  /bin/sleep 30
done

npm run news:exhibition:from-scene-json -- --generation-interval=10h --stop-after-iterations=5
touch "$OUTPUT/.campaign-complete"
