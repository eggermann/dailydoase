#!/bin/zsh
set -euo pipefail

cd "$(dirname "$0")/../../.."

# Cheap exhibition proof: two iterations, three scenes, no sound.
export GENERATIONS_PATH=${GENERATIONS_PATH:-"$PWD/GENRATIONS-KAUFHAUF"}
export FRESHWEB_FOLDER=${FRESHWEB_FOLDER:-glas-kaufhaus-word-low-test}
export FRESHWEB_WORDS=${FRESHWEB_WORDS:-human,en | Einkaufszentrum,de}
export FRESHWEB_MAX_ITERATIONS=${FRESHWEB_MAX_ITERATIONS:-2}
export FRESHWEB_POLLING_TIME_MS=${FRESHWEB_POLLING_TIME_MS:-1000}

# Capture the current Mac camera by default. A fixed test frame can still be
# supplied explicitly through FRESHWEB_CAMERA_IMAGE_PATH.
export FRESHWEB_MODE=${FRESHWEB_MODE:-reference-image-actor}
export FRESHWEB_CAMERA_IMAGE_PATH=${FRESHWEB_CAMERA_IMAGE_PATH-}
export FRESHWEB_OPENING_IMAGE_PATH=${FRESHWEB_OPENING_IMAGE_PATH-}
export FRESHWEB_REQUIRE_PERSON_IN_CAMERA=${FRESHWEB_REQUIRE_PERSON_IN_CAMERA:-1}
export FRESHWEB_VALIDATE_CAMERA_SHOT=${FRESHWEB_VALIDATE_CAMERA_SHOT:-1}

# Exhibition gate: compare small local camera frames first. Vision only runs on
# the initial background, two confirmed changes, or a 30-second heartbeat.
# On the Mac mini set LMSTUDIO_URL=http://127.0.0.1:8080 and LMSTUDIO_MODEL to
# the installed Qwen3-VL model; no cloud vision provider is needed.
export FRESHWEB_CAMERA_CHANGE_GATE_ENABLED=${FRESHWEB_CAMERA_CHANGE_GATE_ENABLED:-1}
export FRESHWEB_CAMERA_CHANGE_GATE_REQUIRED_FRAMES=${FRESHWEB_CAMERA_CHANGE_GATE_REQUIRED_FRAMES:-2}
export FRESHWEB_CAMERA_CHANGE_GATE_HEARTBEAT_MS=${FRESHWEB_CAMERA_CHANGE_GATE_HEARTBEAT_MS:-30000}

# Proven scene planner from all three good trailer branches. Keep camera vision
# local/independent; GPT-5 mini plans only the complete causal scene sequence.
export FRESHWEB_SCENE_PLAN_MODEL=gpt-5-mini-2025-08-07

# An explicit count/length list overrides Taktmuster. Leave either value empty
# to let Taktmuster determine that dimension for each iteration.
export FRESHWEB_SCENE_COUNT=${FRESHWEB_SCENE_COUNT-}
export FRESHWEB_SCENE_LENGTHS=${FRESHWEB_SCENE_LENGTHS-}
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

