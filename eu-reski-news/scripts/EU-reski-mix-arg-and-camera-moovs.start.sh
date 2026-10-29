#!/bin/sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
WORKTREE_ROOT="$(git -C "$SCRIPT_DIR/../.." rev-parse --show-toplevel)"
COMMON_GIT_DIR="$(git -C "$WORKTREE_ROOT" rev-parse --path-format=absolute --git-common-dir)"
MAIN_REPO_ROOT="$(dirname "$COMMON_GIT_DIR")"

NEWS_PROFILE="${NEWS_PROFILE:-EU-RESKI exhibition mix}"

ENV_FILE="${NEWS_ENV_FILE:-$MAIN_REPO_ROOT/.env}"
if [ ! -f "$ENV_FILE" ] && [ -f "$WORKTREE_ROOT/.env" ]; then ENV_FILE="$WORKTREE_ROOT/.env"; fi
if [ ! -f "$ENV_FILE" ]; then
  echo "Missing environment file: $ENV_FILE" >&2
  echo 'Set NEWS_ENV_FILE or put .env in main repository.' >&2
  exit 2
fi

export NEWS_PROFILE

printf '[%s] refresh and generation defaults: default-exhibition-settings.json\n' "$NEWS_PROFILE"
printf '[%s] versioned defaults: %s/default-exhibition-settings.json\n' "$NEWS_PROFILE" "$SCRIPT_DIR/.."

exec node --env-file="$ENV_FILE" "$SCRIPT_DIR/exhibition-runner.mjs" "$@"
