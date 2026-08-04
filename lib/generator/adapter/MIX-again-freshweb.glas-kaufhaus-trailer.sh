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
export FRESHWEB_POLLING_TIME_MS=${FRESHWEB_POLLING_TIME_MS:-0}
export VIDEO_MODE_PRESET=${VIDEO_MODE_PRESET:-singleImageOnly}
export FRESHWEB_MODE=${FRESHWEB_MODE:-reference-image-actor}
export FRESHWEB_SOURCE_CUE_MODE=${FRESHWEB_SOURCE_CUE_MODE:-collision}
export FRESHWEB_ALLOW_PEOPLE=${FRESHWEB_ALLOW_PEOPLE:-1}
export FRESHWEB_USE_VISION=${FRESHWEB_USE_VISION:-1}
# Analyse each available WAN end frame before the next scene. Missing end frames
# keep the normal location/opening fallback, so image-only tests remain valid.
export FRESHWEB_END_FRAME_ANALYSIS=${FRESHWEB_END_FRAME_ANALYSIS:-1}
export FRESHWEB_CAMERA_SOURCE_LABEL=${FRESHWEB_CAMERA_SOURCE_LABEL:-green monster reference}
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
# Pin vision to OpenAI so hidden LM Studio, Hugging Face, or FAL fallbacks cannot change results.
export FRESHWEB_VISION_PROVIDERS=${FRESHWEB_VISION_PROVIDERS:-openai}

# The realistic monster supplies identity and material only.
# Semantic Stream collisions construct its new scene incarnation every time.
export FRESHWEB_CAMERA_IMAGE_PATH=${FRESHWEB_CAMERA_IMAGE_PATH:-$(pwd)/../../../lib/Plak-2_images/monster-reference/green-monster-protagonist-realistic-chroma.png}
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
# WAN's repeated handoff frame. A continuous forward dolly keeps the trailer's
# overall spatial direction stable across separately generated clips.
export FRESHWEB_COLLISION_TRANSITIONS_ENABLED=${FRESHWEB_COLLISION_TRANSITIONS_ENABLED:-1}
export FRESHWEB_COLLISION_TRANSITION_BOUNDARY_TRIM_SECONDS=${FRESHWEB_COLLISION_TRANSITION_BOUNDARY_TRIM_SECONDS:-0.12}
export FRESHWEB_COLLISION_TRANSITION_DURATION_SECONDS=${FRESHWEB_COLLISION_TRANSITION_DURATION_SECONDS:-0.08}
export FRESHWEB_GLOBAL_FORWARD_DOLLY_ENABLED=${FRESHWEB_GLOBAL_FORWARD_DOLLY_ENABLED:-1}
export FRESHWEB_SCENE_CONTEXT_IMAGE_PATHS="${FRESHWEB_SCENE_CONTEXT_IMAGE_PATHS:-$(pwd)/../../../lib/Plak-2_images/kaufhaus-location/location-central-hall.jpeg | $(pwd)/../../../lib/Plak-2_images/kaufhaus-location/location-mirrored-columns.jpeg | $(pwd)/../../../lib/Plak-2_images/kaufhaus-location/location-elevators.jpeg | $(pwd)/../../../lib/Plak-2_images/kaufhaus-location/location-white-wall.jpeg}"
unset FRESHWEB_SCENE_CONTEXT_IMAGE_URLS
unset FRESHWEB_SCENE_CONTEXT_IMAGE_FOLDER_URL
unset FRESHWEB_SCENE_CONTEXT_IMAGE_API_URL

# Ordered story anchors. Change these three streams to change the story.
export FRESHWEB_WORDS="${FRESHWEB_WORDS:-1983,de | Kaufhaus,de | Kunstausstellung,de}"

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
  FRESHWEB_OPENING_PROMPT="Create a cinematic warehouse scene from the Green Monster Ware Haus poster: an old Kaufhaus floor in the BRD, 1989 television trailer atmosphere, practical lamps, dark green industrial space, the same central monster figure present and readable, no readable text, no modern branding."
fi
export FRESHWEB_OPENING_PROMPT