# Exhibition default: Runware Wan 2.6 Flash renders every shot from its start
# frame. It is the cheap, reliable path for visible action. GPT still plans the
# story, but no scene may trigger a paid FAL First/Last render.
export VIDEO_MODE_PRESET=singleImageOnly
export FRESHWEB_IMAGE_TO_VIDEO_ONLY=1
export FRESHWEB_FIRST_CLIP_VIDEO_MODE=singleImage
export FRESHWEB_LATER_CLIPS_SINGLE_IMAGE=1
export FRESHWEB_DYNAMIC_SINGLE_IMAGE_LATER_CLIPS=0
export FRESHWEB_SCENE_PLAN_CONTROLS_VIDEO_MODE=0
export FRESHWEB_CREATIVE_CUTS_ENABLED=${FRESHWEB_CREATIVE_CUTS_ENABLED:-0}
# First/Last is disabled for this preset, so do not inherit a FAL endpoint
# from an interactive shell when the script is started manually.
unset FRESHWEB_FIRST_LAST_VIDEO_MODEL_TYPE
unset FRESHWEB_FIRST_LAST_VIDEO_MODEL
export FRESHWEB_SINGLE_VIDEO_MODEL_TYPE=runwareImageToVideo
export FRESHWEB_SINGLE_VIDEO_MODEL=alibaba:wan@2.6-flash
export FRESHWEB_SINGLE_VIDEO_WIDTH=1088
export FRESHWEB_SINGLE_VIDEO_HEIGHT=832
export FRESHWEB_SINGLE_FPS=12
export FRESHWEB_SINGLE_VIDEO_PROMPT_FLAVOR=default
export FRESHWEB_SCENE_VISUAL_DIRECTION=${FRESHWEB_SCENE_VISUAL_DIRECTION:-Real 1989 German Einkaufszentrum surveillance footage inside the exact visible exhibition room. Each ordinary continuation preserves the exact source camera position, lens, height, perspective, and room coverage. A different motivated fixed security camera is allowed only when the scene explicitly has creativeCut=true. Never use operator movement. Preserve real people, room geometry, existing objects, practical coverage, slight VHS noise and interlace; no visible words or invented typography; strong causal progression.}
export FRESHWEB_CAMERA_STYLE=${FRESHWEB_CAMERA_STYLE:-Real 1989 German Einkaufszentrum CCTV footage: preserve the exact fixed security-camera position, lens, height, perspective, and framing of the source frame for this clip. A different fixed camera is allowed only for explicit creativeCut=true. Slight VHS noise and interlace; no handheld, dolly, crane, cinematic close-up, shallow depth of field, studio lighting, or timestamp overlay. Physical spatial integrity: bodies, hands, easels, tables, counters, and props keep clear separate volumes; limbs never pass through furniture or objects, and touching happens only at a named contact point.}
export FRESHWEB_REALITY_INTRUSION_MODE=${FRESHWEB_REALITY_INTRUSION_MODE:-semantic}

# Proven real-camera path: WAN starts from the untouched camera shot. Turn this
# on only when an intentional Runware image-to-image opening is wanted.
export FRESHWEB_OPENING_START_ENABLED=${FRESHWEB_OPENING_START_ENABLED:-0}
export FRESHWEB_OPENING_START_MODE=fluxContext
export FRESHWEB_OPENING_START_INTERVAL=1
export FRESHWEB_OPENING_START_PROVIDER=runware
export FRESHWEB_OPENING_START_MODEL=bfl:3@1
export FRESHWEB_OPENING_START_WIDTH=${FRESHWEB_OPENING_START_WIDTH:-1184}
export FRESHWEB_OPENING_START_HEIGHT=${FRESHWEB_OPENING_START_HEIGHT:-880}

# All scene and first/last destination stills use the same Runware image path.
# Do not fall back to legacy Qwen/FAL for a later scene endpoint.
export FRESHWEB_WEBCAM_PERSONA_REFERENCE_MODEL=${FRESHWEB_WEBCAM_PERSONA_REFERENCE_MODEL:-bfl:3@1}
export FRESHWEB_WEBCAM_PERSONA_REFERENCE_PROVIDER=${FRESHWEB_WEBCAM_PERSONA_REFERENCE_PROVIDER:-runware}

# A selected person from CAST MEMORY is mixed with current room frame before
# WAN animates it. bfl:6@1 accepts up to ten total reference images.
export FRESHWEB_CAST_CONTEXT_ENABLED=${FRESHWEB_CAST_CONTEXT_ENABLED:-1}
export FRESHWEB_CAST_CONTEXT_MODEL=${FRESHWEB_CAST_CONTEXT_MODEL:-bfl:6@1}
export FRESHWEB_CAST_CONTEXT_PROVIDER=${FRESHWEB_CAST_CONTEXT_PROVIDER:-runware}
export FRESHWEB_CAST_CONTEXT_TIMEOUT_MS=${FRESHWEB_CAST_CONTEXT_TIMEOUT_MS:-120000}
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
export FRESHWEB_RETRY_ON_FAILURE=${FRESHWEB_RETRY_ON_FAILURE:-0}
export FRESHWEB_VIDEO_MAX_RETRIES_ON_FAILURE=${FRESHWEB_VIDEO_MAX_RETRIES_ON_FAILURE:-0}

exec node lib/generator/adapter/MIX-again-freshweb.js
