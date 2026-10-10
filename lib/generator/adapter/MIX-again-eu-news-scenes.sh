#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
WORKTREE_ROOT="$(git -C "$SCRIPT_DIR/../../.." rev-parse --show-toplevel)"
# Keep runs inside this checkout so their paths stay relative to its project root.
NEWS_OUTPUT_DIR="${NEWS_OUTPUT_DIR:-$WORKTREE_ROOT/news-capitals/generations}"
echo "EU news generations: $NEWS_OUTPUT_DIR"

cd "$WORKTREE_ROOT"
exec node --env-file="$WORKTREE_ROOT/.env" \
  "$WORKTREE_ROOT/scripts/run-news-scene-image-iteration.mjs" \
  --output-dir="$NEWS_OUTPUT_DIR" "$@"
