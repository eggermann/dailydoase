#!/bin/sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
WORKTREE_ROOT="$(git -C "$SCRIPT_DIR/../.." rev-parse --show-toplevel)"

# EU-RESKI · AUSSTELLUNG — news scene image starter
# Edit this block for the exhibition run, or override values in the environment.
NEWS_PROFILE="${NEWS_PROFILE:-EU-RESKI Ausstellung}"
NEWS_OUTPUT_DIR="${NEWS_OUTPUT_DIR:-$WORKTREE_ROOT/eu-reski-news/GENERATIONS/news}"
NEWS_SCENES="${NEWS_SCENES:-3}"
NEWS_MAX_ITERATIONS="${NEWS_MAX_ITERATIONS:-1}" # 0 or -1 means endless; 1 means one report.
NEWS_POLLING_TIME_MS="${NEWS_POLLING_TIME_MS:-5000}"
NEWS_SCENE_LENGTH_TAKT="${NEWS_SCENE_LENGTH_TAKT:-4}"
NEWS_SCENE_LENGTH_TYPE="${NEWS_SCENE_LENGTH_TYPE:-balanced}"
NEWS_SCENE_LENGTH_MULTIPLIER="${NEWS_SCENE_LENGTH_MULTIPLIER:-1.15}" # Selfomat-like scaling; offset preserves a little rhythm above the 5 s floor.
NEWS_SCENE_LENGTH_BIAS="${NEWS_SCENE_LENGTH_BIAS:-3.85}"
NEWS_MIN_SCENE_DURATION_SECONDS="${NEWS_MIN_SCENE_DURATION_SECONDS:-5}"
NEWS_MAX_SCENE_DURATION_SECONDS="${NEWS_MAX_SCENE_DURATION_SECONDS:-8}"
NEWS_ARTICLE_ORDER="${NEWS_ARTICLE_ORDER:-linear}" # Start at the first article per run, then advance.
NEWS_ARTICLE_ID="${NEWS_ARTICLE_ID:-}"       # Overrides article order when set.
NEWS_WORDS="${NEWS_WORDS:-}"                 # Empty uses the default EU de/en/ru streams.
NEWS_WORDS_FILE="${NEWS_WORDS_FILE:-}"
NEWS_STREAM_FILE="${NEWS_STREAM_FILE:-}"
NEWS_PROMPT_ONLY="${NEWS_PROMPT_ONLY:-0}"

case "$NEWS_MAX_ITERATIONS" in
  0|-1) ;;
  ''|*[!0-9]*) echo 'NEWS_MAX_ITERATIONS must be a positive integer, 0 or -1.' >&2; exit 2 ;;
  *) ;;
esac
case "$NEWS_SCENES" in
  1|2|3|4|5|6|7) ;;
  *) echo 'NEWS_SCENES must be between 1 and 7.' >&2; exit 2 ;;
esac
case "$NEWS_ARTICLE_ORDER" in
  linear|random) ;;
  *) echo 'NEWS_ARTICLE_ORDER must be linear or random.' >&2; exit 2 ;;
esac
case "$NEWS_POLLING_TIME_MS" in
  ''|*[!0-9]*) echo 'NEWS_POLLING_TIME_MS must be a non-negative integer.' >&2; exit 2 ;;
esac

has_option() {
  option="$1"
  shift
  for argument do
    case "$argument" in
      "$option"|"$option"=*) return 0 ;;
    esac
  done
  return 1
}

# Preserve the usual CLI flags; explicit command-line options override this block.
if ! has_option --output-dir "$@"; then set -- --output-dir="$NEWS_OUTPUT_DIR" "$@"; fi
if ! has_option --scenes "$@"; then set -- --scenes="$NEWS_SCENES" "$@"; fi
if ! has_option --article-order "$@"; then set -- --article-order="$NEWS_ARTICLE_ORDER" "$@"; fi
if ! has_option --iterations "$@"; then set -- --iterations="$NEWS_MAX_ITERATIONS" "$@"; fi
if ! has_option --pause-ms "$@"; then set -- --pause-ms="$NEWS_POLLING_TIME_MS" "$@"; fi
if ! has_option --scene-length-takt "$@"; then set -- --scene-length-takt="$NEWS_SCENE_LENGTH_TAKT" "$@"; fi
if ! has_option --scene-length-type "$@"; then set -- --scene-length-type="$NEWS_SCENE_LENGTH_TYPE" "$@"; fi
if ! has_option --scene-length-multiplier "$@"; then set -- --scene-length-multiplier="$NEWS_SCENE_LENGTH_MULTIPLIER" "$@"; fi
if ! has_option --scene-length-bias "$@"; then set -- --scene-length-bias="$NEWS_SCENE_LENGTH_BIAS" "$@"; fi
if ! has_option --min-scene-seconds "$@"; then set -- --min-scene-seconds="$NEWS_MIN_SCENE_DURATION_SECONDS" "$@"; fi
if ! has_option --max-scene-seconds "$@"; then set -- --max-scene-seconds="$NEWS_MAX_SCENE_DURATION_SECONDS" "$@"; fi
if [ -n "$NEWS_ARTICLE_ID" ] && ! has_option --article-id "$@"; then set -- --article-id="$NEWS_ARTICLE_ID" "$@"; fi
if [ -n "$NEWS_WORDS" ] && ! has_option --words "$@"; then set -- --words="$NEWS_WORDS" "$@"; fi
if [ -n "$NEWS_WORDS_FILE" ] && ! has_option --words-file "$@"; then set -- --words-file="$NEWS_WORDS_FILE" "$@"; fi
if [ -n "$NEWS_STREAM_FILE" ] && ! has_option --stream-file "$@"; then set -- --stream-file="$NEWS_STREAM_FILE" "$@"; fi
if [ "$NEWS_PROMPT_ONLY" = 1 ] && ! has_option --prompt-only "$@"; then set -- --prompt-only "$@"; fi

printf '[%s] output: %s\n' "$NEWS_PROFILE" "$NEWS_OUTPUT_DIR"
printf '[%s] scenes/run: %s · max runs: %s · pause: %s ms\n' "$NEWS_PROFILE" "$NEWS_SCENES" "$NEWS_MAX_ITERATIONS" "$NEWS_POLLING_TIME_MS"
printf '[%s] Taktmuster: %s/%s · multiplier %s · duration %s–%s s\n' "$NEWS_PROFILE" "$NEWS_SCENE_LENGTH_TYPE" "$NEWS_SCENE_LENGTH_TAKT" "$NEWS_SCENE_LENGTH_MULTIPLIER" "$NEWS_MIN_SCENE_DURATION_SECONDS" "$NEWS_MAX_SCENE_DURATION_SECONDS"

exec node --env-file="$WORKTREE_ROOT/.env" \
  "$SCRIPT_DIR/run-news-scene-image-iteration.mjs" "$@"
