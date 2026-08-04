#!/bin/zsh
set -euo pipefail

cd "$(dirname "$0")"

# Glass Kaufhaus trailer: deterministic poster-driven run, no live camera.
# The local Green Monster Ware Haus image is the protagonist/reference frame.

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
export FRESHWEB_CAMERA_SOURCE_LABEL=${FRESHWEB_CAMERA_SOURCE_LABEL:-Green Monster Ware Haus poster}
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

# Prompt model A is the stable production default for vision and scene planning.
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

# The realistic monster image supplies identity and material only.
# Every scene constructs a fresh incarnation from its Semantic Stream collision.
export FRESHWEB_CAMERA_IMAGE_PATH=${FRESHWEB_CAMERA_IMAGE_PATH:-$(pwd)/../../../lib/Plak-2_images/monster-reference/green-monster-protagonist-realistic-chroma.png}
unset FRESHWEB_CAMERA_IMAGE_URL
unset FRESHWEB_CAMERA_IMAGE_URLS
unset FRESHWEB_OPENING_IMAGE_URL
unset FRESHWEB_OPENING_IMAGE_URLS

# Kaufhaus photos define the fixed scene geometry.
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
export FRESHWEB_SCENE_CONTEXT_IMAGE_PATHS="${FRESHWEB_SCENE_CONTEXT_IMAGE_PATHS:-$(pwd)/../../../lib/Plak-2_images/kaufhaus-location/location-central-hall.jpeg | $(pwd)/../../../lib/Plak-2_images/kaufhaus-location/location-mirrored-columns.jpeg | $(pwd)/../../../lib/Plak-2_images/kaufhaus-location/location-elevators.jpeg | $(pwd)/../../../lib/Plak-2_images/kaufhaus-location/location-white-wall.jpeg}"
unset FRESHWEB_SCENE_CONTEXT_IMAGE_URLS
unset FRESHWEB_SCENE_CONTEXT_IMAGE_FOLDER_URL
unset FRESHWEB_SCENE_CONTEXT_IMAGE_API_URL

# Ordered story anchors. Each cue must change the visible action or room pressure.
export FRESHWEB_WORDS="${FRESHWEB_WORDS:-1983,de | Kaufhaus,de | Kunstausstellung,de}"
# Scene count and lengths come from Taktmuster unless explicitly supplied by
# the caller. Scene count is always the current metric accent plus two scenes.
export FRESHWEB_USE_TAKTMUSTER_LENGTHS=${FRESHWEB_USE_TAKTMUSTER_LENGTHS:-1}
unset FRESHWEB_SCENE_COUNT_INITIAL_PATTERN
export FRESHWEB_SCENE_COUNT_TAKT_COUNT=${FRESHWEB_SCENE_COUNT_TAKT_COUNT:-2}
export FRESHWEB_SCENE_COUNT_TAKT_ZAEHLER=${FRESHWEB_SCENE_COUNT_TAKT_ZAEHLER:-4}
export FRESHWEB_SCENE_COUNT_TAKT_NENNER=${FRESHWEB_SCENE_COUNT_TAKT_NENNER:-4}
export FRESHWEB_SCENE_COUNT_TAKT_TYPE=${FRESHWEB_SCENE_COUNT_TAKT_TYPE:-balanced}
export FRESHWEB_SCENE_COUNT_BIAS=${FRESHWEB_SCENE_COUNT_BIAS:-2}
export FRESHWEB_SCENE_LENGTH_TAKT=${FRESHWEB_SCENE_LENGTH_TAKT:-3}
export FRESHWEB_SCENE_LENGTH_TAKT_TYPE=${FRESHWEB_SCENE_LENGTH_TAKT_TYPE:-balanced}
export FRESHWEB_SCENE_LENGTH_MULTIPLIER=${FRESHWEB_SCENE_LENGTH_MULTIPLIER:-0.4}
export FRESHWEB_SCENE_LENGTH_BIAS=${FRESHWEB_SCENE_LENGTH_BIAS:-1.6}
export FRESHWEB_MIN_SCENE_DURATION_SECONDS=${FRESHWEB_MIN_SCENE_DURATION_SECONDS:-2}
export FRESHWEB_SCENE_PLAN_TEMPERATURE=${FRESHWEB_SCENE_PLAN_TEMPERATURE:-0.35}
export FRESHWEB_SCENE_PLAN_TOP_P=${FRESHWEB_SCENE_PLAN_TOP_P:-0.9}
export FRESHWEB_SINGLE_VIDEO_PROMPT_FLAVOR=${FRESHWEB_SINGLE_VIDEO_PROMPT_FLAVOR:-wanCinematicSurreal}

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
  FRESHWEB_SCENE_VISUAL_DIRECTION="Build a compact BRD television trailer from 1989 inside the photographed old Kaufhaus in Germany. Use the requested scene count and give every scene a distinct dramatic function. Keep the isolated green monster as the primary protagonist and preserve its face, glowing eyes, plant-like anatomy, hanging lamps, and dark green industrial identity. Every scene must preserve the supplied Kaufhaus photograph as its visible architecture and spatial composition; never reproduce a poster, infographic, exhibition panel, border, or page layout. Compose every scene as a semantic baton collision: carry the previous fresh term forward as semantic inheritance, collide it with the current stream's fresh getNext term, and make that conflict visibly infect bodies, objects, light, behavior, or architecture without explanation. $FRESHWEB_PEOPLE_DIRECTION Scenes must be causally linked, visually concrete, strange but readable. Every image and motion prompt must specify subject, surreal event, mood, lighting, color, texture, composition, lens or framing, physical motion, and one motivated virtual camera move. No invented modern objects, subtitles, readable lettering, labels, callout lines, or typography."
