#!/bin/zsh
set -euo pipefail

cd "$(dirname "$0")"

export FRESHWEB_FOLDER=${FRESHWEB_FOLDER:-freshweb-prompt-fast-wan-strict-4-3-test}
export VIDEO_MODE_PRESET=${VIDEO_MODE_PRESET:-storyDrivenMixed}
export FRESHWEB_SCENE_COUNT=${FRESHWEB_SCENE_COUNT:-}
export FRESHWEB_WORDS=${FRESHWEB_WORDS:-exhibition opening,en | people,en | artwork,en | point of view,en}

export FRESHWEB_SINGLE_VIDEO_MODEL_TYPE=${FRESHWEB_SINGLE_VIDEO_MODEL_TYPE:-falImageToVideo}
export FRESHWEB_SINGLE_VIDEO_MODEL=${FRESHWEB_SINGLE_VIDEO_MODEL:-fal-ai/wan/turbo/image-to-video}
export FRESHWEB_FIRST_LAST_VIDEO_MODEL_TYPE=${FRESHWEB_FIRST_LAST_VIDEO_MODEL_TYPE:-falFirstLast}
export FRESHWEB_FIRST_LAST_VIDEO_MODEL=${FRESHWEB_FIRST_LAST_VIDEO_MODEL:-fal-ai/wan-flf2v}
export FRESHWEB_ALLOW_PAID_FAL_MULTI_SCENE=${FRESHWEB_ALLOW_PAID_FAL_MULTI_SCENE:-1}
export FRESHWEB_ALLOW_PAID_FAL_POLLING=${FRESHWEB_ALLOW_PAID_FAL_POLLING:-1}

export FRESHWEB_SINGLE_VIDEO_PROMPT_FLAVOR=${FRESHWEB_SINGLE_VIDEO_PROMPT_FLAVOR:-ltxTrippy}
export FRESHWEB_LOCK_PROMPT_CONTINUITY_TO_OPENING_FRAME=${FRESHWEB_LOCK_PROMPT_CONTINUITY_TO_OPENING_FRAME:-0}
export FRESHWEB_OPENING_PROMPT=${FRESHWEB_OPENING_PROMPT:-freshweb webcam shot, exact same real person, same face, same hair, same beard, same glasses, same clothes, same room, same camera angle, same lighting, documentary realism, true camera orientation, not mirrored, not selfie-flipped}
export FRESHWEB_SCENE_VISUAL_DIRECTION=${FRESHWEB_SCENE_VISUAL_DIRECTION:-keep the same visible location, same room geometry, same environmental layout, same props, same lighting logic, same camera height, and the same grounded exhibition-opening feeling inside the visible space. For each new shot, allow the people or figures from the previous shot to be replaced by newly matched figures that fit the new camera angle, while keeping continuity believable through pose, gaze, blocking, and framing. Prioritize staying in the same location over preserving identical figure placement. Follow visible people as guests or viewers, infer small social stories from gaze, spacing, and reactions, let artwork or displayed surfaces bend toward each viewers point of view, only believable pose, gaze, lighting, and framing changes}
export FRESHWEB_VISION_PROMPT=${FRESHWEB_VISION_PROMPT:-Describe only the visible shot for strict location continuity and figure matching across shots. Return concise labeled lines for Subject, Setting, Framing, Lighting, Location, Actors, Description, and what must stay identical for the next shot. In Actors, describe each visible person with exact face, hair, beard, glasses, age, body build, clothing, pose, gaze direction, and who or what they seem to attend to. In Location, describe the exact room geometry, door, window, wall art, display surfaces, furniture, sight lines, and spatial layout that must remain stable. In Description, note how visible people and artwork relate in the shot without inventing anything off-screen. For the next shot, keep the location, environment, and scene geography anchored, but allow newly matched figures if the camera angle or composition changes.}

