#!/bin/zsh
set -euo pipefail

cd "$(dirname "$0")"

exec node "$(pwd)/resume-two-video-preview-from-snapshot.mjs" "$@"
