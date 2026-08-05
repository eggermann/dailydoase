#!/bin/zsh
set -euo pipefail

cd "$(dirname "$0")"

# GLAS-KAUFHAUS TRAILER — CONTROL PANEL
#
# Change this file to change the trailer. The JavaScript only executes these
# values; it does not contain a second preset.
#
# 1. STORY          words, people, monster, Kaufhaus and prompt model
# 2. RHYTHM          how many scenes and how long every scene lasts
# 3. IMAGE / VIDEO   image size, WAN, start frames, drift repair and audio

# -----------------------------------------------------------------------------
# 1. STORY — where the trailer is saved and what it is about
# -----------------------------------------------------------------------------

export FRESHWEB_FOLDER=${FRESHWEB_FOLDER:-glas-kaufhaus-shorty-book-trailer-loop-001}
# A non-zero poll interval keeps one Semantic Stream process generating the
# next trailer from the preceding trailer's final frame.
export FRESHWEB_POLLING_TIME_MS=${FRESHWEB_POLLING_TIME_MS:-5000}
# Leave empty for an endless stream. Set 2, for example, to stop after two
# complete trailer iterations in the same chained run.
export FRESHWEB_MAX_ITERATIONS=${FRESHWEB_MAX_ITERATIONS:-}
export VIDEO_MODE_PRESET=${VIDEO_MODE_PRESET:-singleImageOnly}
export FRESHWEB_MODE=${FRESHWEB_MODE:-reference-image-actor}
export FRESHWEB_SOURCE_CUE_MODE=${FRESHWEB_SOURCE_CUE_MODE:-collision}
export FRESHWEB_ALLOW_PEOPLE=${FRESHWEB_ALLOW_PEOPLE:-1}
export FRESHWEB_USE_VISION=${FRESHWEB_USE_VISION:-1}
# Analyse each available WAN end frame before the next scene. Missing end frames
# keep the normal location/opening fallback, so image-only tests remain valid.
export FRESHWEB_END_FRAME_ANALYSIS=${FRESHWEB_END_FRAME_ANALYSIS:-1}
export FRESHWEB_CAMERA_SOURCE_LABEL=${FRESHWEB_CAMERA_SOURCE_LABEL:-green monster protagonist reference}
# Resolve default once so logs show a clean absolute output path without ../../../.
if [ -z "${GENERATIONS_PATH:-}" ]; then
  GENERATIONS_PATH="$(cd "$(pwd)/../../.." && pwd)/GENRATIONS-KAUFHAUF"
fi
export GENERATIONS_PATH
export GENERATOR_DEBUG=${GENERATOR_DEBUG:-1}
export SCENE_GENERATOR_DEBUG=${SCENE_GENERATOR_DEBUG:-1}
export VISION_DEBUG=${VISION_DEBUG:-1}
export WAN_DEBUG=${WAN_DEBUG:-1}
export FAL_DEBUG=${FAL_DEBUG:-1}
export RUNWARE_DEBUG=${RUNWARE_DEBUG:-1}
export FLUX_DEBUG=${FLUX_DEBUG:-1}
export MIRELO_DEBUG=${MIRELO_DEBUG:-1}

# Prompt model A is the normal production model for vision and scene planning.
export FRESHWEB_PROMPT_MODEL_A=${FRESHWEB_PROMPT_MODEL_A:-gpt-4.1-mini-2025-04-14}
# Prompt model B is parked for a later quality comparison.
export FRESHWEB_PROMPT_MODEL_B=${FRESHWEB_PROMPT_MODEL_B:-gpt-5-mini-2025-08-07}
# Keep the comparison off during normal trailer generation.
export FRESHWEB_PROMPT_MODEL_AB_TEST_ENABLED=${FRESHWEB_PROMPT_MODEL_AB_TEST_ENABLED:-0}
# When A/B testing is enabled, choose A or B explicitly for a reproducible run.
export FRESHWEB_PROMPT_MODEL_AB_VARIANT=${FRESHWEB_PROMPT_MODEL_AB_VARIANT:-A}

# Resolve one prompt model before starting the Node runtime.
FRESHWEB_SELECTED_PROMPT_MODEL="$FRESHWEB_PROMPT_MODEL_A"
if [ "$FRESHWEB_PROMPT_MODEL_AB_TEST_ENABLED" = "1" ]; then
  case "$FRESHWEB_PROMPT_MODEL_AB_VARIANT" in
    B|b)
      FRESHWEB_SELECTED_PROMPT_MODEL="$FRESHWEB_PROMPT_MODEL_B"
      ;;
    *)
      FRESHWEB_SELECTED_PROMPT_MODEL="$FRESHWEB_PROMPT_MODEL_A"
      ;;
  esac