export FRESHWEB_DRIFT_CORRECTION_LEVEL=${FRESHWEB_DRIFT_CORRECTION_LEVEL:-aggressive}
export FRESHWEB_ENABLE_DRIFT_CORRECTION=${FRESHWEB_ENABLE_DRIFT_CORRECTION:-1}
export FRESHWEB_DRIFT_CORRECTION_USE_CAMERA_REFERENCE=${FRESHWEB_DRIFT_CORRECTION_USE_CAMERA_REFERENCE:-0}
export FRESHWEB_DRIFT_CORRECTION_NEGATIVE_PROMPT=${FRESHWEB_DRIFT_CORRECTION_NEGATIVE_PROMPT:-text, letters, words, captions, subtitles, signage, readable writing, typography, logo, watermark, poster text, wall text, gallery label text, distorted text, different person, different face, different hair, different beard, different glasses, changed identity, changed outfit, changed room, changed location, new props, extra people, distorted face, blurry, low detail}
export FRESHWEB_DRIFT_CONTEXT_BUFFER_ENABLED=${FRESHWEB_DRIFT_CONTEXT_BUFFER_ENABLED:-0}
export FRESHWEB_DRIFT_CONTEXT_BUFFER_CAPTURE_BEFORE_EACH_CALL=${FRESHWEB_DRIFT_CONTEXT_BUFFER_CAPTURE_BEFORE_EACH_CALL:-0}
export FRESHWEB_REQUIRE_PERSON_IN_CAMERA=${FRESHWEB_REQUIRE_PERSON_IN_CAMERA:-1}
export FRESHWEB_CAMERA_PRESENCE_VISION_PROVIDERS=${FRESHWEB_CAMERA_PRESENCE_VISION_PROVIDERS:-localMistral}
export FRESHWEB_CAMERA_EMPTY_FRAME_WAIT_MS=${FRESHWEB_CAMERA_EMPTY_FRAME_WAIT_MS:-1500}

export FRESHWEB_USE_WEBCAM_PERSONA_REFERENCE=${FRESHWEB_USE_WEBCAM_PERSONA_REFERENCE:-0}
export FRESHWEB_ASYNC_PERSONA_REFERENCE_UPDATES=${FRESHWEB_ASYNC_PERSONA_REFERENCE_UPDATES:-0}
export FRESHWEB_ASYNC_PERSONA_REFERENCE_INTERVAL=${FRESHWEB_ASYNC_PERSONA_REFERENCE_INTERVAL:-1}
export FRESHWEB_ASYNC_PERSONA_REFERENCE_BURST_COUNT=${FRESHWEB_ASYNC_PERSONA_REFERENCE_BURST_COUNT:-5}
export FRESHWEB_ASYNC_PERSONA_REFERENCE_MIN_BEAT_SECONDS=${FRESHWEB_ASYNC_PERSONA_REFERENCE_MIN_BEAT_SECONDS:-50}
export FRESHWEB_PERSONA_DESCRIPTION_VISION_PROVIDERS=${FRESHWEB_PERSONA_DESCRIPTION_VISION_PROVIDERS:-localMistral}
export FRESHWEB_CAMERA_REANCHOR_INTERVAL=${FRESHWEB_CAMERA_REANCHOR_INTERVAL:-1}
export FRESHWEB_CHAIN_FROM_PREVIOUS_LOOP_LAST_FRAME=${FRESHWEB_CHAIN_FROM_PREVIOUS_LOOP_LAST_FRAME:-0}
export FRESHWEB_RESTART_FROM_PREVIOUS_MOVIE_LAST_FRAME=${FRESHWEB_RESTART_FROM_PREVIOUS_MOVIE_LAST_FRAME:-0}
export FRESHWEB_SCENE_COUNT_BIAS=${FRESHWEB_SCENE_COUNT_BIAS:-2}
export FRESHWEB_USE_TAKTMUSTER_LENGTHS=${FRESHWEB_USE_TAKTMUSTER_LENGTHS:-1}
export FRESHWEB_SCENE_LENGTH_TAKT=${FRESHWEB_SCENE_LENGTH_TAKT:-3}
export FRESHWEB_SCENE_LENGTH_TAKT_TYPE=${FRESHWEB_SCENE_LENGTH_TAKT_TYPE:-balanced}
export FRESHWEB_SCENE_LENGTH_BIAS=${FRESHWEB_SCENE_LENGTH_BIAS:-0}
export FRESHWEB_SCENE_LENGTH_MULTIPLIER=${FRESHWEB_SCENE_LENGTH_MULTIPLIER:-1.15}
export FRESHWEB_MIN_SCENE_DURATION_SECONDS=${FRESHWEB_MIN_SCENE_DURATION_SECONDS:-1.6}
export FRESHWEB_SINGLE_VIDEO_MAX_DURATION=${FRESHWEB_SINGLE_VIDEO_MAX_DURATION:-3.2}
export FRESHWEB_SCENE_PLAN_TEMPERATURE=${FRESHWEB_SCENE_PLAN_TEMPERATURE:-0.3}
export FRESHWEB_SCENE_PLAN_TOP_P=${FRESHWEB_SCENE_PLAN_TOP_P:-0.82}
export FRESHWEB_TRIPPY_REANCHOR_INTERVAL=${FRESHWEB_TRIPPY_REANCHOR_INTERVAL:-1}

exec sh "$(pwd)/MIX-again-freshweb.prompt-fast-wan-trippy-4-3.sh" "$@"
