#!/bin/zsh
set -euo pipefail

cd "$(dirname "$0")"

REPO_ROOT="$(cd "$(pwd)/../../.." && pwd)"

# CANK GOOD-2 trailer launcher.
# One vertical GOOD-2 trailer iteration per cycle, then wait 24 hours.
# These production dimensions mirror the proven mobile preview format so the
# local test and the public CANK page receive the same mobile movie shape.
export FRESHWEB_FOLDER=${FRESHWEB_FOLDER:-glas-kaufhaus-cank-trailer-good-2-live}
export GENERATIONS_PATH=${GENERATIONS_PATH:-$REPO_ROOT/GENERATIONS-CANK-TRAILER-GOOD-2}
export FRESHWEB_POLLING_TIME_MS=${FRESHWEB_POLLING_TIME_MS:-86400000}
export FRESHWEB_MAX_ITERATIONS=${FRESHWEB_MAX_ITERATIONS:--1}
export FRESHWEB_WORDS="${FRESHWEB_WORDS:-Horror,en | Art exhibition,en | Playground,en | Department store,en}"
export FRESHWEB_VIDEO_ASPECT_RATIO=${FRESHWEB_VIDEO_ASPECT_RATIO:-9:16}
export FRESHWEB_IMAGE_WIDTH=${FRESHWEB_IMAGE_WIDTH:-576}
export FRESHWEB_IMAGE_HEIGHT=${FRESHWEB_IMAGE_HEIGHT:-1024}
export FRESHWEB_OPENING_START_WIDTH=${FRESHWEB_OPENING_START_WIDTH:-576}
export FRESHWEB_OPENING_START_HEIGHT=${FRESHWEB_OPENING_START_HEIGHT:-1024}
export FRESHWEB_SINGLE_VIDEO_WIDTH=${FRESHWEB_SINGLE_VIDEO_WIDTH:-576}
export FRESHWEB_SINGLE_VIDEO_HEIGHT=${FRESHWEB_SINGLE_VIDEO_HEIGHT:-1024}
export FRESHWEB_VIDEO_WIDTH=${FRESHWEB_VIDEO_WIDTH:-576}
export FRESHWEB_VIDEO_HEIGHT=${FRESHWEB_VIDEO_HEIGHT:-1024}
# Runware can briefly lose its generated frame URL while a video job starts.
# Retry that same clip first. If all retries fail, retain the live Semantic
# Stream, mark the trailer failed, make two fresh semantic iterations, then
# resume the normal twenty-four-hour cadence.
export FRESHWEB_RETRY_ON_FAILURE=${FRESHWEB_RETRY_ON_FAILURE:-true}
export FRESHWEB_ADVANCE_ON_FAILURE=${FRESHWEB_ADVANCE_ON_FAILURE:-true}
export FRESHWEB_FAILURE_RECOVERY_ITERATIONS=${FRESHWEB_FAILURE_RECOVERY_ITERATIONS:-2}
export FRESHWEB_FAILURE_RECOVERY_DELAY_MS=${FRESHWEB_FAILURE_RECOVERY_DELAY_MS:-1000}
export FRESHWEB_SEMANTIC_STEP_TIMEOUT_MS=${FRESHWEB_SEMANTIC_STEP_TIMEOUT_MS:-90000}
export FRESHWEB_VIDEO_MAX_RETRIES_ON_FAILURE=${FRESHWEB_VIDEO_MAX_RETRIES_ON_FAILURE:-3}
export FRESHWEB_VIDEO_RETRY_DELAY_MS=${FRESHWEB_VIDEO_RETRY_DELAY_MS:-15000}
# A long-lived service must keep its logs useful. The underlying preset enables
# full request debugging by default, including large encoded frames.
export GENERATOR_DEBUG=${GENERATOR_DEBUG:-0}
export SCENE_GENERATOR_DEBUG=${SCENE_GENERATOR_DEBUG:-0}
export VISION_DEBUG=${VISION_DEBUG:-0}
export WAN_DEBUG=${WAN_DEBUG:-0}
export FAL_DEBUG=${FAL_DEBUG:-0}
export RUNWARE_DEBUG=${RUNWARE_DEBUG:-0}
export FLUX_DEBUG=${FLUX_DEBUG:-0}
export MIRELO_DEBUG=${MIRELO_DEBUG:-0}
# Keep mobile drift repair on the same FLUX Kontext model as the opening and
# scene stills. The former Runware image model rejects this 9:16 canvas.
export FRESHWEB_DRIFT_CORRECTION_MODEL=${FRESHWEB_DRIFT_CORRECTION_MODEL:-bfl:3@1}

exec sh "$(pwd)/MIX-again-freshweb.glas-kaufhaus-trailer.sh" "$@"
