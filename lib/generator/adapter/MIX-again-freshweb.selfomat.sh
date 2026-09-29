#!/bin/zsh
set -euo pipefail

# First Selfomat prototype. The existing generator supplies live camera,
# semantic stream, short clips, and cast-context rendering.
export FRESHWEB_SELFOMAT_ENABLED=1
export FRESHWEB_SCENE_COUNT_MODE=${FRESHWEB_SCENE_COUNT_MODE:-taktmuster}
export FRESHWEB_WORDS="${FRESHWEB_WORDS:-Celebration,en | memory,en | reunion,en}"
export FRESHWEB_FOLDER=${FRESHWEB_FOLDER:-selfomat-first-test}
if [[ "$FRESHWEB_SCENE_COUNT_MODE" == "semantic" || "$FRESHWEB_SCENE_COUNT_MODE" == "taktmuster" ]]; then
  export FRESHWEB_SCENE_COUNT="${FRESHWEB_SCENE_COUNT:-}"
  export FRESHWEB_SCENE_LENGTHS="${FRESHWEB_SCENE_LENGTHS:-}"
else
  export FRESHWEB_SCENE_COUNT=${FRESHWEB_SCENE_COUNT:-3}
  export FRESHWEB_SCENE_LENGTHS=${FRESHWEB_SCENE_LENGTHS:-3,2,2}
fi
export FRESHWEB_REALITY_INTRUSION_MODE=off
export FRESHWEB_CAST_CONTEXT_ENABLED=1
export FRESHWEB_SELFOMAT_PORT=${FRESHWEB_SELFOMAT_PORT:-4011}
export FRESHWEB_SELFOMAT_STATE_DIR=${FRESHWEB_SELFOMAT_STATE_DIR:-.selfomat}
export FRESHWEB_SCENE_VISUAL_DIRECTION='A short, accidental iPhone selfie memory. The current real visitor is the main person nearest the phone. One earlier visitor may return and share a tiny celebratory action motivated by each semantic cue. Keep recognizable faces, natural skin, uneven light, slight blur, odd angle, mild overexposure, and messy frame edges. Ordinary, intimate, imperfect, unposed.'
export FRESHWEB_CAMERA_STYLE='Handheld front-phone camera, casually tilted and imperfectly framed. Uneven available light, no studio polish.'

exec "$(dirname "$0")/MIX-again-freshweb.glas-kaufhaus-trailer.sh"
