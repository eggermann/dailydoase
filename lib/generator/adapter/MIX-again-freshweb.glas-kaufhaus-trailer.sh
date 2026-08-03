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
export FRESHWEB_CAMERA_SOURCE_LABEL=${FRESHWEB_CAMERA_SOURCE_LABEL:-Green Monster Ware Haus poster}
export GENERATIONS_PATH=${GENERATIONS_PATH:-$(pwd)/../../../GENRATIONS-KAUFHAUF}
export GENERATOR_DEBUG=${GENERATOR_DEBUG:-1}
export SCENE_GENERATOR_DEBUG=${SCENE_GENERATOR_DEBUG:-1}
export VISION_DEBUG=${VISION_DEBUG:-1}
export WAN_DEBUG=${WAN_DEBUG:-1}
export FAL_DEBUG=${FAL_DEBUG:-1}
export RUNWARE_DEBUG=${RUNWARE_DEBUG:-1}
export FLUX_DEBUG=${FLUX_DEBUG:-1}
export MIRELO_DEBUG=${MIRELO_DEBUG:-1}

# Local poster input. This is a saved image, never a webcam capture.
export FRESHWEB_CAMERA_IMAGE_PATH=${FRESHWEB_CAMERA_IMAGE_PATH:-$(pwd)/../../../lib/Plak-2_images/6d94760a76c3487b7bce9785970ff6667b85b1f7bda92c353a50208fa8a1d977.jpg}
unset FRESHWEB_CAMERA_IMAGE_URL
unset FRESHWEB_CAMERA_IMAGE_URLS
unset FRESHWEB_OPENING_IMAGE_URL
unset FRESHWEB_OPENING_IMAGE_URLS

# Kaufhaus photos define the fixed scene geometry.
export FRESHWEB_SCENE_CONTEXT_IMAGE_MAPPING_ENABLED=${FRESHWEB_SCENE_CONTEXT_IMAGE_MAPPING_ENABLED:-1}
export FRESHWEB_SCENE_CONTEXT_LOCK_ACTOR_COUNT=${FRESHWEB_SCENE_CONTEXT_LOCK_ACTOR_COUNT:-0}
export FRESHWEB_SCENE_CONTEXT_IMAGE_PATHS="${FRESHWEB_SCENE_CONTEXT_IMAGE_PATHS:-$(pwd)/../../../lib/Plak-2_images/kaufhaus-location/location-central-hall.jpeg | $(pwd)/../../../lib/Plak-2_images/kaufhaus-location/location-mirrored-columns.jpeg | $(pwd)/../../../lib/Plak-2_images/kaufhaus-location/location-elevators.jpeg | $(pwd)/../../../lib/Plak-2_images/kaufhaus-location/location-white-wall.jpeg}"
unset FRESHWEB_SCENE_CONTEXT_IMAGE_URLS
unset FRESHWEB_SCENE_CONTEXT_IMAGE_FOLDER_URL
unset FRESHWEB_SCENE_CONTEXT_IMAGE_API_URL

