#!/bin/sh
set -eu
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
WORKTREE_ROOT="$(git -C "$SCRIPT_DIR/../.." rev-parse --show-toplevel)"
COMMON_GIT_DIR="$(git -C "$WORKTREE_ROOT" rev-parse --path-format=absolute --git-common-dir)"
ENV_FILE="${NEWS_ENV_FILE:-$(dirname "$COMMON_GIT_DIR")/.env}"
if [ ! -f "$ENV_FILE" ] && [ -f "$WORKTREE_ROOT/.env" ]; then ENV_FILE="$WORKTREE_ROOT/.env"; fi
if [ ! -f "$ENV_FILE" ]; then echo "Missing environment file: $ENV_FILE" >&2; exit 2; fi
exec node --env-file="$ENV_FILE" "$SCRIPT_DIR/summarize-scene-code.mjs" "$@"