fi

# Use the selected model for both visual analysis and structured scene plans.
export OPENAI_MODEL=${OPENAI_MODEL:-$FRESHWEB_SELECTED_PROMPT_MODEL}
export OPENAI_VISION_MODEL=${OPENAI_VISION_MODEL:-$FRESHWEB_SELECTED_PROMPT_MODEL}
# Scene planning performs whole-sequence creative work; vision remains cheaper.
export FRESHWEB_SCENE_PLAN_MODEL=${FRESHWEB_SCENE_PLAN_MODEL:-$FRESHWEB_PROMPT_MODEL_B}
# Pin vision to OpenAI so hidden LM Studio, Hugging Face, or FAL fallbacks cannot change results.
export FRESHWEB_VISION_PROVIDERS=${FRESHWEB_VISION_PROVIDERS:-openai}

# The canonical image defines one immutable protagonist identity. Semantic Stream
# collisions may change pose, action and interaction, never species or identity.
export FRESHWEB_CAMERA_IMAGE_PATH=${FRESHWEB_CAMERA_IMAGE_PATH:-$(pwd)/../../../lib/Plak-2_images/monster-reference/green-monster-protagonist-realistic-chroma.png}
# Every visible-monster scene uses this complete Kaufhaus-monster reference.
# A later WAN end frame is only fallback if this canonical asset is unavailable.
export FRESHWEB_MONSTER_CONTINUITY_ANCHOR_PATH=${FRESHWEB_MONSTER_CONTINUITY_ANCHOR_PATH:-$(pwd)/../../../lib/Plak-2_images/kaufhaus-location-with-monster/location-central-hall-monster.png}
# Safest identity mode: every visible monster starts from fresh FLUX with the
# canonical original reference. WAN only animates the already visible subject.
export FRESHWEB_MONSTER_VISIBLE_ALWAYS_FRESH=${FRESHWEB_MONSTER_VISIBLE_ALWAYS_FRESH:-1}
unset FRESHWEB_CAMERA_IMAGE_URL
unset FRESHWEB_CAMERA_IMAGE_URLS
unset FRESHWEB_OPENING_IMAGE_URL
unset FRESHWEB_OPENING_IMAGE_URLS

# Kaufhaus photos define the fixed geometry of every scene.
export FRESHWEB_SCENE_CONTEXT_IMAGE_MAPPING_ENABLED=${FRESHWEB_SCENE_CONTEXT_IMAGE_MAPPING_ENABLED:-1}
export FRESHWEB_SCENE_CONTEXT_LOCK_ACTOR_COUNT=${FRESHWEB_SCENE_CONTEXT_LOCK_ACTOR_COUNT:-0}
export FRESHWEB_SCENE_CONTEXT_PROTAGONIST_REFERENCE_MODE=${FRESHWEB_SCENE_CONTEXT_PROTAGONIST_REFERENCE_MODE:-image}
# Strong one-pass generation is cheaper and currently gives cleaner compositions.
# Set to 1 from outside only when a second semantic reconstruction pass is wanted.
export FRESHWEB_SCENE_CONTEXT_SEMANTIC_RECONSTRUCTION_PASS=${FRESHWEB_SCENE_CONTEXT_SEMANTIC_RECONSTRUCTION_PASS:-0}

