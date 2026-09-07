#!/bin/zsh
set -euo pipefail

cd "$(dirname "$0")"

# CANK trailer launcher.
# One trailer iteration per cycle, then wait ~14 hours before the next one.
export FRESHWEB_FOLDER=${FRESHWEB_FOLDER:-glas-kaufhaus-cank-trailer-live}
export FRESHWEB_POLLING_TIME_MS=${FRESHWEB_POLLING_TIME_MS:-50400000}
export FRESHWEB_MAX_ITERATIONS=${FRESHWEB_MAX_ITERATIONS:--1}
export FRESHWEB_WORDS="${FRESHWEB_WORDS:-kaufhaus,en | fleisch,de | LSD,en | people,en | terror,en | Konsum,de}"

exec sh "$(pwd)/MIX-again-freshweb.glas-kaufhaus-trailer.sh" "$@"
