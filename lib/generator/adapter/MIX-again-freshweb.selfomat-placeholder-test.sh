#!/bin/zsh
set -euo pipefail

# Planning-only test: one local input image, two iterations, three scenes each.
# Vision and scene planning run; image, video, and audio generation stay off.
export FRESHWEB_SELFOMAT_ENABLED=${FRESHWEB_SELFOMAT_ENABLED:-1}
export FRESHWEB_SELFOMAT_DRY_RUN=${FRESHWEB_SELFOMAT_DRY_RUN:-1}
export FRESHWEB_TEST_INPUT_IMAGE_MODE=1
export FRESHWEB_TEST_INPUT_IMAGE_FOLDER=${FRESHWEB_TEST_INPUT_IMAGE_FOLDER:-"$(cd "$(dirname "$0")/../../.." && pwd)/surprise_selfies_folder"}
export FRESHWEB_TEST_INPUT_IMAGE_PATH=${FRESHWEB_TEST_INPUT_IMAGE_PATH:-}
export FRESHWEB_MAX_ITERATIONS=${FRESHWEB_MAX_ITERATIONS:-2}
export FRESHWEB_SCENE_COUNT_MODE=${FRESHWEB_SCENE_COUNT_MODE:-explicit}
export FRESHWEB_SCENE_COUNT=${FRESHWEB_SCENE_COUNT:-3}
export FRESHWEB_SCENE_LENGTHS=${FRESHWEB_SCENE_LENGTHS:-3,2,2}
export FRESHWEB_USE_TAKTMUSTER_LENGTHS=0
export FRESHWEB_WORDS="${FRESHWEB_WORDS:-love,en | animal,en | Casino,en}"
export GENERATIONS_PATH=${GENERATIONS_PATH:-GENERATION-SELFIEBOX}
export FRESHWEB_FOLDER=${FRESHWEB_FOLDER:-selfomat-love-animal-casino-two-iterations-dry-run}
export FRESHWEB_REALITY_INTRUSION_MODE=off
export FRESHWEB_CHAIN_FROM_PREVIOUS_LOOP_LAST_FRAME=0
export FRESHWEB_RESTART_FROM_PREVIOUS_MOVIE_LAST_FRAME=0
export FRESHWEB_OPENING_START_ENABLED=0
export FRESHWEB_SCENE_VISUAL_DIRECTION='Five connected, visible scene consequences from the input image. Current visitor remains the protagonist. Preserve identity, clothing, room geometry, and image mood. Let love, animal, and Casino become physical actions, not explanation. For every scene choose a story-motivated loose handheld-phone or small-drone viewpoint; re-evaluate it each scene, so it may switch between scenes. Then choose one distinct camera move such as pan, focus shift, approach, retreat, hover, reframe, or shake. Never repeat a fixed camera angle by default. Documentary, imperfect, natural.'
export FRESHWEB_CAMERA_STYLE='Use provided placeholder image as source frame. Story selects a loose phone or small-drone viewpoint plus one distinct camera move; no fixed default angle.'

exec "$(dirname "$0")/MIX-again-freshweb.selfomat.sh"