# Final information card: exact dossier text, no AI-generated lettering.
export FRESHWEB_END_CARD_ENABLED=${FRESHWEB_END_CARD_ENABLED:-1}
export FRESHWEB_END_CARD_DURATION_SECONDS=${FRESHWEB_END_CARD_DURATION_SECONDS:-4}
export FRESHWEB_END_CARD_DOSSIER_PATH=${FRESHWEB_END_CARD_DOSSIER_PATH:-$(pwd)/../../../lib/Plak-2_images/formen_der_abweichunf_datas.json}
# Each scene boundary becomes a visible semantic collision instead of exposing
# WAN's repeated handoff frame. Camera movement comes from each scene's current
# word collision; no global post-process forces every clip in one direction.
export FRESHWEB_COLLISION_TRANSITIONS_ENABLED=${FRESHWEB_COLLISION_TRANSITIONS_ENABLED:-1}
export FRESHWEB_COLLISION_TRANSITION_BOUNDARY_TRIM_SECONDS=${FRESHWEB_COLLISION_TRANSITION_BOUNDARY_TRIM_SECONDS:-0.12}
export FRESHWEB_COLLISION_TRANSITION_DURATION_SECONDS=${FRESHWEB_COLLISION_TRANSITION_DURATION_SECONDS:-0.08}
export FRESHWEB_GLOBAL_FORWARD_DOLLY_ENABLED=${FRESHWEB_GLOBAL_FORWARD_DOLLY_ENABLED:-0}
export FRESHWEB_SCENE_CONTEXT_IMAGE_PATHS="${FRESHWEB_SCENE_CONTEXT_IMAGE_PATHS:-$(pwd)/../../../lib/Plak-2_images/kaufhaus-location/location-central-hall.jpeg | $(pwd)/../../../lib/Plak-2_images/kaufhaus-location/location-mirrored-columns.jpeg | $(pwd)/../../../lib/Plak-2_images/kaufhaus-location/location-elevators.jpeg | $(pwd)/../../../lib/Plak-2_images/kaufhaus-location/location-white-wall.jpeg}"
unset FRESHWEB_SCENE_CONTEXT_IMAGE_URLS
unset FRESHWEB_SCENE_CONTEXT_IMAGE_FOLDER_URL
unset FRESHWEB_SCENE_CONTEXT_IMAGE_API_URL

# Ordered story anchors. Change these three streams to change the story.
export FRESHWEB_WORDS="${FRESHWEB_WORDS:-Kaufhaus,de | Berlin-Neukölln,de}"

# -----------------------------------------------------------------------------
# 2. RHYTHM — scene count and duration
# -----------------------------------------------------------------------------
#
# Leave these values together. The first group makes the number of scenes;
# the second group gives their durations. WAN only accepts whole seconds.
# The count taktmuster decides how many scenes the word stream grows into.
# The length taktmuster decides the per-scene beat pattern.
# WAN accepts full seconds only, so the preset stays on literal second values:
# no decimal scaling, no hidden padding, and no later surprise stretch.
export FRESHWEB_USE_TAKTMUSTER_LENGTHS=${FRESHWEB_USE_TAKTMUSTER_LENGTHS:-1}
unset FRESHWEB_SCENE_COUNT_INITIAL_PATTERN
export FRESHWEB_SCENE_COUNT_TAKT_COUNT=${FRESHWEB_SCENE_COUNT_TAKT_COUNT:-2}
export FRESHWEB_SCENE_COUNT_TAKT_ZAEHLER=${FRESHWEB_SCENE_COUNT_TAKT_ZAEHLER:-4}
export FRESHWEB_SCENE_COUNT_TAKT_NENNER=${FRESHWEB_SCENE_COUNT_TAKT_NENNER:-4}
export FRESHWEB_SCENE_COUNT_TAKT_TYPE=${FRESHWEB_SCENE_COUNT_TAKT_TYPE:-balanced}
export FRESHWEB_SCENE_COUNT_BIAS=${FRESHWEB_SCENE_COUNT_BIAS:-2}
export FRESHWEB_SCENE_LENGTH_TAKT=${FRESHWEB_SCENE_LENGTH_TAKT:-1}
export FRESHWEB_SCENE_LENGTH_TAKT_TYPE=${FRESHWEB_SCENE_LENGTH_TAKT_TYPE:-balanced}
export FRESHWEB_SCENE_LENGTH_MULTIPLIER=${FRESHWEB_SCENE_LENGTH_MULTIPLIER:-1}
export FRESHWEB_SCENE_LENGTH_BIAS=${FRESHWEB_SCENE_LENGTH_BIAS:-1}
export FRESHWEB_MIN_SCENE_DURATION_SECONDS=${FRESHWEB_MIN_SCENE_DURATION_SECONDS:-2}
export FRESHWEB_SCENE_PLAN_TEMPERATURE=${FRESHWEB_SCENE_PLAN_TEMPERATURE:-0.35}
export FRESHWEB_SCENE_PLAN_TOP_P=${FRESHWEB_SCENE_PLAN_TOP_P:-0.9}
# Keep the preserved exhibition-animal/fries story behavior: this flavor tells
# the planner that semantic words may generate strong surreal scene events. WAN
# remains the video model; the name only selects the story-planning grammar.
export FRESHWEB_SINGLE_VIDEO_PROMPT_FLAVOR=${FRESHWEB_SINGLE_VIDEO_PROMPT_FLAVOR:-ltxTrippy}

