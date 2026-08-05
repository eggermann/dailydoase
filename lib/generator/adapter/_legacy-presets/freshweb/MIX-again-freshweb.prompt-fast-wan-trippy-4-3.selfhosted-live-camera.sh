#!/bin/zsh
set -euo pipefail

cd "$(dirname "$0")"

# Generic live-camera WAN trippy 4:3 preset on the self-hosted wan-mixed Space:
# - always start from a fresh live webcam shot
# - do not pin replay/test cues or scene lengths
# - use only the self-hosted wan-mixed single-image path
# - disable drift correction to avoid clamped motion

export FRESHWEB_FOLDER=${FRESHWEB_FOLDER:-freshweb-prompt-fast-wan-trippy-4-3-selfhosted-live-camera}

# Force a fresh webcam opening shot even if the caller exported a fixed image before.
unset FRESHWEB_CAMERA_IMAGE_PATH
unset FRESHWEB_OPENING_IMAGE_PATH

# Clear replay/test-specific overrides so this stays generic.
unset FRESHWEB_STATIC_TEST
unset FRESHWEB_SCENE_COUNT
unset FRESHWEB_SCENE_LENGTHS
unset FRESHWEB_STATIC_SOURCE_CUES

export FRESHWEB_SELF_HOSTED_SINGLE=1
export WAN22_SINGLE_SELF_HOSTED_SPACE=${WAN22_SINGLE_SELF_HOSTED_SPACE:-eggman-poff/wan-mixed}
export FRESHWEB_WAN_SINGLE_FALLBACK_SPACES=''
export FRESHWEB_WAN_SINGLE_USE_HF_PROVIDER_FALLBACK=0
unset FRESHWEB_WAN_SINGLE_FORCE_HF_PROVIDER

export FRESHWEB_DRIFT_CORRECTION_LEVEL=default
export FRESHWEB_ENABLE_DRIFT_CORRECTION=0
export FRESHWEB_DRIFT_CORRECTION_USE_CAMERA_REFERENCE=0

exec sh "$(pwd)/MIX-again-freshweb.prompt-fast-wan-trippy-4-3.sh" "$@"
