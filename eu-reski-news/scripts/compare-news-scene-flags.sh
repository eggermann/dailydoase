#!/bin/sh
set -eu
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
WORKTREE_ROOT="$(git -C "$SCRIPT_DIR/../.." rev-parse --show-toplevel)"
ENV_FILE="${NEWS_ENV_FILE:-$WORKTREE_ROOT/.env}"
if [ ! -f "$ENV_FILE" ]; then
  COMMON_GIT_DIR="$(git -C "$WORKTREE_ROOT" rev-parse --path-format=absolute --git-common-dir)"
  ENV_FILE="$(dirname "$COMMON_GIT_DIR")/.env"
fi
exec node --env-file="$ENV_FILE" "$SCRIPT_DIR/compare-news-scene-flags.mjs" "$@"