# -----------------------------------------------------------------------------
# 3. IMAGE / VIDEO / AUDIO — visual production settings
# -----------------------------------------------------------------------------
#
# Normally leave this block as-is. The useful external switches are:
# FRESHWEB_WAN_AUDIO_ENABLED=1         WAN native sound (default: off)
# FRESHWEB_PROMPT_MODEL_AB_TEST_ENABLED=1  compare prompt model A/B (default: off)
# FRESHWEB_ENABLE_DRIFT_CORRECTION=0   disable selective image repair

# Let the scene planner choose how each WAN clip receives its start frame.
# Set this to "legacy" to restore the earlier frameSource/freshImage behavior.
export FRESHWEB_START_FRAME_STRATEGY_MODE=${FRESHWEB_START_FRAME_STRATEGY_MODE:-planner}
# Dramatic target percentages. They guide the planner; they are not a rigid cycle.
export FRESHWEB_START_FRAME_RAW_PERCENT=${FRESHWEB_START_FRAME_RAW_PERCENT:-50}
export FRESHWEB_START_FRAME_DRIFT_PERCENT=${FRESHWEB_START_FRAME_DRIFT_PERCENT:-20}
export FRESHWEB_START_FRAME_LOCATION_PERCENT=${FRESHWEB_START_FRAME_LOCATION_PERCENT:-30}
# Prevent long chains in which visual drift can accumulate unnoticed.
export FRESHWEB_START_FRAME_MAX_RAW_STREAK=${FRESHWEB_START_FRAME_MAX_RAW_STREAK:-2}
# Begin from photographed Kaufhaus reality and finish with uninterrupted mutation.
export FRESHWEB_START_FRAME_FIRST_STRATEGY=${FRESHWEB_START_FRAME_FIRST_STRATEGY:-locationReanchor}
export FRESHWEB_START_FRAME_LAST_STRATEGY=${FRESHWEB_START_FRAME_LAST_STRATEGY:-rawLastFrame}
# Optional free-form direction can refine the planner without changing code.
if [ -z "${FRESHWEB_START_FRAME_STRATEGY_GUIDANCE:-}" ]; then
  FRESHWEB_START_FRAME_STRATEGY_GUIDANCE="Choose from story need: continuity, identity repair, or spatial reorientation."
fi
export FRESHWEB_START_FRAME_STRATEGY_GUIDANCE

# Assign long prose outside ${NAME:-default}. POSIX sh can misread apostrophes
# inside that compact form and merge multiple prompt lines into one substitution.
if [ "$FRESHWEB_ALLOW_PEOPLE" = "1" ]; then
  FRESHWEB_PEOPLE_DIRECTION="People may appear when the semantic streams naturally call for them; neither add nor exclude them by default."
else
  FRESHWEB_PEOPLE_DIRECTION="The Green Monster is the only protagonist and the only living figure. Do not create people, portraits, human silhouettes, faces, crowds, or poster panels."
fi
export FRESHWEB_PEOPLE_DIRECTION

if [ -z "${FRESHWEB_OPENING_PROMPT:-}" ]; then
  FRESHWEB_OPENING_PROMPT="Open inside the supplied real Kaufhaus as if one precise unexplained event has already begun. Let the first planned scene decide whether the monster is visible, implied or absent. Establish the location and one readable Semantic Stream change. No readable text or modern branding."
fi
export FRESHWEB_OPENING_PROMPT

if [ -z "${FRESHWEB_SCENE_VISUAL_DIRECTION:-}" ]; then
  FRESHWEB_SCENE_VISUAL_DIRECTION="Keep the supplied Kaufhaus recognizable as the same real interior, but allow each Semantic Stream collision to change how its architecture, circulation, objects, light, reflections, people or local space behave. The monster is a recurring protagonist, not a mandatory subject. Do not show it in location, objects, people or trace-focused scenes. Preserve monster identity only when it is visible. Render it as a weathered practical sculpture physically filmed in the Kaufhaus, never as an illustration, comic, cartoon, cel-shaded figure, glossy fantasy CGI, or concept art. Keep events concrete, cinematic, strange and physically readable. No readable text or logos."
