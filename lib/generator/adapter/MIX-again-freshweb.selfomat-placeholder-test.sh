#!/bin/zsh
set -euo pipefail

# Planning test: one local input image instead of webcam.
# Vision describes it once; first run plans five scenes from a takt pattern.
export FRESHWEB_SELFOMAT_ENABLED=${FRESHWEB_SELFOMAT_ENABLED:-1}
export FRESHWEB_TEST_INPUT_IMAGE_MODE=1
export FRESHWEB_TEST_INPUT_IMAGE_PATH="${FRESHWEB_TEST_INPUT_IMAGE_PATH:?Set FRESHWEB_TEST_INPUT_IMAGE_PATH to a local image}"
export FRESHWEB_MAX_ITERATIONS=${FRESHWEB_MAX_ITERATIONS:-1}
export FRESHWEB_SCENE_COUNT_MODE=taktmuster
export FRESHWEB_SCENE_COUNT=
export FRESHWEB_SCENE_LENGTHS=
export FRESHWEB_SCENE_COUNT_INITIAL_PATTERN=${FRESHWEB_SCENE_COUNT_INITIAL_PATTERN:-5}
export FRESHWEB_USE_TAKTMUSTER_LENGTHS=1
export FRESHWEB_WORDS="${FRESHWEB_WORDS:-love,en | animal,en}"
export FRESHWEB_FOLDER=${FRESHWEB_FOLDER:-selfomat-placeholder-five-scenes}
export FRESHWEB_REALITY_INTRUSION_MODE=off
export FRESHWEB_CHAIN_FROM_PREVIOUS_LOOP_LAST_FRAME=0
export FRESHWEB_RESTART_FROM_PREVIOUS_MOVIE_LAST_FRAME=0
export FRESHWEB_OPENING_START_ENABLED=0
export FRESHWEB_SCENE_VISUAL_DIRECTION='Five connected, visible scene consequences from the input image. Current visitor remains the protagonist. Preserve identity, clothing, room geometry, and image mood. Let love and animal become physical actions, not explanation. Documentary, imperfect, natural.'
export FRESHWEB_CAMERA_STYLE='Use provided placeholder image as source frame; no webcam capture.'

exec "$(dirname "$0")/MIX-again-freshweb.selfomat.sh"
