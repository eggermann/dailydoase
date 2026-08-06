#!/bin/zsh
set -euo pipefail

cd "$(dirname "$0")"

# Cheap trailer comparison: three WAN clips at WAN's two-second minimum.
# This is the smallest useful multi-scene trailer. WAN 2.6 Flash only offers
# 720p or 1080p; local downscaling makes review files small but does not change
# provider cost. Cost stays low through short duration, no audio, no end card,
# no drift repair and no fallback providers.
export FRESHWEB_FOLDER=${FRESHWEB_FOLDER:-glas-kaufhaus-two-video-preview}
export FRESHWEB_POLLING_TIME_MS=${FRESHWEB_POLLING_TIME_MS:-0}
export VIDEO_MODE_PRESET=${VIDEO_MODE_PRESET:-singleImageOnly}
export FRESHWEB_SCENE_COUNT=${FRESHWEB_SCENE_COUNT:-3}
export FRESHWEB_USE_TAKTMUSTER_LENGTHS=${FRESHWEB_USE_TAKTMUSTER_LENGTHS:-1}
# Quantized low-cost Taktmuster: three unequal beats, all inside WAN's 2–15s range.
export FRESHWEB_SCENE_LENGTHS=${FRESHWEB_SCENE_LENGTHS:-2,3,2}
export FRESHWEB_MIN_SCENE_DURATION_SECONDS=${FRESHWEB_MIN_SCENE_DURATION_SECONDS:-2}
export FRESHWEB_SINGLE_VIDEO_MAX_DURATION=${FRESHWEB_SINGLE_VIDEO_MAX_DURATION:-2}

# Test scene 2 from scene 1's extracted WAN end frame. Analyse stays on so this
# preview also verifies the new end-frame continuity handoff. No paid repair.
export FRESHWEB_START_FRAME_STRATEGY_MODE=${FRESHWEB_START_FRAME_STRATEGY_MODE:-planner}
export FRESHWEB_START_FRAME_FIRST_STRATEGY=${FRESHWEB_START_FRAME_FIRST_STRATEGY:-locationReanchor}
export FRESHWEB_START_FRAME_LAST_STRATEGY=${FRESHWEB_START_FRAME_LAST_STRATEGY:-rawLastFrame}
export FRESHWEB_ENABLE_DRIFT_CORRECTION=${FRESHWEB_ENABLE_DRIFT_CORRECTION:-0}
export FRESHWEB_END_FRAME_ANALYSIS=${FRESHWEB_END_FRAME_ANALYSIS:-1}
export FRESHWEB_OPENING_START_ENABLED=${FRESHWEB_OPENING_START_ENABLED:-0}

# No title card or fallback providers in this test.
export FRESHWEB_END_CARD_ENABLED=${FRESHWEB_END_CARD_ENABLED:-0}
export FRESHWEB_MIRELO_AUDIO_ENABLED=${FRESHWEB_MIRELO_AUDIO_ENABLED:-0}
if [ "${FRESHWEB_MIRELO_AUDIO_ENABLED}" = "0" ]; then
  export FRESHWEB_MIRELO_MODE=off
  export FRESHWEB_MIRELO_RUNWARE_FALLBACK_ENABLED=0
else
  export FRESHWEB_MIRELO_MODE=${FRESHWEB_MIRELO_MODE:-finalOnly}
  export FRESHWEB_MIRELO_RUNWARE_FALLBACK_ENABLED=${FRESHWEB_MIRELO_RUNWARE_FALLBACK_ENABLED:-1}
fi
export FRESHWEB_WAN_AUDIO_ENABLED=${FRESHWEB_WAN_AUDIO_ENABLED:-0}
export FRESHWEB_ENABLE_RUNWARE_FALLBACKS=${FRESHWEB_ENABLE_RUNWARE_FALLBACKS:-0}
export FRESHWEB_ENABLE_PAID_FAL_FALLBACKS=${FRESHWEB_ENABLE_PAID_FAL_FALLBACKS:-0}
export FRESHWEB_ALLOW_PEOPLE=${FRESHWEB_ALLOW_PEOPLE:-0}

# FLUX Kontext has fixed supported canvases. Keep its smallest compatible 4:3
# canvas; preview compression happens only after both WAN clips are joined.
export FRESHWEB_IMAGE_WIDTH=${FRESHWEB_IMAGE_WIDTH:-1184}
export FRESHWEB_IMAGE_HEIGHT=${FRESHWEB_IMAGE_HEIGHT:-880}
export FRESHWEB_OPENING_START_WIDTH=${FRESHWEB_OPENING_START_WIDTH:-1184}
export FRESHWEB_OPENING_START_HEIGHT=${FRESHWEB_OPENING_START_HEIGHT:-880}

# A small file for visual checking. This changes local output size only, never
# the required 720p WAN generation resolution.
export FRESHWEB_PREVIEW_WIDTH=${FRESHWEB_PREVIEW_WIDTH:-272}
export FRESHWEB_PREVIEW_HEIGHT=${FRESHWEB_PREVIEW_HEIGHT:-208}
export FRESHWEB_PREVIEW_CRF=${FRESHWEB_PREVIEW_CRF:-35}

export FRESHWEB_SNAPSHOT_SCENE_COUNT=${FRESHWEB_SNAPSHOT_SCENE_COUNT:-$FRESHWEB_SCENE_COUNT}
export FRESHWEB_SNAPSHOT_SCENE_LENGTHS=${FRESHWEB_SNAPSHOT_SCENE_LENGTHS:-$FRESHWEB_SCENE_LENGTHS}
if [ "${FRESHWEB_MIRELO_AUDIO_ENABLED}" = "1" ]; then
  echo "Budget trailer preview starts: ${FRESHWEB_SCENE_COUNT} scenes, Taktmuster ${FRESHWEB_SCENE_LENGTHS}s, Mirelo on, no end card."
else
  echo "Budget trailer preview starts: ${FRESHWEB_SCENE_COUNT} scenes, Taktmuster ${FRESHWEB_SCENE_LENGTHS}s, silent WAN, no end card."
fi
output_folder="$(pwd)/../../../GENRATIONS-KAUFHAUF/${FRESHWEB_FOLDER}"
sh "$(pwd)/shorty-book/resume-two-video-preview-from-snapshot.sh" "$output_folder" "$@"

if [ "${FRESHWEB_TWO_VIDEO_PREVIEW_PLAN_ONLY:-0}" = "1" ]; then
  echo "Two-video semantic plan check complete."
  exit 0
fi

latest_concat=$(find "$output_folder/merged" -type f \( -name "*-concat.mp4" -o -name "*-collision-cut.mp4" \) -print | sort | tail -n 1)
if [ -z "$latest_concat" ]; then
  echo "No budget-trailer concat found below: $output_folder" >&2
  exit 1
fi

preview_path="$(dirname "$latest_concat")/two-scene-preview-${FRESHWEB_PREVIEW_WIDTH}x${FRESHWEB_PREVIEW_HEIGHT}.mp4"
ffmpeg -hide_banner -loglevel error -y \
  -i "$latest_concat" \
  -vf "scale=${FRESHWEB_PREVIEW_WIDTH}:${FRESHWEB_PREVIEW_HEIGHT}:flags=fast_bilinear" \
  -c:v libx264 -preset ultrafast -crf "$FRESHWEB_PREVIEW_CRF" -pix_fmt yuv420p -an \
  "$preview_path"

echo "WAN concat: $latest_concat"
echo "Small preview: $preview_path"
