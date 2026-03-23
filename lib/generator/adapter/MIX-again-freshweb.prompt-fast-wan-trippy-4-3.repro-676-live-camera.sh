#!/bin/zsh
set -euo pipefail

cd "$(dirname "$0")"

# Keep the normal WAN trippy 4:3 preset, but match the closer-to-676 runtime path:
# - always start from a fresh live webcam shot
# - do not pin static test cues or scene lengths
# - prefer the HF provider path for single-image WAN clips
# - disable drift correction so motion is not clamped

export FRESHWEB_FOLDER=${FRESHWEB_FOLDER:-freshweb-prompt-fast-wan-trippy-4-3-live-camera}

# Force a fresh webcam opening shot even if the caller exported a fixed image before.
unset FRESHWEB_CAMERA_IMAGE_PATH
unset FRESHWEB_OPENING_IMAGE_PATH

# Clear replay/test-specific overrides so this stays generic.
unset FRESHWEB_STATIC_TEST
unset FRESHWEB_SCENE_COUNT
unset FRESHWEB_SCENE_LENGTHS
unset FRESHWEB_STATIC_SOURCE_CUES

export FRESHWEB_SELF_HOSTED_SINGLE=0
export FRESHWEB_WAN_SINGLE_USE_HF_PROVIDER_FALLBACK=1
export FRESHWEB_WAN_SINGLE_FORCE_HF_PROVIDER=1

export FRESHWEB_DRIFT_CORRECTION_LEVEL=default
export FRESHWEB_ENABLE_DRIFT_CORRECTION=0
export FRESHWEB_DRIFT_CORRECTION_USE_CAMERA_REFERENCE=0

exec sh "$(pwd)/MIX-again-freshweb.prompt-fast-wan-trippy-4-3.sh" "$@"
