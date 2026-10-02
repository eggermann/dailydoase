#!/bin/zsh
set -euo pipefail

# First Selfomat prototype. The existing generator supplies live camera,
# semantic stream, short clips, and cast-context rendering.
export FRESHWEB_SELFOMAT_ENABLED=1
export FRESHWEB_ADD_SELFIE_OPENER=${FRESHWEB_ADD_SELFIE_OPENER:-1}
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
export FRESHWEB_SCENE_VISUAL_DIRECTION='A strong, intense causal Selfomat story, captured as imperfect real visitor material. Current visitor remains main person, but every semantic cue must cause a visible change in person, object, or room. Scene 1 establishes one concrete trigger; every following scene inherits visible residue and causes a stronger change. Require at least three distinct event types and at least two unmistakable room/location transformations across a normal five-to-six-scene run; no isolated hand-gesture chain. Let ordered semantic material gently overdrive whole chain: push each physical consequence one believable step beyond previous scene. If Vision contains an enabled animal analogy, sharpen it slightly through posture, rhythm, silhouette, texture, or object relation while keeping visitor human and recognizable. Never use readable logos, signage, captions, or invented text. Per scene choose exactly one capture source: pocketPhone most often, cheapCCTV occasionally, firstPersonDrone rarely. Never mix sources. Keep natural skin and clothing, mundane available light, and imperfect framing.'
export FRESHWEB_CAMERA_STYLE='Story-selected single capture source: pocketPhone is late, reactive, tilted and partly cut off; cheapCCTV is fixed high-corner 4:3; firstPersonDrone is low, unstable FPV with slight horizon roll. One source only per scene. Movement and framing consequence follow action; no studio polish or static default house angle.'

exec "$(dirname "$0")/MIX-again-freshweb.glas-kaufhaus-trailer.sh"
