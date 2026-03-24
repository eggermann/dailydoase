#!/bin/zsh
set -euo pipefail

cd "$(dirname "$0")"

export FRESHWEB_FOLDER=${FRESHWEB_FOLDER:-freshweb-prompt-fast-wan-strict-4-3-test}

export FRESHWEB_SINGLE_VIDEO_MODEL_TYPE=${FRESHWEB_SINGLE_VIDEO_MODEL_TYPE:-falImageToVideo}
export FRESHWEB_SINGLE_VIDEO_MODEL=${FRESHWEB_SINGLE_VIDEO_MODEL:-fal-ai/wan/turbo/image-to-video}
export FRESHWEB_ALLOW_PAID_FAL_MULTI_SCENE=${FRESHWEB_ALLOW_PAID_FAL_MULTI_SCENE:-1}
export FRESHWEB_ALLOW_PAID_FAL_POLLING=${FRESHWEB_ALLOW_PAID_FAL_POLLING:-1}

export FRESHWEB_SINGLE_VIDEO_PROMPT_FLAVOR=${FRESHWEB_SINGLE_VIDEO_PROMPT_FLAVOR:-default}
export FRESHWEB_LOCK_PROMPT_CONTINUITY_TO_OPENING_FRAME=${FRESHWEB_LOCK_PROMPT_CONTINUITY_TO_OPENING_FRAME:-1}
export FRESHWEB_OPENING_PROMPT=${FRESHWEB_OPENING_PROMPT:-freshweb webcam shot, exact same real person, same face, same hair, same beard, same glasses, same clothes, same room, same camera angle, same lighting, documentary realism}
export FRESHWEB_SCENE_VISUAL_DIRECTION=${FRESHWEB_SCENE_VISUAL_DIRECTION:-documentary, realistic, exact same real person, same face, same clothes, same room geometry, same visible location, same camera height, only believable pose, gaze, and framing changes}
export FRESHWEB_VISION_PROMPT=${FRESHWEB_VISION_PROMPT:-Describe only the visible shot for strict identity and location continuity. Return concise labeled lines for Subject, Setting, Framing, Lighting, Location, Actors, Description, and what must stay identical for the next shot. In Actors, describe the exact visible face, hair, beard, glasses, age, body build, clothing, and pose. In Location, describe the exact room geometry, door, window, wall art, furniture, and camera angle.}

export FRESHWEB_DRIFT_CORRECTION_LEVEL=${FRESHWEB_DRIFT_CORRECTION_LEVEL:-aggressive}
export FRESHWEB_ENABLE_DRIFT_CORRECTION=${FRESHWEB_ENABLE_DRIFT_CORRECTION:-1}
export FRESHWEB_DRIFT_CORRECTION_USE_CAMERA_REFERENCE=${FRESHWEB_DRIFT_CORRECTION_USE_CAMERA_REFERENCE:-1}
export FRESHWEB_DRIFT_CORRECTION_NEGATIVE_PROMPT=${FRESHWEB_DRIFT_CORRECTION_NEGATIVE_PROMPT:-different person, different face, different hair, different beard, different glasses, changed identity, changed outfit, changed room, changed location, new props, extra people, distorted face, blurry, low detail}
export FRESHWEB_DRIFT_CONTEXT_BUFFER_ENABLED=${FRESHWEB_DRIFT_CONTEXT_BUFFER_ENABLED:-0}
export FRESHWEB_DRIFT_CONTEXT_BUFFER_CAPTURE_BEFORE_EACH_CALL=${FRESHWEB_DRIFT_CONTEXT_BUFFER_CAPTURE_BEFORE_EACH_CALL:-0}

export FRESHWEB_USE_WEBCAM_PERSONA_REFERENCE=${FRESHWEB_USE_WEBCAM_PERSONA_REFERENCE:-1}
export FRESHWEB_ASYNC_PERSONA_REFERENCE_UPDATES=${FRESHWEB_ASYNC_PERSONA_REFERENCE_UPDATES:-1}
export FRESHWEB_ASYNC_PERSONA_REFERENCE_INTERVAL=${FRESHWEB_ASYNC_PERSONA_REFERENCE_INTERVAL:-1}
export FRESHWEB_TRIPPY_REANCHOR_INTERVAL=${FRESHWEB_TRIPPY_REANCHOR_INTERVAL:-1}

exec sh "$(pwd)/MIX-again-freshweb.prompt-fast-wan-trippy-4-3.sh" "$@"