fi
export FRESHWEB_SCENE_VISUAL_DIRECTION

if [ -z "${FRESHWEB_CAMERA_SCENE_PLAN_SYSTEM_PROMPT:-}" ]; then
  FRESHWEB_CAMERA_SCENE_PLAN_SYSTEM_PROMPT="Create the requested number of short scene plans for a Green Monster trailer grounded in photographed Kaufhaus interiors. The protagonist reference contains only one isolated green plant-like monster; use it only for creature identity, never as a composition or background. The exhibition dossier names artists including Alex Tennigkeit, Nadine Deja, Matthias Hesselbacher, Ben Cottrell, Mariola Groener, Tania Elstermeyer, Dome Wood, Matthias Dornfeld, Sebastian Hammwöhner, Franziska Hufnagel, Nouchka Wolf, Stefan Kaminski, Kerstin Podbiel, Tuli Mekondjo, John Davies, Joe Neave, Catherine Lorent, Dominik Eggermann, Alex Weiss, Gabriel Vormstein, Kurt von Bley, and Charlotte Hiltmann. Use those names only as conceptual traces of a collective creature; do not depict named artists as identifiable portraits or invent biographies. Build a coherent 1989 BRD television trailer in the supplied old Kaufhaus photographs. $FRESHWEB_PEOPLE_DIRECTION Each source cue labels a carried Anchor and a fresh getNext Collision. Keep these roles distinct: the Collision becomes the next scene's Anchor. Do not reconcile, explain, or summarize the contradiction; turn it into a precise surreal physical event. Choose startFrameStrategy from locationReanchor, driftCorrectedLastFrame, or rawLastFrame according to the visible transition and explain it briefly in startFrameReason. Every stillPrompt must be a complete FLUX image prompt containing subject, frozen action, semantic collision, photographed location, era, mood, lighting, palette, texture, composition, lens and framing. Every singleImagePrompt must be a complete WAN image-to-video prompt containing starting state, temporal transformation, subject motion, environmental motion, atmosphere, changing light, composition continuity, and one motivated virtual camera move. Preserve monster identity and photographed Kaufhaus continuity; no live camera, poster layout, panels, portraits, callout lines, readable text, or modern logos. Return required JSON scene plan only."
fi
export FRESHWEB_CAMERA_SCENE_PLAN_SYSTEM_PROMPT

if [ -z "${FRESHWEB_VISION_PROMPT:-}" ]; then
  FRESHWEB_VISION_PROMPT="Describe the visible Green Monster Ware Haus poster as a location and protagonist reference for a multi-scene video. Identify the central green plant-like monster, glowing eyes, face, body silhouette, hanging lamps, warehouse architecture, industrial textures, colors, and fixed elements. Do not treat poster lettering as a scene object. Return concise labeled lines for Subject, Setting, Framing, Lighting, Location, Actors, Description, and continuity requirements."
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

exec sh "$(pwd)/MIX-again-freshweb.middle-cost-4-3.sh" "$@"
