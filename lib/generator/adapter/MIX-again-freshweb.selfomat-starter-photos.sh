#!/bin/zsh
set -euo pipefail

# Selfomat test: one generated starter photo per queued input image.
# No video, no last-video-frame chaining, no Mirelo audio.
export FRESHWEB_SELFOMAT_ENABLED=1
export FRESHWEB_SELFOMAT_IMAGE_ONLY=1
export FRESHWEB_MAX_ITERATIONS=${FRESHWEB_MAX_ITERATIONS:-5}
export FRESHWEB_WORDS="${FRESHWEB_WORDS:-love,en | animal,en | Casino,en}"
export FRESHWEB_FOLDER=${FRESHWEB_FOLDER:-selfomat-starter-photos}
export FRESHWEB_SCENE_COUNT=${FRESHWEB_SCENE_COUNT:-1}
export FRESHWEB_SCENE_LENGTHS=${FRESHWEB_SCENE_LENGTHS:-1}
export FRESHWEB_REALITY_INTRUSION_MODE=off
export FRESHWEB_MIRELO_MODE=off
export FRESHWEB_CAST_CONTEXT_ENABLED=0
export FRESHWEB_CHAIN_FROM_PREVIOUS_LOOP_LAST_FRAME=0
export FRESHWEB_RESTART_FROM_PREVIOUS_MOVIE_LAST_FRAME=0
export FRESHWEB_OPENING_START_ENABLED=1
export FRESHWEB_OPENING_START_MODE=fluxContext
export FRESHWEB_OPENING_START_INTERVAL=1
export FRESHWEB_SCENE_VISUAL_DIRECTION='Real imperfect starter photo. Current visitor is the main person nearest the camera. Keep the exact face and clothing from the input reference. For every scene, choose a loose handheld-phone or small-drone viewpoint only when it fits the visible story event; re-evaluate it each scene, so it may switch between scenes. Then choose one story-motivated pan, focus shift, approach, retreat, hover, reframe, or shake, and show only its believable still-image consequence. Semantic mix: love, animal, and Casino, shown as one small physical story beat. No movie frame, no polished portrait, no collage.'
export FRESHWEB_CAMERA_STYLE='Story-selected loose phone or small-drone viewpoint. One distinct camera move per scene; no default fixed angle or studio polish.'

if [[ -z "${FRESHWEB_CAMERA_PERSON_QUEUE_PATH:-}" ]]; then
  echo 'FRESHWEB_CAMERA_PERSON_QUEUE_PATH required' >&2
  exit 2
fi

export FRESHWEB_CAMERA_PERSON_QUEUE_CONSUMED_PATH="${FRESHWEB_CAMERA_PERSON_QUEUE_CONSUMED_PATH:-${FRESHWEB_CAMERA_PERSON_QUEUE_PATH%.json}.consumed.json}"

exec "$(dirname "$0")/MIX-again-freshweb.selfomat.sh"
