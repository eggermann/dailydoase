#!/bin/zsh
set -euo pipefail

cd "$(dirname "$0")/../../.."

# Cheap exhibition proof: two Taktmuster iterations, no sound.
export GENERATIONS_PATH=${GENERATIONS_PATH:-"$PWD/GENRATIONS-KAUFHAUF"}
export FRESHWEB_FOLDER=${FRESHWEB_FOLDER:-glas-kaufhaus-word-low-test}
export FRESHWEB_WORDS=${FRESHWEB_WORDS:-art-vernissage,en | Einkaufszentrum,de | Psycho_(1960),de}
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

# Taktmuster chooses scene count and lengths for every iteration. Keep explicit
# values empty: FRESHWEB_SCENE_COUNT and FRESHWEB_SCENE_LENGTHS disable this.
export FRESHWEB_SCENE_COUNT=${FRESHWEB_SCENE_COUNT-}
export FRESHWEB_SCENE_LENGTHS=${FRESHWEB_SCENE_LENGTHS-}
export FRESHWEB_USE_TAKTMUSTER_LENGTHS=${FRESHWEB_USE_TAKTMUSTER_LENGTHS:-1}
export FRESHWEB_SCENE_COUNT_TAKT_COUNT=${FRESHWEB_SCENE_COUNT_TAKT_COUNT:-2}
export FRESHWEB_SCENE_COUNT_TAKT_ZAEHLER=${FRESHWEB_SCENE_COUNT_TAKT_ZAEHLER:-4}
export FRESHWEB_SCENE_COUNT_TAKT_NENNER=${FRESHWEB_SCENE_COUNT_TAKT_NENNER:-4}
export FRESHWEB_SCENE_COUNT_TAKT_TYPE=${FRESHWEB_SCENE_COUNT_TAKT_TYPE:-balanced}
export FRESHWEB_MIN_SCENE_COUNT=${FRESHWEB_MIN_SCENE_COUNT:-2}
# Second rhythm: scene lengths use 2 x 3/4. Consume one beat at startup so
# the length rhythm begins off the scene-count downbeat.
export FRESHWEB_SCENE_LENGTH_TAKT_COUNT=${FRESHWEB_SCENE_LENGTH_TAKT_COUNT:-2}
export FRESHWEB_SCENE_LENGTH_TAKT_ZAEHLER=${FRESHWEB_SCENE_LENGTH_TAKT_ZAEHLER:-3}
export FRESHWEB_SCENE_LENGTH_TAKT_NENNER=${FRESHWEB_SCENE_LENGTH_TAKT_NENNER:-4}
export FRESHWEB_SCENE_LENGTH_TAKT_SHIFT=${FRESHWEB_SCENE_LENGTH_TAKT_SHIFT:-1}
export FRESHWEB_SCENE_LENGTH_TAKT_TYPE=${FRESHWEB_SCENE_LENGTH_TAKT_TYPE:-balanced}
# Sum with an independent 2 x 4/4 length rhythm, then cap every shot at 4s.
export FRESHWEB_SCENE_LENGTH_PRIMARY_TAKT_COUNT=${FRESHWEB_SCENE_LENGTH_PRIMARY_TAKT_COUNT:-2}
export FRESHWEB_SCENE_LENGTH_PRIMARY_TAKT_ZAEHLER=${FRESHWEB_SCENE_LENGTH_PRIMARY_TAKT_ZAEHLER:-4}
export FRESHWEB_SCENE_LENGTH_PRIMARY_TAKT_NENNER=${FRESHWEB_SCENE_LENGTH_PRIMARY_TAKT_NENNER:-4}
export FRESHWEB_SCENE_LENGTH_SUM_MAX_SECONDS=${FRESHWEB_SCENE_LENGTH_SUM_MAX_SECONDS:-4}
export FRESHWEB_SCENE_LENGTH_MULTIPLIER=${FRESHWEB_SCENE_LENGTH_MULTIPLIER:-1}
export FRESHWEB_MIN_SCENE_DURATION_SECONDS=${FRESHWEB_MIN_SCENE_DURATION_SECONDS:-2}
export FRESHWEB_SINGLE_VIDEO_MAX_DURATION=${FRESHWEB_SINGLE_VIDEO_MAX_DURATION:-4}
export FRESHWEB_CAMERA_SINGLE_IMAGE_STABILITY_MAX_DURATION=${FRESHWEB_CAMERA_SINGLE_IMAGE_STABILITY_MAX_DURATION:-4}