if [ -z "${FRESHWEB_SCENE_VISUAL_DIRECTION:-}" ]; then
  FRESHWEB_SCENE_VISUAL_DIRECTION="Build a compact BRD television trailer from 1989 inside the photographed old Kaufhaus in Germany. Use the requested scene count and give every scene a distinct dramatic function. Keep the isolated green monster as primary protagonist through its choices, preserving its face, glowing eyes, plant-like anatomy, hanging lamps, and dark green industrial identity whenever it is visible. It must not become a permanent large foreground mascot: vary its presence between distant figure, partial body, reflection, occluded trace, and deliberate off-screen consequence. Every scene must preserve the supplied Kaufhaus photograph as its visible architecture and spatial composition; never reproduce a poster, infographic, exhibition panel, border, or page layout. Compose every scene as a semantic baton collision: carry the previous fresh term forward as semantic inheritance, collide it with the current stream's fresh getNext term, and let the friction give the monster an intelligent new tactic with a target and a visible room consequence. $FRESHWEB_PEOPLE_DIRECTION Scenes must be causally linked, visually concrete, strange but readable. Every image and motion prompt must specify subject, surreal event, mood, lighting, color, texture, composition, lens or framing, physical motion, and one motivated virtual camera move. Change viewpoint and scale with the tactic: use architecture, objects, thresholds, reflections, or human witness when they reveal more of the room's story than a monster close-up. Use one global camera grammar: every camera move presses forward deeper into the Kaufhaus; never pull backward, reverse direction, or counter-pan. No invented modern objects, subtitles, readable lettering, labels, callout lines, or typography."
fi
export FRESHWEB_SCENE_VISUAL_DIRECTION

if [ -z "${FRESHWEB_CAMERA_SCENE_PLAN_SYSTEM_PROMPT:-}" ]; then
  FRESHWEB_CAMERA_SCENE_PLAN_SYSTEM_PROMPT="Create the requested number of short scene plans for a green-monster trailer grounded in photographed Kaufhaus interiors. The protagonist reference contains only one isolated green plant-like monster; use it only for creature identity, never as a composition or background. Build a coherent 1989 BRD television trailer in the supplied old Kaufhaus photographs. $FRESHWEB_PEOPLE_DIRECTION Each source cue labels a carried Anchor and a fresh getNext Collision. Let the semantic stream compose the story: Anchor is the memory or situation the monster carries; Collision is the event that changes its intention, behavior, relationship to the room, and the next scene's consequence. Do not literalize words as compulsory props or labels, and do not reduce them to lighting or mood. Infer one specific, surprising causal scene event from their friction: the monster discovers, misunderstands, uses, protects, rejects, imitates, or transforms the Kaufhaus because of the collision. The next scene must inherit that consequence, not merely repeat the words. For every scene return six linked story fields: storyCause (why this collision changes the story), monsterIntent (what the monster decides or tries to do), roomConsequence (the visible aftermath inherited by the next scene), semanticAction (the monster's clever tactic, target, and visible result), monsterPresence (how the monster is seen or deliberately left unseen), and viewpoint (the in-world vantage that best exposes the tactic). These are story sentences, not a glossary or literal list of props. The monster is protagonist by agency, never a permanent large advertising mascot; vary its scale and presence from scene to scene. Every stillPrompt must capture the decisive action with the planned monster presence and viewpoint; every singleImagePrompt must show the tactic beginning, changing, and leaving its room consequence. All camera moves must push forward deeper into the same Kaufhaus; never pull back, reverse, or counter-pan. Preserve monster identity and photographed Kaufhaus continuity; no live camera, poster layout, panels, portraits, callout lines, readable text, or modern logos. Return required JSON scene plan only."
fi
export FRESHWEB_CAMERA_SCENE_PLAN_SYSTEM_PROMPT

if [ -z "${FRESHWEB_VISION_PROMPT:-}" ]; then
  FRESHWEB_VISION_PROMPT="Describe the visible green-monster reference as a location and protagonist reference for a multi-scene video. Identify the central green plant-like monster, glowing eyes, face, body silhouette, hanging lamps, warehouse architecture, industrial textures, colors, and fixed elements. Do not treat source lettering as a scene object. Return concise labeled lines for Subject, Setting, Framing, Lighting, Location, Actors, Description, and continuity requirements."
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
export FRESHWEB_OPENING_START_NEGATIVE_PROMPT="${FRESHWEB_OPENING_START_NEGATIVE_PROMPT:-broken anatomy, blur, low detail, collage, split screen, readable text, modern logo}"
# The saved monster reference is passed directly to Runware; disable the legacy Qwen/FAL persona editor.
export FRESHWEB_USE_WEBCAM_PERSONA_REFERENCE=${FRESHWEB_USE_WEBCAM_PERSONA_REFERENCE:-0}
export FRESHWEB_LOCK_PROMPT_CONTINUITY_TO_OPENING_FRAME=${FRESHWEB_LOCK_PROMPT_CONTINUITY_TO_OPENING_FRAME:-1}
export FRESHWEB_RESTART_FROM_PREVIOUS_MOVIE_LAST_FRAME=${FRESHWEB_RESTART_FROM_PREVIOUS_MOVIE_LAST_FRAME:-0}
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
