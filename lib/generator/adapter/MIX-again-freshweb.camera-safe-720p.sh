#!/bin/zsh
set -euo pipefail

cd "$(dirname "$0")"

# Helper preset for difficult indoor webcam scenes:
# - uses a supported Brio capture mode (1280x720)
# - gives the camera longer warmup
# - enables camera-shot validation
# - biases the scene grounding toward readable subject / room continuity

export FRESHWEB_CAMERA_WIDTH=${FRESHWEB_CAMERA_WIDTH:-1280}
export FRESHWEB_CAMERA_HEIGHT=${FRESHWEB_CAMERA_HEIGHT:-720}
export FRESHWEB_CAMERA_WARMUP_SECONDS=${FRESHWEB_CAMERA_WARMUP_SECONDS:-2}
export FRESHWEB_VALIDATE_CAMERA_SHOT=${FRESHWEB_VALIDATE_CAMERA_SHOT:-1}
export FRESHWEB_RETRY_ON_FAILURE=${FRESHWEB_RETRY_ON_FAILURE:-0}
export FRESHWEB_ENABLE_PAID_FAL_FALLBACKS=${FRESHWEB_ENABLE_PAID_FAL_FALLBACKS:-0}
export FRESHWEB_ALLOW_PAID_FAL_POLLING=${FRESHWEB_ALLOW_PAID_FAL_POLLING:-1}
export FRESHWEB_ALLOW_PAID_FAL_MULTI_SCENE=${FRESHWEB_ALLOW_PAID_FAL_MULTI_SCENE:-0}

export FRESHWEB_OPENING_PROMPT=${FRESHWEB_OPENING_PROMPT:-freshweb webcam shot, front-lit subject, balanced indoor exposure, reduced window glare, clear face, readable room context}
export FRESHWEB_SCENE_VISUAL_DIRECTION=${FRESHWEB_SCENE_VISUAL_DIRECTION:-documentary, realistic, readable face, balanced indoor contrast, reduced backlit window dominance, coherent camera-led progression, clear body motion, clear gesture changes, expressive face movement}

exec sh "$(pwd)/MIX-again-freshweb.live-preview.sh" "$@"