fi
export FRESHWEB_SCENE_VISUAL_DIRECTION

if [ -z "${FRESHWEB_CAMERA_SCENE_PLAN_SYSTEM_PROMPT:-}" ]; then
  FRESHWEB_CAMERA_SCENE_PLAN_SYSTEM_PROMPT="Create a coherent sequence of short cinematic scenes inside the supplied Kaufhaus. Each scene receives an inherited Semantic Anchor and a fresh Semantic Collision. Interpret their friction freely and turn it into one specific, surprising, filmable rule of the scene world. For every scene choose the strongest carrier of that rule: the Kaufhaus architecture or circulation, movable objects, light or reflections, people, an unexplained trace, the monster, or a combination. Do not use the monster as the automatic carrier of every collision. The monster is the recurring protagonist of the complete sequence, but it must not be visible in every scene. When sceneFocus is location, objects, people or trace, do not mention or show the monster in stillPrompt or videoPrompt. When sceneFocus is monster or mixed, use the monster only when its visible action is more expressive than an environmental interpretation. Allow the Semantic Stream to alter the Kaufhaus interior meaningfully while keeping it recognizable as the same real building. It may change local function, arrangement, illumination, reflections, circulation, geometry or behavior. Do not reduce every collision to monster mutation, roots, glowing eyes, reacting lamps or floor reflections. Each scene leaves one visible consequence that may become the following scene's starting condition. Choose the camera after choosing the physical event. Write concrete physical events, not explanations of symbolism. Return JSON only with title, semanticAnchor, semanticCollision, sceneFocus, event, monsterPresence, consequence, nextHook, stillPrompt, videoPrompt, cameraCue and startFrameStrategy."
fi
export FRESHWEB_CAMERA_SCENE_PLAN_SYSTEM_PROMPT

if [ -z "${FRESHWEB_VISION_PROMPT:-}" ]; then
  FRESHWEB_VISION_PROMPT="Describe the visible green-monster reference as a protagonist-only identity reference for a multi-scene video. Identify the central green plant-like monster, glowing eyes, face, body silhouette, material cues, and continuity requirements. Treat it as a weathered physical sculpture or practical prop, never an illustration, comic, cartoon, cel-shaded figure, glossy fantasy CGI, or concept art. Do not treat background, room, or lettering as scene facts. Favor a grounded mobile-device look: handheld, candid, lightly imperfect, and realistic. Return concise labeled lines for Subject, Framing, Lighting, Description, and continuity requirements."
fi
export FRESHWEB_VISION_PROMPT

# Runware is the primary and only video provider for this trailer. WAN 2.6 Flash
# receives one start frame and returns a 720p clip without native audio.
export FRESHWEB_SELF_HOSTED_SINGLE=${FRESHWEB_SELF_HOSTED_SINGLE:-0}
export FRESHWEB_SINGLE_VIDEO_MODEL_TYPE=${FRESHWEB_SINGLE_VIDEO_MODEL_TYPE:-runwareImageToVideo}
export FRESHWEB_SINGLE_VIDEO_MODEL=${FRESHWEB_SINGLE_VIDEO_MODEL:-alibaba:wan@2.6-flash}
# Keep WAN's native soundtrack off; Mirelo can score the joined trailer later.
export FRESHWEB_WAN_AUDIO_ENABLED=${FRESHWEB_WAN_AUDIO_ENABLED:-0}
export FRESHWEB_ENABLE_RUNWARE_FALLBACKS=${FRESHWEB_ENABLE_RUNWARE_FALLBACKS:-0}
export FRESHWEB_ENABLE_PAID_FAL_FALLBACKS=${FRESHWEB_ENABLE_PAID_FAL_FALLBACKS:-0}

