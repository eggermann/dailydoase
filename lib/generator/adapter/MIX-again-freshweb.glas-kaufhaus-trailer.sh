#!/bin/zsh
set -euo pipefail

cd "$(dirname "$0")/../../.."

# Cheap exhibition proof: two iterations, three scenes, no sound.
export GENERATIONS_PATH=${GENERATIONS_PATH:-"$PWD/GENRATIONS-KAUFHAUF"}
export FRESHWEB_FOLDER=${FRESHWEB_FOLDER:-glas-kaufhaus-word-low-test}
export FRESHWEB_WORDS=${FRESHWEB_WORDS:-wort,de | war,en | Einkaufszentrum,de}
export FRESHWEB_MAX_ITERATIONS=${FRESHWEB_MAX_ITERATIONS:-2}
export FRESHWEB_POLLING_TIME_MS=${FRESHWEB_POLLING_TIME_MS:-1000}

# Capture the current Mac camera by default. A fixed test frame can still be
# supplied explicitly through FRESHWEB_CAMERA_IMAGE_PATH.
export FRESHWEB_MODE=${FRESHWEB_MODE:-reference-image-actor}
export FRESHWEB_CAMERA_IMAGE_PATH=${FRESHWEB_CAMERA_IMAGE_PATH-}
export FRESHWEB_OPENING_IMAGE_PATH=${FRESHWEB_OPENING_IMAGE_PATH-}
export FRESHWEB_REQUIRE_PERSON_IN_CAMERA=${FRESHWEB_REQUIRE_PERSON_IN_CAMERA:-1}
export FRESHWEB_VALIDATE_CAMERA_SHOT=${FRESHWEB_VALIDATE_CAMERA_SHOT:-1}

# Proven scene planner from all three good trailer branches. Keep camera vision
# local/independent; GPT-5 mini plans only the complete causal scene sequence.
export FRESHWEB_SCENE_PLAN_MODEL=gpt-5-mini-2025-08-07

# One exact 3-2-2 sequence. Callers may still override the lengths explicitly.
export FRESHWEB_SCENE_COUNT=${FRESHWEB_SCENE_COUNT:-3}
export FRESHWEB_SCENE_LENGTHS=${FRESHWEB_SCENE_LENGTHS:-3,2,2}
if [[ -n "$FRESHWEB_SCENE_LENGTHS" ]]; then
  export FRESHWEB_USE_TAKTMUSTER_LENGTHS=0
else
  export FRESHWEB_USE_TAKTMUSTER_LENGTHS=1
fi
export FRESHWEB_SCENE_LENGTH_TAKT=${FRESHWEB_SCENE_LENGTH_TAKT:-3}
export FRESHWEB_SCENE_LENGTH_TAKT_TYPE=${FRESHWEB_SCENE_LENGTH_TAKT_TYPE:-balanced}
export FRESHWEB_SCENE_LENGTH_MULTIPLIER=${FRESHWEB_SCENE_LENGTH_MULTIPLIER:-1}
export FRESHWEB_MIN_SCENE_DURATION_SECONDS=${FRESHWEB_MIN_SCENE_DURATION_SECONDS:-2}
export FRESHWEB_SINGLE_VIDEO_MAX_DURATION=${FRESHWEB_SINGLE_VIDEO_MAX_DURATION:-4}
export FRESHWEB_CAMERA_SINGLE_IMAGE_STABILITY_MAX_DURATION=${FRESHWEB_CAMERA_SINGLE_IMAGE_STABILITY_MAX_DURATION:-4}

