#!/bin/zsh
set -euo pipefail

cd "$(dirname "$0")"

# Generate only the planned scene stills. WAN and Mirelo are never initialized.
export FRESHWEB_IMAGE_ONLY_TEST_ENABLED=${FRESHWEB_IMAGE_ONLY_TEST_ENABLED:-1}
# This validation mode isolates the monster; no humans or poster portraits.
export FRESHWEB_ALLOW_PEOPLE=${FRESHWEB_ALLOW_PEOPLE:-0}
export FRESHWEB_SCENE_CONTEXT_LOCK_ACTOR_COUNT=${FRESHWEB_SCENE_CONTEXT_LOCK_ACTOR_COUNT:-1}
# Monster-visible scenes composite the canonical protagonist into the selected
# Kaufhaus location. Monster-free scenes omit the protagonist entirely.
export FRESHWEB_SCENE_CONTEXT_IMAGES_INCLUDE_PROTAGONIST=${FRESHWEB_SCENE_CONTEXT_IMAGES_INCLUDE_PROTAGONIST:-0}
# One strong pass uses location, identity, and Semantic Stream together.
# Override with 1 only to compare the more expensive reconstruction experiment.
export FRESHWEB_SCENE_CONTEXT_PROTAGONIST_REFERENCE_MODE=${FRESHWEB_SCENE_CONTEXT_PROTAGONIST_REFERENCE_MODE:-image}
export FRESHWEB_SCENE_CONTEXT_SEMANTIC_RECONSTRUCTION_PASS=${FRESHWEB_SCENE_CONTEXT_SEMANTIC_RECONSTRUCTION_PASS:-0}
export FRESHWEB_END_CARD_ENABLED=${FRESHWEB_END_CARD_ENABLED:-1}
export FRESHWEB_END_CARD_DURATION_SECONDS=${FRESHWEB_END_CARD_DURATION_SECONDS:-4}
export FRESHWEB_END_CARD_DOSSIER_PATH=${FRESHWEB_END_CARD_DOSSIER_PATH:-$(pwd)/../../../lib/Plak-2_images/formen_der_abweichunf_datas.json}
export FRESHWEB_SCENE_CONTEXT_IMAGE_PATHS="${FRESHWEB_SCENE_CONTEXT_IMAGE_PATHS:-$(pwd)/../../../lib/Plak-2_images/kaufhaus-location/location-central-hall.jpeg | $(pwd)/../../../lib/Plak-2_images/kaufhaus-location/location-mirrored-columns.jpeg | $(pwd)/../../../lib/Plak-2_images/kaufhaus-location/location-elevators.jpeg | $(pwd)/../../../lib/Plak-2_images/kaufhaus-location/location-white-wall.jpeg}"
# Two rounds are the safe default. Use -1 to continue forever in the same process.
export FRESHWEB_IMAGE_ONLY_TEST_RUN_COUNT=${FRESHWEB_IMAGE_ONLY_TEST_RUN_COUNT:-2}
# A positive interval keeps the same Semantic Stream and generator instance alive.
export FRESHWEB_POLLING_TIME_MS=${FRESHWEB_POLLING_TIME_MS:-1000}
# All rounds belong to one collection folder so their semantic progression stays inspectable.
export FRESHWEB_FOLDER=${FRESHWEB_FOLDER:-glas-kaufhaus-shorty-book-image-only-test}
# Keep output root identical to trailer root and print it as a clean absolute path.
if [ -z "${GENERATIONS_PATH:-}" ]; then
  GENERATIONS_PATH="$(cd "$(pwd)/../../.." && pwd)/GENRATIONS-KAUFHAUF"
fi
export GENERATIONS_PATH

# Accept only a positive finite count or the explicit infinite sentinel -1.
case "$FRESHWEB_IMAGE_ONLY_TEST_RUN_COUNT" in
  -1)
    ;;
  ''|0|*[!0-9]*)
    echo "Invalid FRESHWEB_IMAGE_ONLY_TEST_RUN_COUNT: $FRESHWEB_IMAGE_ONLY_TEST_RUN_COUNT" >&2
    echo "Expected a positive integer or -1 for an infinite run." >&2
    exit 1
    ;;
esac

echo "Image-only test starts in one persistent Semantic Stream."
echo "Rounds: $FRESHWEB_IMAGE_ONLY_TEST_RUN_COUNT"
echo "Generation root: $GENERATIONS_PATH"
echo "Collection name: $FRESHWEB_FOLDER"
echo "Scene images: <generation-folder>/parts/image-only-scenes"

# Execute file directly so its zsh shebang remains authoritative.
exec "$(pwd)/MIX-again-freshweb.glas-kaufhaus-trailer.sh" "$@"
