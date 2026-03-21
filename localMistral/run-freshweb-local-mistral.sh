#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "${SCRIPT_DIR}/.." && pwd)

. "${SCRIPT_DIR}/env.local-mistral.sh"

DEFAULT_PRESET="lib/generator/adapter/MIX-again-freshweb.prompt-fast-wan-trippy-4-3.sh"
PRESET_PATH="${LOCAL_MISTRAL_PRESET:-$DEFAULT_PRESET}"

cd "${PROJECT_ROOT}"
exec sh "${PROJECT_ROOT}/${PRESET_PATH}" "$@"