# Ordered story anchors. Each cue must change the visible action or room pressure.
export FRESHWEB_WORDS="${FRESHWEB_WORDS:-1983,de | Kaufhaus,de | Green Monster,en | Ware Haus,de | Fernsehen,de | Kunstausstellung,de}"
# Scene count and lengths come from Taktmuster unless explicitly supplied by
# the caller. The initial count pattern keeps one-shot trailer runs varied but
# gives the semantic collision arc enough room to develop.
export FRESHWEB_USE_TAKTMUSTER_LENGTHS=${FRESHWEB_USE_TAKTMUSTER_LENGTHS:-1}
export FRESHWEB_SCENE_COUNT_INITIAL_PATTERN=${FRESHWEB_SCENE_COUNT_INITIAL_PATTERN:-4,5,4,6}
export FRESHWEB_SCENE_LENGTH_TAKT=${FRESHWEB_SCENE_LENGTH_TAKT:-3}
export FRESHWEB_SCENE_LENGTH_TAKT_TYPE=${FRESHWEB_SCENE_LENGTH_TAKT_TYPE:-balanced}
export FRESHWEB_SCENE_LENGTH_MULTIPLIER=${FRESHWEB_SCENE_LENGTH_MULTIPLIER:-0.4}
export FRESHWEB_SCENE_LENGTH_BIAS=${FRESHWEB_SCENE_LENGTH_BIAS:-1.6}
export FRESHWEB_MIN_SCENE_DURATION_SECONDS=${FRESHWEB_MIN_SCENE_DURATION_SECONDS:-2}
export FRESHWEB_SCENE_PLAN_TEMPERATURE=${FRESHWEB_SCENE_PLAN_TEMPERATURE:-0.35}
export FRESHWEB_SCENE_PLAN_TOP_P=${FRESHWEB_SCENE_PLAN_TOP_P:-0.9}
export FRESHWEB_SINGLE_VIDEO_PROMPT_FLAVOR=${FRESHWEB_SINGLE_VIDEO_PROMPT_FLAVOR:-wanCinematicSurreal}

export FRESHWEB_OPENING_PROMPT="${FRESHWEB_OPENING_PROMPT:-Create a cinematic warehouse scene from the Green Monster Ware Haus poster: an old Kaufhaus floor in the BRD, 1989 television trailer atmosphere, practical lamps, dark green industrial space, the same central monster figure present and readable, no readable text, no modern branding.}"
export FRESHWEB_SCENE_VISUAL_DIRECTION="${FRESHWEB_SCENE_VISUAL_DIRECTION:-Build a compact BRD television trailer from 1989 inside the Green Monster Ware Haus, an old Kaufhaus warehouse in Germany. Use the requested scene count and give every scene a distinct dramatic function. Keep the poster central green monster as the primary protagonist and preserve its face, glowing eyes, plant-like anatomy, hanging lamps, and dark green industrial identity. Compose every scene as a semantic collision: one stable anchor and incompatible associations must visibly infect bodies, objects, light, behavior, or architecture without being explained. People may appear when the semantic streams naturally call for them; neither add nor exclude them by default. Scenes must be causally linked, visually concrete, strange but readable. Every image and motion prompt must specify subject, surreal event, mood, lighting, color, texture, composition, lens or framing, physical motion, and one motivated virtual camera move. No invented modern objects, subtitles, or readable lettering.}"
export FRESHWEB_CAMERA_SCENE_PLAN_SYSTEM_PROMPT="${FRESHWEB_CAMERA_SCENE_PLAN_SYSTEM_PROMPT:-Create the requested number of short scene plans for a poster-driven Green Monster Ware Haus trailer. The source image is a green plant-like monster in an old industrial warehouse. The exhibition dossier names artists including Alex Tennigkeit, Nadine Deja, Matthias Hesselbacher, Ben Cottrell, Mariola Groener, Tania Elstermeyer, Dome Wood, Matthias Dornfeld, Sebastian Hammwöhner, Franziska Hufnagel, Nouchka Wolf, Stefan Kaminski, Kerstin Podbiel, Tuli Mekondjo, John Davies, Joe Neave, Catherine Lorent, Dominik Eggermann, Alex Weiss, Gabriel Vormstein, Kurt von Bley, and Charlotte Hiltmann. Use those names only as conceptual traces of a collective creature; do not depict named artists as identifiable portraits or invent biographies. Build a coherent 1989 BRD television trailer in an old Kaufhaus warehouse. People may appear when the semantic streams naturally call for them; neither add nor exclude them by default. Each source cue labels one stable Anchor plus incompatible Collision terms. Keep these roles distinct. Do not reconcile, explain, or summarize the contradiction; turn it into a precise surreal physical event. Every stillPrompt must be a complete FLUX image prompt containing subject, frozen action, semantic collision, location, era, mood, lighting, palette, texture, composition, lens and framing. Every singleImagePrompt must be a complete WAN image-to-video prompt containing starting state, temporal transformation, subject motion, environmental motion, atmosphere, changing light, composition continuity, and one motivated virtual camera move. Preserve monster identity and location continuity; no live camera, no readable text, no modern logos. Return required JSON scene plan only.}"
export FRESHWEB_VISION_PROMPT="${FRESHWEB_VISION_PROMPT:-Describe the visible Green Monster Ware Haus poster as a location and protagonist reference for a multi-scene video. Identify the central green plant-like monster, glowing eyes, face, body silhouette, hanging lamps, warehouse architecture, industrial textures, colors, and fixed elements. Do not treat poster lettering as a scene object. Return concise labeled lines for Subject, Setting, Framing, Lighting, Location, Actors, Description, and continuity requirements.}"

