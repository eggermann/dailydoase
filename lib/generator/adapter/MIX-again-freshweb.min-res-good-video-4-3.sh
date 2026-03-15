#!/bin/zsh
set -euo pipefail

cd "$(dirname "$0")"

# Smallest practical 4:3 preset while keeping stronger video render settings.
# Override any value at runtime, for example:
# FRESHWEB_SINGLE_FPS=20 sh lib/generator/adapter/MIX-again-freshweb.min-res-good-video-4-3.sh

export FRESHWEB_FOLDER="${FRESHWEB_FOLDER:-freshweb-min-res-good-video-4-3-test}"
export FRESHWEB_POLLING_TIME_MS="${FRESHWEB_POLLING_TIME_MS:-1000}"
export FRESHWEB_SCENE_LENGTH_MULTIPLIER="${FRESHWEB_SCENE_LENGTH_MULTIPLIER:-1.6}"
# Avoid quality drift across polling iterations in the same run folder.
export FRESHWEB_CHAIN_FROM_PREVIOUS_LOOP_LAST_FRAME="${FRESHWEB_CHAIN_FROM_PREVIOUS_LOOP_LAST_FRAME:-0}"
export FRESHWEB_RESTART_FROM_PREVIOUS_MOVIE_LAST_FRAME="${FRESHWEB_RESTART_FROM_PREVIOUS_MOVIE_LAST_FRAME:-0}"

# Small but safer 4:3 sizes for WAN quality and facial/body readability.
export FRESHWEB_IMAGE_WIDTH="${FRESHWEB_IMAGE_WIDTH:-320}"
export FRESHWEB_IMAGE_HEIGHT="${FRESHWEB_IMAGE_HEIGHT:-240}"
export FRESHWEB_VIDEO_WIDTH="${FRESHWEB_VIDEO_WIDTH:-320}"
export FRESHWEB_VIDEO_HEIGHT="${FRESHWEB_VIDEO_HEIGHT:-240}"
export FRESHWEB_SINGLE_VIDEO_WIDTH="${FRESHWEB_SINGLE_VIDEO_WIDTH:-320}"
export FRESHWEB_SINGLE_VIDEO_HEIGHT="${FRESHWEB_SINGLE_VIDEO_HEIGHT:-240}"
export FRESHWEB_VIDEO_CUSTOM_MAX_AREA="${FRESHWEB_VIDEO_CUSTOM_MAX_AREA:-76800}"

# Keep the stronger video render defaults from the higher-quality preset.
export FRESHWEB_IMAGE_STEPS="${FRESHWEB_IMAGE_STEPS:-16}"
export FRESHWEB_IMAGE_GUIDANCE="${FRESHWEB_IMAGE_GUIDANCE:-3}"
export FRESHWEB_VIDEO_STEPS="${FRESHWEB_VIDEO_STEPS:-24}"
export FRESHWEB_VIDEO_GUIDANCE="${FRESHWEB_VIDEO_GUIDANCE:-5}"
export FRESHWEB_VIDEO_FPS="${FRESHWEB_VIDEO_FPS:-12}"
export FRESHWEB_VIDEO_NUM_FRAMES="${FRESHWEB_VIDEO_NUM_FRAMES:-49}"
export FRESHWEB_SINGLE_FPS="${FRESHWEB_SINGLE_FPS:-16}"
export FRESHWEB_VIDEO_SAMPLING_STEPS="${FRESHWEB_VIDEO_SAMPLING_STEPS:-24}"
export FRESHWEB_VIDEO_GUIDE_SCALE="${FRESHWEB_VIDEO_GUIDE_SCALE:-5}"
export FRESHWEB_VIDEO_SHIFT="${FRESHWEB_VIDEO_SHIFT:-4}"

# Correlate single-image clip length to the global scene-length multiplier.
# Default mapping:
#   maxDuration = clamp(sceneLengthMultiplier * 2.0, 1.6, 3.0)
# Set FRESHWEB_SINGLE_VIDEO_MAX_DURATION explicitly to bypass this derived cap.
if [[ -z "${FRESHWEB_SINGLE_VIDEO_MAX_DURATION:-}" ]]; then
  export FRESHWEB_SINGLE_VIDEO_MAX_DURATION="$(
    awk \
      -v multiplier="${FRESHWEB_SCENE_LENGTH_MULTIPLIER}" \
      -v factor="${FRESHWEB_SINGLE_VIDEO_MAX_DURATION_FACTOR:-2.0}" \
      -v min_duration="${FRESHWEB_SINGLE_VIDEO_MAX_DURATION_MIN:-1.6}" \
      -v max_duration="${FRESHWEB_SINGLE_VIDEO_MAX_DURATION_MAX:-3.0}" \
      'BEGIN {
        value = multiplier * factor;
        if (value < min_duration) value = min_duration;
        if (value > max_duration) value = max_duration;
        printf "%.2f", value;
      }'
  )"
fi

exec sh "$(pwd)/MIX-again-freshweb.middle-cost-4-3.sh" "$@"