# GPT chooses singleImage or First/Last for every later scene. The opening is a
# single-image start from the current camera frame; a First/Last transition is
# used only where the scene plan asks for one.
export VIDEO_MODE_PRESET=storyDrivenMixed
export FRESHWEB_IMAGE_TO_VIDEO_ONLY=0
export FRESHWEB_FIRST_CLIP_VIDEO_MODE=${FRESHWEB_FIRST_CLIP_VIDEO_MODE:-singleImage}
export FRESHWEB_LATER_CLIPS_SINGLE_IMAGE=0
export FRESHWEB_DYNAMIC_SINGLE_IMAGE_LATER_CLIPS=0
export FRESHWEB_SCENE_PLAN_CONTROLS_VIDEO_MODE=1
export FRESHWEB_SINGLE_VIDEO_MODEL_TYPE=runwareImageToVideo
export FRESHWEB_SINGLE_VIDEO_MODEL=alibaba:wan@2.6-flash
export FRESHWEB_SINGLE_VIDEO_WIDTH=${FRESHWEB_SINGLE_VIDEO_WIDTH:-1088}
export FRESHWEB_SINGLE_VIDEO_HEIGHT=${FRESHWEB_SINGLE_VIDEO_HEIGHT:-832}
export FRESHWEB_SINGLE_FPS=12
export FRESHWEB_SINGLE_VIDEO_PROMPT_FLAVOR=default
export FRESHWEB_SCENE_VISUAL_DIRECTION=${FRESHWEB_SCENE_VISUAL_DIRECTION:-Real 1989 German Einkaufszentrum surveillance footage inside the exact visible exhibition room. For every scene choose one locked high corner, ceiling, doorway, checkout-monitor, or aisle-end CCTV viewpoint because that view best reveals the story event and its consequence. A new scene may cut to another motivated security camera. The viewpoint lock applies only to the camera: the selected real person, cast-memory person, or existing room event must evolve visibly. Preserve real people, room geometry, existing objects, documentary deep focus, practical coverage, slight VHS noise and interlace. Every visible object has plausible scale, contact, occlusion, material texture, and room-lit shadows; transparent material retains the surface beneath it. No visible words or invented typography; strong causal progression.}
export FRESHWEB_CAMERA_STYLE=${FRESHWEB_CAMERA_STYLE:-Real 1989 German Einkaufszentrum CCTV footage: locked high security-camera viewpoint, wide practical room coverage, documentary deep focus, neutral practical exposure, slight VHS noise and interlace. Objects remain physically present with plausible scale, contact, occlusion, material texture, and room-lit shadows. The viewpoint reveals the story event while the selected subject or room event evolves continuously. No handheld, dolly, crane, cinematic close-up, shallow depth of field, studio lighting, illustration, graphic decal, or timestamp overlay.}
export FRESHWEB_REALITY_INTRUSION_MODE=${FRESHWEB_REALITY_INTRUSION_MODE:-semantic}

# Use one current Runware image model for opening, persona continuity and cast.
# This avoids switching between old Kontext routes inside one sequence.
export FRESHWEB_RUNWARE_IMAGE_MODEL=${FRESHWEB_RUNWARE_IMAGE_MODEL:-bfl:6@1}

# Build the narrated opening scene from the real camera shot through Runware
# image-to-image. This is the proven trailer path; no FAL image edit is used.
export FRESHWEB_OPENING_START_ENABLED=1
export FRESHWEB_OPENING_START_MODE=fluxContext
export FRESHWEB_OPENING_START_INTERVAL=1
export FRESHWEB_OPENING_START_PROVIDER=runware
export FRESHWEB_OPENING_START_MODEL=${FRESHWEB_OPENING_START_MODEL:-$FRESHWEB_RUNWARE_IMAGE_MODEL}
export FRESHWEB_OPENING_START_WIDTH=${FRESHWEB_OPENING_START_WIDTH:-1184}
export FRESHWEB_OPENING_START_HEIGHT=${FRESHWEB_OPENING_START_HEIGHT:-880}

# All scene and first/last destination stills use the same Runware image path.
# Do not fall back to legacy Qwen/FAL for a later scene endpoint.
export FRESHWEB_WEBCAM_PERSONA_REFERENCE_MODEL=${FRESHWEB_WEBCAM_PERSONA_REFERENCE_MODEL:-$FRESHWEB_RUNWARE_IMAGE_MODEL}
export FRESHWEB_WEBCAM_PERSONA_REFERENCE_PROVIDER=${FRESHWEB_WEBCAM_PERSONA_REFERENCE_PROVIDER:-runware}

# A selected person from CAST MEMORY is mixed with current room frame before
# WAN animates it. bfl:6@1 accepts up to ten total reference images.
export FRESHWEB_CAST_CONTEXT_ENABLED=${FRESHWEB_CAST_CONTEXT_ENABLED:-1}
export FRESHWEB_CAST_CONTEXT_MODEL=${FRESHWEB_CAST_CONTEXT_MODEL:-$FRESHWEB_RUNWARE_IMAGE_MODEL}
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
export FRESHWEB_DRIFT_CORRECTION_WIDTH=${FRESHWEB_DRIFT_CORRECTION_WIDTH:-1088}
export FRESHWEB_DRIFT_CORRECTION_HEIGHT=${FRESHWEB_DRIFT_CORRECTION_HEIGHT:-832}
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
