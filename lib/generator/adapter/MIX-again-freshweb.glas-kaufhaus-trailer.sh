#!/bin/zsh
set -euo pipefail

cd "$(dirname "$0")/../../.."

# Cheap exhibition proof: two Taktmuster iterations, no sound.
export GENERATIONS_PATH=${GENERATIONS_PATH:-"$PWD/GENRATIONS-KAUFHAUF"}
export FRESHWEB_FOLDER=${FRESHWEB_FOLDER:-glas-kaufhaus-word-low-test}
export FRESHWEB_WORDS=${FRESHWEB_WORDS:-human,en | Einkaufszentrum,de}
export FRESHWEB_MAX_ITERATIONS=${FRESHWEB_MAX_ITERATIONS:-2}
export FRESHWEB_POLLING_TIME_MS=${FRESHWEB_POLLING_TIME_MS:-1000}

# Between iterations always inspect the current camera/cast context, then let
# GPT choose continuation, First/Last transition, or a fresh camera reset.
export FRESHWEB_ITERATION_START_MODE=${FRESHWEB_ITERATION_START_MODE:-storyDriven}

# Capture the current Mac camera by default. A fixed test frame can still be
# supplied explicitly through FRESHWEB_CAMERA_IMAGE_PATH.
export FRESHWEB_MODE=${FRESHWEB_MODE:-reference-image-actor}
export FRESHWEB_CAMERA_IMAGE_PATH=${FRESHWEB_CAMERA_IMAGE_PATH-}
export FRESHWEB_OPENING_IMAGE_PATH=${FRESHWEB_OPENING_IMAGE_PATH-}
export FRESHWEB_REQUIRE_PERSON_IN_CAMERA=${FRESHWEB_REQUIRE_PERSON_IN_CAMERA:-1}
export FRESHWEB_VALIDATE_CAMERA_SHOT=${FRESHWEB_VALIDATE_CAMERA_SHOT:-1}
export FRESHWEB_MAX_GENERATIONS_WITHOUT_PERSON=${FRESHWEB_MAX_GENERATIONS_WITHOUT_PERSON:-2}
export FRESHWEB_CAMERA_PERSON_SCAN_INTERVAL_MS=${FRESHWEB_CAMERA_PERSON_SCAN_INTERVAL_MS:-10000}

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

# b1aaf247 contributes CCTV material and reference handling. GPT still chooses
# singleImage or firstLast independently for each scene.
export VIDEO_MODE_PRESET=storyDrivenMixed
export FRESHWEB_IMAGE_TO_VIDEO_ONLY=0
export FRESHWEB_FIRST_CLIP_VIDEO_MODE=${FRESHWEB_FIRST_CLIP_VIDEO_MODE:-singleImage}
export FRESHWEB_LATER_CLIPS_SINGLE_IMAGE=${FRESHWEB_LATER_CLIPS_SINGLE_IMAGE:-0}
export FRESHWEB_DYNAMIC_SINGLE_IMAGE_LATER_CLIPS=${FRESHWEB_DYNAMIC_SINGLE_IMAGE_LATER_CLIPS:-0}
export FRESHWEB_SCENE_PLAN_CONTROLS_VIDEO_MODE=${FRESHWEB_SCENE_PLAN_CONTROLS_VIDEO_MODE:-1}
export FRESHWEB_SINGLE_VIDEO_MODEL_TYPE=runwareImageToVideo
export FRESHWEB_SINGLE_VIDEO_MODEL=alibaba:wan@2.6-flash

# Lauf 819 stayed smooth because every First/Last and single-image clip shared
# one render contract. Wan 2.6 Flash accepts 1088x832 as its smallest landscape
# 4:3 input, so both mixed modes use that same contract before concat.
export FRESHWEB_VIDEO_WIDTH=${FRESHWEB_VIDEO_WIDTH:-1088}
export FRESHWEB_VIDEO_HEIGHT=${FRESHWEB_VIDEO_HEIGHT:-832}
export FRESHWEB_VIDEO_FPS=${FRESHWEB_VIDEO_FPS:-10}
export FRESHWEB_SINGLE_VIDEO_WIDTH=${FRESHWEB_SINGLE_VIDEO_WIDTH:-1088}
export FRESHWEB_SINGLE_VIDEO_HEIGHT=${FRESHWEB_SINGLE_VIDEO_HEIGHT:-832}
export FRESHWEB_SINGLE_FPS=${FRESHWEB_SINGLE_FPS:-10}
export FRESHWEB_SINGLE_VIDEO_PROMPT_FLAVOR=default
export FRESHWEB_SCENE_VISUAL_DIRECTION=${FRESHWEB_SCENE_VISUAL_DIRECTION:-Real 1989 German Einkaufszentrum surveillance footage inside the exact visible exhibition room. For every scene choose one fixed high corner, ceiling, doorway, checkout-monitor, or aisle-end camera angle because that view best reveals the story event and its consequence. A new scene may cut to another motivated security camera, but never use operator movement. Preserve real people, room geometry, existing objects, practical coverage, dirty VHS interlace, clipped highlights, crushed blacks, chroma bleed, lens grime, uneven auto exposure, dropped frames and low bitrate; no visible words or invented typography; strong causal progression.}
export FRESHWEB_CAMERA_STYLE=${FRESHWEB_CAMERA_STYLE:-Real 1989 German Einkaufszentrum CCTV footage: fixed high security-camera angle, wide practical room coverage, dirty VHS interlace, harsh clipped fluorescent highlights, crushed shadows, chroma bleed, lens grime, dead pixels, unstable auto exposure and low bitrate. The selected angle reveals this story event; no handheld, dolly, crane, cinematic close-up, shallow depth of field, studio lighting, or timestamp overlay.}
export FRESHWEB_REALITY_INTRUSION_MODE=${FRESHWEB_REALITY_INTRUSION_MODE:-semantic}

