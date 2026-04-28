#!/bin/zsh
set -euo pipefail

cd "$(dirname "$0")"

# Robots preset:
# - use one remote protagonist reference instead of a live webcam shot
# - map each scene through the next remote folder image with flux-context
# - keep the scene generator and shorty-book flow
# - keep output on the self-hosted wan-mixed Space
# - add Mirelo audio after each generated video

export FRESHWEB_FOLDER=${FRESHWEB_FOLDER:-freshweb-shorty-book-robots-test}
export FRESHWEB_POLLING_TIME_MS=${FRESHWEB_POLLING_TIME_MS:-0}
export FRESHWEB_ALLOW_PAID_FAL_POLLING=${FRESHWEB_ALLOW_PAID_FAL_POLLING:-0}
export VIDEO_MODE_PRESET=${VIDEO_MODE_PRESET:-storyDrivenMixed}

unset FRESHWEB_CAMERA_IMAGE_PATH
unset FRESHWEB_OPENING_IMAGE_PATH

export FRESHWEB_CAMERA_SOURCE_LABEL=${FRESHWEB_CAMERA_SOURCE_LABEL:-source frame}
unset FRESHWEB_CAMERA_IMAGE_URL
unset FRESHWEB_CAMERA_IMAGE_URLS
unset FRESHWEB_OPENING_IMAGE_URL
unset FRESHWEB_OPENING_IMAGE_URLS
export FRESHWEB_PROTAGONIST_IMAGE_URL="${FRESHWEB_PROTAGONIST_IMAGE_URL:-https://dailydoase.de/v/315-HF-/1-62601.png}"
export FRESHWEB_SCENE_CONTEXT_IMAGE_MAPPING_ENABLED=${FRESHWEB_SCENE_CONTEXT_IMAGE_MAPPING_ENABLED:-1}
export FRESHWEB_SCENE_CONTEXT_IMAGE_START_AFTER_PROTAGONIST=${FRESHWEB_SCENE_CONTEXT_IMAGE_START_AFTER_PROTAGONIST:-1}
export FRESHWEB_SCENE_CONTEXT_IMAGE_FOLDER_URL="${FRESHWEB_SCENE_CONTEXT_IMAGE_FOLDER_URL:-https://dailydoase.de/v/315-HF-/}"
export FRESHWEB_OPENING_PROMPT="${FRESHWEB_OPENING_PROMPT:-remote protagonist reference image, candid documentary still, natural light, clear subject focus}"
export FRESHWEB_SCENE_VISUAL_DIRECTION="${FRESHWEB_SCENE_VISUAL_DIRECTION:-use the fixed protagonist reference for identity, use the next folder image only as scene context, mix both with the wordstream into a coherent scene, keep one readable protagonist, let pose, gaze, and world pressure change while identity stays grounded}"

export FRESHWEB_OPENING_START_ENABLED=${FRESHWEB_OPENING_START_ENABLED:-0}
export FRESHWEB_OPENING_START_MODE=${FRESHWEB_OPENING_START_MODE:-fluxContext}
export FRESHWEB_OPENING_START_INTERVAL=${FRESHWEB_OPENING_START_INTERVAL:-1}
export FRESHWEB_LOCK_PROMPT_CONTINUITY_TO_OPENING_FRAME=${FRESHWEB_LOCK_PROMPT_CONTINUITY_TO_OPENING_FRAME:-1}

export FRESHWEB_MIRELO_MODE=${FRESHWEB_MIRELO_MODE:-afterEachVideo}

export FRESHWEB_SELF_HOSTED_SINGLE=${FRESHWEB_SELF_HOSTED_SINGLE:-1}
export WAN22_SINGLE_SELF_HOSTED_SPACE=${WAN22_SINGLE_SELF_HOSTED_SPACE:-eggman-poff/wan-mixed}
export FRESHWEB_WAN_SINGLE_FALLBACK_SPACES=''
export FRESHWEB_WAN_SINGLE_USE_HF_PROVIDER_FALLBACK=0
unset FRESHWEB_WAN_SINGLE_FORCE_HF_PROVIDER
export FRESHWEB_ENABLE_RUNWARE_FALLBACKS=${FRESHWEB_ENABLE_RUNWARE_FALLBACKS:-0}

export FRESHWEB_DRIFT_CORRECTION_LEVEL=${FRESHWEB_DRIFT_CORRECTION_LEVEL:-default}
export FRESHWEB_ENABLE_DRIFT_CORRECTION=${FRESHWEB_ENABLE_DRIFT_CORRECTION:-0}
export FRESHWEB_DRIFT_CORRECTION_USE_CAMERA_REFERENCE=${FRESHWEB_DRIFT_CORRECTION_USE_CAMERA_REFERENCE:-0}

exec sh "$(pwd)/MIX-again-freshweb.prompt-fast-wan-trippy-4-3.sh" "$@"
