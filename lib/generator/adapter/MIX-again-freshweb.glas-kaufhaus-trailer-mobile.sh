#!/bin/zsh
set -euo pipefail

cd "$(dirname "$0")"

# Mobile trailer iteration.
# Vertical framing, small review output, one full trailer run for checking.
export FRESHWEB_FOLDER=${FRESHWEB_FOLDER:-glas-kaufhaus-shorty-book-trailer-mobile-001}
export FRESHWEB_POLLING_TIME_MS=${FRESHWEB_POLLING_TIME_MS:-0}
export FRESHWEB_MAX_ITERATIONS=${FRESHWEB_MAX_ITERATIONS:-1}

# Keep trailer behavior, but shape canvas for mobile.
export FRESHWEB_VIDEO_ASPECT_RATIO=${FRESHWEB_VIDEO_ASPECT_RATIO:-9:16}
export FRESHWEB_IMAGE_WIDTH=${FRESHWEB_IMAGE_WIDTH:-576}
export FRESHWEB_IMAGE_HEIGHT=${FRESHWEB_IMAGE_HEIGHT:-1024}
export FRESHWEB_OPENING_START_WIDTH=${FRESHWEB_OPENING_START_WIDTH:-576}
export FRESHWEB_OPENING_START_HEIGHT=${FRESHWEB_OPENING_START_HEIGHT:-1024}
export FRESHWEB_SINGLE_VIDEO_WIDTH=${FRESHWEB_SINGLE_VIDEO_WIDTH:-576}
export FRESHWEB_SINGLE_VIDEO_HEIGHT=${FRESHWEB_SINGLE_VIDEO_HEIGHT:-1024}
export FRESHWEB_VIDEO_WIDTH=${FRESHWEB_VIDEO_WIDTH:-576}
export FRESHWEB_VIDEO_HEIGHT=${FRESHWEB_VIDEO_HEIGHT:-1024}

# Small local preview for check.
export FRESHWEB_PREVIEW_WIDTH=${FRESHWEB_PREVIEW_WIDTH:-320}
export FRESHWEB_PREVIEW_HEIGHT=${FRESHWEB_PREVIEW_HEIGHT:-568}
export FRESHWEB_PREVIEW_CRF=${FRESHWEB_PREVIEW_CRF:-35}

# Mobile composition bias.
export FRESHWEB_OPENING_PROMPT=${FRESHWEB_OPENING_PROMPT:-Open in a vertical mobile trailer frame inside the supplied Kaufhaus. Keep the Green Monster and any scene subject centered, tall, readable, and framed for phone viewing.}
export FRESHWEB_SCENE_VISUAL_DIRECTION=${FRESHWEB_SCENE_VISUAL_DIRECTION:-Vertical mobile trailer framing. Keep the main subject centered or slightly low in frame, with strong top-to-bottom composition, readable silhouette, and clear motion that works on a phone screen. Preserve the documentary Kaufhaus texture, fluorescent light, reflections, and uncanny realism.}
export FRESHWEB_CAMERA_SCENE_PLAN_SYSTEM_PROMPT=${FRESHWEB_CAMERA_SCENE_PLAN_SYSTEM_PROMPT:-Create a coherent sequence of short cinematic monster-trailer scenes inside the supplied Kaufhaus. Each scene should work in a vertical mobile frame: keep the protagonist or key object readable in a tall composition, preserve continuity, and avoid wide empty side space. Use the same semantic collision logic and photographic realism as the main trailer. Return required JSON only.}

exec sh "$(pwd)/MIX-again-freshweb.glas-kaufhaus-trailer.sh" "$@"
