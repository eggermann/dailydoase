#!/bin/sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
WORKTREE_ROOT="$(git -C "$SCRIPT_DIR/../.." rev-parse --show-toplevel)"

# EU-RESKI · AUSSTELLUNG — news scene image starter
# Edit this block for the exhibition run, or override values in the environment.
NEWS_PROFILE="${NEWS_PROFILE:-EU-RESKI Ausstellung}"
NEWS_OUTPUT_DIR="${NEWS_OUTPUT_DIR:-$WORKTREE_ROOT/eu-reski-news/GENERATIONS/news}"
NEWS_SCENES="${NEWS_SCENES:-3}" # Used only in fixed scene-count mode.
NEWS_SCENE_COUNT_MODE="${NEWS_SCENE_COUNT_MODE:-taktmuster}"
NEWS_SCENE_COUNT_TAKT="${NEWS_SCENE_COUNT_TAKT:-2}"
NEWS_SCENE_COUNT_NUMERATOR="${NEWS_SCENE_COUNT_NUMERATOR:-3}"
NEWS_SCENE_COUNT_DENOMINATOR="${NEWS_SCENE_COUNT_DENOMINATOR:-4}"
NEWS_SCENE_COUNT_TYPE="${NEWS_SCENE_COUNT_TYPE:-balanced}"
NEWS_SCENE_COUNT_BIAS="${NEWS_SCENE_COUNT_BIAS:-2}"
NEWS_MIN_SCENES="${NEWS_MIN_SCENES:-1}"
NEWS_MAX_SCENES="${NEWS_MAX_SCENES:-12}"
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
NEWS_VIDEO_AUDIO_DIRECTION="${NEWS_VIDEO_AUDIO_DIRECTION:-off}"
NEWS_VIDEO_MAX_ZOOM="${NEWS_VIDEO_MAX_ZOOM:-0.08}"

case "$NEWS_MAX_ITERATIONS" in
  0|-1) ;;
  ''|*[!0-9]*) echo 'NEWS_MAX_ITERATIONS must be a positive integer, 0 or -1.' >&2; exit 2 ;;
  *) ;;
esac
case "$NEWS_SCENES" in
  1|2|3|4|5|6|7|8|9|10|11|12) ;;
  *) echo 'NEWS_SCENES must be between 1 and 12.' >&2; exit 2 ;;
esac
case "$NEWS_ARTICLE_ORDER" in
  linear|random|global) ;;
  *) echo 'NEWS_ARTICLE_ORDER must be linear, random or global.' >&2; exit 2 ;;
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
if ! has_option --scene-count-mode "$@"; then set -- --scene-count-mode="$NEWS_SCENE_COUNT_MODE" "$@"; fi
if ! has_option --scene-count-takt "$@"; then set -- --scene-count-takt="$NEWS_SCENE_COUNT_TAKT" "$@"; fi
if ! has_option --scene-count-numerator "$@"; then set -- --scene-count-numerator="$NEWS_SCENE_COUNT_NUMERATOR" "$@"; fi
if ! has_option --scene-count-denominator "$@"; then set -- --scene-count-denominator="$NEWS_SCENE_COUNT_DENOMINATOR" "$@"; fi
if ! has_option --scene-count-type "$@"; then set -- --scene-count-type="$NEWS_SCENE_COUNT_TYPE" "$@"; fi
if ! has_option --scene-count-bias "$@"; then set -- --scene-count-bias="$NEWS_SCENE_COUNT_BIAS" "$@"; fi
if ! has_option --min-scenes "$@"; then set -- --min-scenes="$NEWS_MIN_SCENES" "$@"; fi
if ! has_option --max-scenes "$@"; then set -- --max-scenes="$NEWS_MAX_SCENES" "$@"; fi
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

export NEWS_VIDEO_AUDIO_DIRECTION NEWS_VIDEO_MAX_ZOOM

printf '[%s] output: %s\n' "$NEWS_PROFILE" "$NEWS_OUTPUT_DIR"
printf '[%s] scene-count mode: %s · fixed-count option: %s · max runs default: %s · pause default: %s ms; CLI can override\n' "$NEWS_PROFILE" "$NEWS_SCENE_COUNT_MODE" "$NEWS_SCENES" "$NEWS_MAX_ITERATIONS" "$NEWS_POLLING_TIME_MS"
printf '[%s] Taktmuster: %s/%s · multiplier %s · duration %s–%s s\n' "$NEWS_PROFILE" "$NEWS_SCENE_LENGTH_TYPE" "$NEWS_SCENE_LENGTH_TAKT" "$NEWS_SCENE_LENGTH_MULTIPLIER" "$NEWS_MIN_SCENE_DURATION_SECONDS" "$NEWS_MAX_SCENE_DURATION_SECONDS"
printf '[%s] Video: audio direction %s · max zoom fraction %s (0.08 = 8%%; override with --video-audio-direction / --video-max-zoom)\n' "$NEWS_PROFILE" "$NEWS_VIDEO_AUDIO_DIRECTION" "$NEWS_VIDEO_MAX_ZOOM"

ENV_FILE="${NEWS_ENV_FILE:-$WORKTREE_ROOT/.env}"
if [ ! -f "$ENV_FILE" ]; then
  COMMON_GIT_DIR="$(git -C "$WORKTREE_ROOT" rev-parse --path-format=absolute --git-common-dir)"
  ENV_FILE="$(dirname "$COMMON_GIT_DIR")/.env"
fi
exec node --env-file="$ENV_FILE" \
  "$SCRIPT_DIR/run-news-scene-image-iteration.mjs" "$@"
