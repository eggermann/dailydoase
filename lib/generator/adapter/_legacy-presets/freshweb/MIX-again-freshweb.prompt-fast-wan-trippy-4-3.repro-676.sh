#!/bin/zsh
set -euo pipefail

cd "$(dirname "$0")"

# Replay the closest reproducible setup for GENERATIONS/676:
# - reuse the likely opening camera still from that run window
# - pin the old fish/fries cue stream and scene lengths
# - keep WAN single-image on the provider path
# - disable drift correction so motion is not clamped

export FRESHWEB_FOLDER=${FRESHWEB_FOLDER:-repro-676-freshweb-prompt-fast-wan-trippy-4-3}
export FRESHWEB_CAMERA_IMAGE_PATH=${FRESHWEB_CAMERA_IMAGE_PATH:-$(pwd)/../../../tests/GENERATIONS/camera-shot/1773960291840-camera.jpg}

export FRESHWEB_STATIC_TEST=1
export FRESHWEB_SCENE_COUNT=${FRESHWEB_SCENE_COUNT:-7}
export FRESHWEB_SCENE_LENGTHS=${FRESHWEB_SCENE_LENGTHS:-3.2,2.4,3.2,2.4,3.2,2.4,3.2}
export FRESHWEB_STATIC_SOURCE_CUES="${FRESHWEB_STATIC_SOURCE_CUES:-plate of fish|fish and chips twist and morph|potato tornado|ominous shadows darken the room|fish begins to sizzle and bubble|plate of currywurst appears|man digs into currywurst}"

export FRESHWEB_RETRY_ON_FAILURE=0
export FRESHWEB_SELF_HOSTED_SINGLE=0
export FRESHWEB_WAN_SINGLE_USE_HF_PROVIDER_FALLBACK=1
export FRESHWEB_WAN_SINGLE_FORCE_HF_PROVIDER=1

export FRESHWEB_DRIFT_CORRECTION_LEVEL=default
export FRESHWEB_ENABLE_DRIFT_CORRECTION=0
export FRESHWEB_DRIFT_CORRECTION_USE_CAMERA_REFERENCE=0

exec sh "$(pwd)/MIX-again-freshweb.prompt-fast-wan-trippy-4-3.sh" "$@"