# Use one current Runware image model for opening, persona continuity and cast.
# This avoids switching between old Kontext routes inside one sequence.
export FRESHWEB_RUNWARE_IMAGE_MODEL=${FRESHWEB_RUNWARE_IMAGE_MODEL:-bfl:6@1}

# The opening starts on the unmodified camera observation. WAN receives that
# exact frame, so the visitor, room, lens and cheap-webcam material stay real.
# Set this to 1 only for an intentionally authored BFL opening transformation.
export FRESHWEB_OPENING_START_ENABLED=${FRESHWEB_OPENING_START_ENABLED:-1}
export FRESHWEB_OPENING_START_MODE=${FRESHWEB_OPENING_START_MODE:-fluxContext}
export FRESHWEB_OPENING_START_INTERVAL=1
export FRESHWEB_OPENING_START_PROVIDER=runware
export FRESHWEB_OPENING_START_MODEL=${FRESHWEB_OPENING_START_MODEL:-bfl:3@1}
export FRESHWEB_OPENING_START_NEGATIVE_PROMPT=${FRESHWEB_OPENING_START_NEGATIVE_PROMPT:-different person, second person, extra person, crowd, duplicate face, changed hair, changed age, changed clothing, oversized objects, giant props, clean cinematic image, polished commercial lighting}
export FRESHWEB_OPENING_START_WIDTH=${FRESHWEB_OPENING_START_WIDTH:-1184}
export FRESHWEB_OPENING_START_HEIGHT=${FRESHWEB_OPENING_START_HEIGHT:-880}

# All scene and first/last destination stills use the same Runware image path.
# Do not fall back to legacy Qwen/FAL for a later scene endpoint.
export FRESHWEB_WEBCAM_PERSONA_REFERENCE_MODEL=${FRESHWEB_WEBCAM_PERSONA_REFERENCE_MODEL:-bfl:3@1}
export FRESHWEB_WEBCAM_PERSONA_REFERENCE_PROVIDER=${FRESHWEB_WEBCAM_PERSONA_REFERENCE_PROVIDER:-runware}

# A selected person from CAST MEMORY can be mixed into an explicit First/Last
# destination. It is off for normal webcam shots: reconstructing every opening
# through BFL makes the person and the room drift before WAN has started.
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
# Two stale references may bridge a brief absence. Then wait for a real new person.
export FRESHWEB_CAMERA_MAX_LAST_VALID_REUSES=${FRESHWEB_CAMERA_MAX_LAST_VALID_REUSES:-2}
export FRESHWEB_TRIPPY_REANCHOR_INTERVAL=0

# Every completed shot gets one synchronous fresh camera observation. GPT then
# chooses continue, First/Last return into real room, or direct camera reset.
export FRESHWEB_SCENE_BOUNDARY_TRANSPORT=${FRESHWEB_SCENE_BOUNDARY_TRANSPORT:-1}
export FRESHWEB_ROOM_MEMORY_SIZE=${FRESHWEB_ROOM_MEMORY_SIZE:-10}
export FRESHWEB_ASYNC_PERSONA_REFERENCE_UPDATES=0

# Stable low-test assembly: no audio and no repeated boundary hold. Later clips
# lose their first 0.125 seconds and are re-timed.
export FRESHWEB_MIRELO_MODE=off
export FRESHWEB_CONCAT_TRIM_LEADING_SECONDS=${FRESHWEB_CONCAT_TRIM_LEADING_SECONDS:-0.125}
export FRESHWEB_RETRY_ON_FAILURE=0
export FRESHWEB_VIDEO_MAX_RETRIES_ON_FAILURE=0

exec node lib/generator/adapter/MIX-again-freshweb.js