# Runware FLUX Kontext generates the opening and scene-context images from the
# photographed Kaufhaus plus the separate monster identity reference.
export FRESHWEB_OPENING_START_ENABLED=${FRESHWEB_OPENING_START_ENABLED:-1}
export FRESHWEB_OPENING_START_MODE=${FRESHWEB_OPENING_START_MODE:-fluxContext}
export FRESHWEB_OPENING_START_INTERVAL=${FRESHWEB_OPENING_START_INTERVAL:-1}
export FRESHWEB_OPENING_START_PROVIDER=${FRESHWEB_OPENING_START_PROVIDER:-runware}
export FRESHWEB_OPENING_START_MODEL=${FRESHWEB_OPENING_START_MODEL:-bfl:3@1}
export FRESHWEB_OPENING_START_WIDTH=${FRESHWEB_OPENING_START_WIDTH:-1184}
export FRESHWEB_OPENING_START_HEIGHT=${FRESHWEB_OPENING_START_HEIGHT:-880}
export FRESHWEB_OPENING_START_NEGATIVE_PROMPT="${FRESHWEB_OPENING_START_NEGATIVE_PROMPT:-broken anatomy, blur, low detail, collage, split screen, readable text, modern logo, illustration, comic-book art, cartoon, cel shading, glossy fantasy CGI, concept art, different monster, generic green monster, green human, green person, green humanoid, plant person, tree person, forest goblin, alternate creature, different face, different anatomy, duplicate monster, substitute protagonist}"
# The saved monster reference is passed directly to Runware; disable the legacy Qwen/FAL persona editor.
export FRESHWEB_USE_WEBCAM_PERSONA_REFERENCE=${FRESHWEB_USE_WEBCAM_PERSONA_REFERENCE:-0}
export FRESHWEB_LOCK_PROMPT_CONTINUITY_TO_OPENING_FRAME=${FRESHWEB_LOCK_PROMPT_CONTINUITY_TO_OPENING_FRAME:-1}
export FRESHWEB_RESTART_FROM_PREVIOUS_MOVIE_LAST_FRAME=${FRESHWEB_RESTART_FROM_PREVIOUS_MOVIE_LAST_FRAME:-1}
export FRESHWEB_CHAIN_FROM_PREVIOUS_LOOP_LAST_FRAME=${FRESHWEB_CHAIN_FROM_PREVIOUS_LOOP_LAST_FRAME:-1}
# Enable selective image-to-image repair only when the planner requests it.
export FRESHWEB_ENABLE_DRIFT_CORRECTION=${FRESHWEB_ENABLE_DRIFT_CORRECTION:-1}
# "moderate" repairs identity and geometry without erasing the surreal mutation.
export FRESHWEB_DRIFT_CORRECTION_LEVEL=${FRESHWEB_DRIFT_CORRECTION_LEVEL:-moderate}
# Runware FLUX Kontext receives the prior WAN end frame as its editable source.
export FRESHWEB_DRIFT_CORRECTION_PROVIDER=${FRESHWEB_DRIFT_CORRECTION_PROVIDER:-runware}
export FRESHWEB_DRIFT_CORRECTION_MODEL=${FRESHWEB_DRIFT_CORRECTION_MODEL:-runware:106@1}
# There is no live camera in this trailer; location and monster files are canonical.
export FRESHWEB_DRIFT_CORRECTION_USE_CAMERA_REFERENCE=${FRESHWEB_DRIFT_CORRECTION_USE_CAMERA_REFERENCE:-0}
export FRESHWEB_DRIFT_CONTEXT_BUFFER_ENABLED=${FRESHWEB_DRIFT_CONTEXT_BUFFER_ENABLED:-0}
# Audio is generated once after all WAN clips have been joined.
export FRESHWEB_MIRELO_MODE=${FRESHWEB_MIRELO_MODE:-finalOnly}
# If the direct Mirelo request fails, retry the same synchronized SFX pass through Runware.
export FRESHWEB_MIRELO_RUNWARE_FALLBACK_ENABLED=${FRESHWEB_MIRELO_RUNWARE_FALLBACK_ENABLED:-1}
# Runware routes this fallback to Mirelo SFX 1.5 with the finished trailer as video input.
export FRESHWEB_MIRELO_RUNWARE_FALLBACK_MODEL=${FRESHWEB_MIRELO_RUNWARE_FALLBACK_MODEL:-mirelo:1@1}
# Twenty-eight steps balance synchronized detail and fallback latency.
export FRESHWEB_MIRELO_RUNWARE_FALLBACK_STEPS=${FRESHWEB_MIRELO_RUNWARE_FALLBACK_STEPS:-28}

# A preset script can source these defaults, then run the middle-cost runtime
# itself to post-process its concat output. Direct trailer use still execs here.
if [ "${FRESHWEB_TRAILER_SOURCE_ONLY:-0}" = "1" ]; then
  return 0 2>/dev/null || exit 0
fi

exec sh "$(pwd)/MIX-again-freshweb.middle-cost-4-3.sh" "$@"
