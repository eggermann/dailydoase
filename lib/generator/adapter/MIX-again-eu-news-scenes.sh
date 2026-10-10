#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
WORKTREE_ROOT="$(git -C "$SCRIPT_DIR/../../.." rev-parse --show-toplevel)"
GIT_COMMON_DIR="$(git -C "$WORKTREE_ROOT" rev-parse --path-format=absolute --git-common-dir)"
PROJECT_ROOT="$(dirname -- "$GIT_COMMON_DIR")"

# Keep generated news runs outside temporary Git worktrees, like trailer runs.
export GENERATIONS_PATH="${GENERATIONS_PATH:-$PROJECT_ROOT/GENRATIONS-NEWS}"
NEWS_STORY_FOLDER="${NEWS_STORY_FOLDER:-eu-news-scenes}"
NEWS_OUTPUT_DIR="${NEWS_OUTPUT_DIR:-$GENERATIONS_PATH/$NEWS_STORY_FOLDER}"
echo "EU news generations: $NEWS_OUTPUT_DIR"

cd "$WORKTREE_ROOT"
exec node --env-file="$WORKTREE_ROOT/.env" \
  "$WORKTREE_ROOT/scripts/run-news-scene-image-iteration.mjs" \
  --output-dir="$NEWS_OUTPUT_DIR" "$@"