# Runware is the primary and only video provider for this trailer. WAN 2.6 Flash
# receives one start frame and returns a 720p clip without native audio.
export FRESHWEB_SELF_HOSTED_SINGLE=${FRESHWEB_SELF_HOSTED_SINGLE:-0}
export FRESHWEB_SINGLE_VIDEO_MODEL_TYPE=${FRESHWEB_SINGLE_VIDEO_MODEL_TYPE:-runwareImageToVideo}
export FRESHWEB_SINGLE_VIDEO_MODEL=${FRESHWEB_SINGLE_VIDEO_MODEL:-alibaba:wan@2.6-flash}
export FRESHWEB_ENABLE_RUNWARE_FALLBACKS=${FRESHWEB_ENABLE_RUNWARE_FALLBACKS:-0}
export FRESHWEB_ENABLE_PAID_FAL_FALLBACKS=${FRESHWEB_ENABLE_PAID_FAL_FALLBACKS:-0}

# Runware FLUX Kontext generates the opening and scene-context images from the
# photographed Kaufhaus plus the separate monster identity reference.
export FRESHWEB_OPENING_START_ENABLED=${FRESHWEB_OPENING_START_ENABLED:-1}
export FRESHWEB_OPENING_START_MODE=${FRESHWEB_OPENING_START_MODE:-fluxContext}
export FRESHWEB_OPENING_START_INTERVAL=${FRESHWEB_OPENING_START_INTERVAL:-1}
export FRESHWEB_OPENING_START_PROVIDER=${FRESHWEB_OPENING_START_PROVIDER:-runware}
export FRESHWEB_OPENING_START_MODEL=${FRESHWEB_OPENING_START_MODEL:-runware:106@1}
export FRESHWEB_OPENING_START_WIDTH=${FRESHWEB_OPENING_START_WIDTH:-1184}
export FRESHWEB_OPENING_START_HEIGHT=${FRESHWEB_OPENING_START_HEIGHT:-880}
export FRESHWEB_OPENING_START_NEGATIVE_PROMPT="${FRESHWEB_OPENING_START_NEGATIVE_PROMPT:-broken anatomy, blur, low detail, collage, split screen, readable text, modern logo}"
export FRESHWEB_LOCK_PROMPT_CONTINUITY_TO_OPENING_FRAME=${FRESHWEB_LOCK_PROMPT_CONTINUITY_TO_OPENING_FRAME:-1}
export FRESHWEB_RESTART_FROM_PREVIOUS_MOVIE_LAST_FRAME=${FRESHWEB_RESTART_FROM_PREVIOUS_MOVIE_LAST_FRAME:-0}
export FRESHWEB_CHAIN_FROM_PREVIOUS_LOOP_LAST_FRAME=${FRESHWEB_CHAIN_FROM_PREVIOUS_LOOP_LAST_FRAME:-1}
export FRESHWEB_ENABLE_DRIFT_CORRECTION=${FRESHWEB_ENABLE_DRIFT_CORRECTION:-0}
export FRESHWEB_MIRELO_MODE=${FRESHWEB_MIRELO_MODE:-finalOnly}

exec sh "$(pwd)/MIX-again-freshweb.middle-cost-4-3.sh" "$@"