# Scene 1 uses the stable single-image opening. Later scenes keep the planner's
# choice: singleImage for continuous action, firstLast for a reachable new pose
# or actor interaction in the same room.
export VIDEO_MODE_PRESET=storyDrivenMixed
export FRESHWEB_IMAGE_TO_VIDEO_ONLY=0
export FRESHWEB_FIRST_CLIP_VIDEO_MODE=singleImage
export FRESHWEB_LATER_CLIPS_SINGLE_IMAGE=0
export FRESHWEB_DYNAMIC_SINGLE_IMAGE_LATER_CLIPS=1
export FRESHWEB_SCENE_PLAN_CONTROLS_VIDEO_MODE=1
export FRESHWEB_SINGLE_VIDEO_MODEL_TYPE=runwareImageToVideo
export FRESHWEB_SINGLE_VIDEO_MODEL=alibaba:wan@2.6-flash
export FRESHWEB_SINGLE_VIDEO_WIDTH=1088
export FRESHWEB_SINGLE_VIDEO_HEIGHT=832
export FRESHWEB_SINGLE_FPS=12
export FRESHWEB_SINGLE_VIDEO_PROMPT_FLAVOR=default
export FRESHWEB_SCENE_VISUAL_DIRECTION=${FRESHWEB_SCENE_VISUAL_DIRECTION:-Kaufhaus story inside the exact visible exhibition room, preserve the real person and room geometry, turn semantic cues into physical actor actions or interactions, preserve existing objects, no visible words or invented typography, strong causal progression}

# Build the narrated opening scene from the real camera shot through Runware
# image-to-image. This is the proven trailer path; no FAL image edit is used.
export FRESHWEB_OPENING_START_ENABLED=1
export FRESHWEB_OPENING_START_MODE=fluxContext
export FRESHWEB_OPENING_START_INTERVAL=1
export FRESHWEB_OPENING_START_PROVIDER=runware
export FRESHWEB_OPENING_START_MODEL=bfl:3@1
export FRESHWEB_OPENING_START_WIDTH=${FRESHWEB_OPENING_START_WIDTH:-1184}
export FRESHWEB_OPENING_START_HEIGHT=${FRESHWEB_OPENING_START_HEIGHT:-880}

# A selected person from CAST MEMORY is mixed with current room frame before
# WAN animates it. bfl:6@1 accepts up to ten total reference images.
export FRESHWEB_CAST_CONTEXT_ENABLED=${FRESHWEB_CAST_CONTEXT_ENABLED:-1}
export FRESHWEB_CAST_CONTEXT_MODEL=${FRESHWEB_CAST_CONTEXT_MODEL:-bfl:6@1}
export FRESHWEB_CAST_CONTEXT_PROVIDER=${FRESHWEB_CAST_CONTEXT_PROVIDER:-runware}
export FRESHWEB_CAST_CONTEXT_WIDTH=${FRESHWEB_CAST_CONTEXT_WIDTH:-1184}
export FRESHWEB_CAST_CONTEXT_HEIGHT=${FRESHWEB_CAST_CONTEXT_HEIGHT:-880}

# Re-anchor every next single-image shot against the camera-person reference
# captured synchronously after the previous shot. Keep correction moderate so
# the generated story survives while person and room drift are pulled back.
export FRESHWEB_ENABLE_DRIFT_CORRECTION=1
export FRESHWEB_DRIFT_CORRECTION_LEVEL=moderate
export FRESHWEB_DRIFT_CORRECTION_MODEL=runware:106@1
export FRESHWEB_DRIFT_CORRECTION_PROVIDER=runware
export FRESHWEB_DRIFT_CORRECTION_USE_CAMERA_REFERENCE=1
export FRESHWEB_DRIFT_CONTEXT_BUFFER_ENABLED=${FRESHWEB_DRIFT_CONTEXT_BUFFER_ENABLED:-1}
export FRESHWEB_DRIFT_CONTEXT_BUFFER_SIZE=${FRESHWEB_DRIFT_CONTEXT_BUFFER_SIZE:-10}
export FRESHWEB_DRIFT_CONTEXT_BUFFER_CAPTURE_BEFORE_EACH_CALL=${FRESHWEB_DRIFT_CONTEXT_BUFFER_CAPTURE_BEFORE_EACH_CALL:-0}
export FRESHWEB_TRIPPY_REANCHOR_INTERVAL=0

# Stable low-test assembly: no audio and no repeated boundary hold. Later clips
# lose their first 0.125 seconds and are re-timed.
export FRESHWEB_MIRELO_MODE=off
export FRESHWEB_CONCAT_TRIM_LEADING_SECONDS=${FRESHWEB_CONCAT_TRIM_LEADING_SECONDS:-0.125}
export FRESHWEB_RETRY_ON_FAILURE=0
export FRESHWEB_VIDEO_MAX_RETRIES_ON_FAILURE=0

exec node lib/generator/adapter/MIX-again-freshweb.js
