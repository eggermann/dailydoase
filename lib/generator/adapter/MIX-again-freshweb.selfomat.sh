#!/bin/zsh
set -euo pipefail

# First Selfomat prototype. The existing generator supplies live camera,
# semantic stream, short clips, and cast-context rendering.
export FRESHWEB_SELFOMAT_ENABLED=1
export FRESHWEB_SCENE_COUNT_MODE=${FRESHWEB_SCENE_COUNT_MODE:-taktmuster}
export FRESHWEB_WORDS="${FRESHWEB_WORDS:-Celebration,en | memory,en | reunion,en}"
export FRESHWEB_FOLDER=${FRESHWEB_FOLDER:-selfomat-first-test}
if [[ "$FRESHWEB_SCENE_COUNT_MODE" == "semantic" || "$FRESHWEB_SCENE_COUNT_MODE" == "taktmuster" ]]; then
  export FRESHWEB_SCENE_COUNT="${FRESHWEB_SCENE_COUNT:-}"
  export FRESHWEB_SCENE_LENGTHS="${FRESHWEB_SCENE_LENGTHS:-}"
else
  export FRESHWEB_SCENE_COUNT=${FRESHWEB_SCENE_COUNT:-3}
  export FRESHWEB_SCENE_LENGTHS=${FRESHWEB_SCENE_LENGTHS:-3,2,2}
fi
export FRESHWEB_REALITY_INTRUSION_MODE=off
export FRESHWEB_CAST_CONTEXT_ENABLED=1
export FRESHWEB_OPENING_START_ENABLED=${FRESHWEB_OPENING_START_ENABLED:-1}
export FRESHWEB_OPENING_START_MODE=${FRESHWEB_OPENING_START_MODE:-fluxContext}
export FRESHWEB_OPENING_START_INTERVAL=${FRESHWEB_OPENING_START_INTERVAL:-1}
export FRESHWEB_SELFOMAT_PORT=${FRESHWEB_SELFOMAT_PORT:-4011}
export FRESHWEB_SELFOMAT_STATE_DIR=${FRESHWEB_SELFOMAT_STATE_DIR:-.selfomat}
export FRESHWEB_SCENE_VISUAL_DIRECTION='A strong, intense causal selfiebox story, still captured as an imperfect real visitor selfie. The current visitor stays nearest the camera and remains the main person, but every semantic cue must produce a visible physical consequence in the person, an object, or the room. Scene 1 establishes one concrete trigger; every following scene inherits a visible residue and causes a stronger change. Require at least three distinct event types and at least two unmistakable room/location transformations across a normal five-to-six-scene run; no isolated hand-gesture chain. Let the ordered semantic material gently overdrive the whole chain: push each physical consequence one believable step beyond the previous scene. If the Vision context contains an enabled animal analogy, sharpen that analogy slightly through posture, rhythm, silhouette, texture, or object relation while keeping the visitor human and recognizable. Never use readable logos, signage, captions, or invented text. Keep natural skin and clothing, imperfect available light, and unposed phone framing. Re-evaluate camera source and movement for every scene; use loose handheld phone or small drone only when motivated by the visible event.'
export FRESHWEB_CAMERA_STYLE='Story-selected loose phone or small-drone viewpoint. One distinct camera move per scene; movement and visible framing consequence must follow the action, never a static house angle.'

exec "$(dirname "$0")/MIX-again-freshweb.glas-kaufhaus-trailer.sh"
