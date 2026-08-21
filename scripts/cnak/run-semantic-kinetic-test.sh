#!/bin/sh
# One local scene-generator probe. No polling, no publishing. The same word
# list can later stay alive in one process for controlled further iterations.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
POSTER="$ROOT/lib/Plak-2_images/page-1.jpg"
OUT="$ROOT/GENERATIONS-CNAK-KINETIC-LOCAL"

export FRESHWEB_FOLDER="cnak-garten-golum-semantic-story-local-002"
export GENERATIONS_PATH="$OUT"
export FRESHWEB_MAX_ITERATIONS=1
export FRESHWEB_POLLING_TIME_MS=0
export FRESHWEB_WORDS="Department store,en | Horror,en | Art exhibition,en"
export FRESHWEB_SCENE_COUNT=1
export FRESHWEB_SCENE_LENGTHS=6
export FRESHWEB_USE_TAKTMUSTER_LENGTHS=0
export FRESHWEB_VIDEO_ASPECT_RATIO=9:16
export FRESHWEB_IMAGE_WIDTH=576
export FRESHWEB_IMAGE_HEIGHT=1024
export FRESHWEB_OPENING_START_WIDTH=880
export FRESHWEB_OPENING_START_HEIGHT=1184
export FRESHWEB_VIDEO_WIDTH=576
export FRESHWEB_VIDEO_HEIGHT=1024
export FRESHWEB_SINGLE_VIDEO_WIDTH=576
export FRESHWEB_SINGLE_VIDEO_HEIGHT=1024
export FRESHWEB_IMAGE_TO_VIDEO_ONLY=1
export FRESHWEB_OPENING_START_ENABLED=1
export FRESHWEB_SCENE_CONTEXT_IMAGE_MAPPING_ENABLED=0
export FRESHWEB_CAMERA_IMAGE_PATH="$POSTER"
export FRESHWEB_MONSTER_CONTINUITY_ANCHOR_PATH="$POSTER"
export FRESHWEB_ALLOW_PEOPLE=0
export FRESHWEB_END_CARD_ENABLED=0
export FRESHWEB_MIRELO_AUDIO_ENABLED=0
export FRESHWEB_ENABLE_DRIFT_CORRECTION=1
export FRESHWEB_DRIFT_CORRECTION_LEVEL=moderate
export FRESHWEB_WAN_AUDIO_ENABLED=0
export FRESHWEB_PROMPT_MODEL_A=gpt-4.1-mini-2025-04-14
export FRESHWEB_SCENE_PLAN_MODEL=gpt-4.1-mini-2025-04-14
export OPENAI_MODEL=gpt-4.1-mini-2025-04-14
export OPENAI_VISION_MODEL=gpt-4.1-mini-2025-04-14
export FRESHWEB_CAMERA_SCENE_PLAN_SYSTEM_PROMPT="Create one six-second scene from supplied Garten-Golum poster. Semantic stream is Department store, Horror, Art exhibition; make their collision concrete and clever. Preserve recognizable green botanical Golem face, leaf ears, root body, coloured-pencil poster language and headline. Drift is allowed only as an exhibition nightmare growing out of this poster: dark Kaufhaus architecture may form behind it, gallery lights can shine across printed artist names, a single nasty organic tongue or root may emerge from an existing mouth or flower. Make one escalating event, not a generic trailer. Slow dramatic light, breathing shadows, hesitant handheld observation are allowed. Do not invent a replacement protagonist, unrelated monster, clean CGI, unrelated location, new title text, fast action, fight, or montage. Return required JSON only."
export FRESHWEB_OPENING_PROMPT="Transform supplied Garten-Golum poster into one dark Kaufhaus art-exhibition night scene. Department store, Horror and Art exhibition must visibly collide through existing poster material: named printed artists briefly catch gallery light; Golem eyes wake; one existing flower or mouth may extend a wet root-like tongue. Preserve the Golem identity and poster colour language while allowing tactile cinematic drift."
export FRESHWEB_VISION_PROMPT="Describe supplied Garten-Golum poster as main campaign identity for a dark department-store art-horror Reel. Preserve exact green botanical face, luminous eyes, leaf ears, root body, coloured-pencil texture and headline; permit only controlled scenic drift and one local uncanny organic event."

exec sh "$ROOT/lib/generator/adapter/MIX-again-freshweb.glas-kaufhaus-trailer.sh"
