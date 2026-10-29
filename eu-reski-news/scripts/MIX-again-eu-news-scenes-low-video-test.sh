#!/bin/sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
WORKTREE_ROOT="$(git -C "$SCRIPT_DIR/../.." rev-parse --show-toplevel)"
STAMP="$(date +%Y%m%d-%H%M%S)"

# EU-RESKI · two-iteration low-quality video test.
NEWS_PROFILE="${NEWS_PROFILE:-EU-RESKI low-quality video test}"
NEWS_OUTPUT_DIR="${NEWS_OUTPUT_DIR:-$WORKTREE_ROOT/eu-reski-news/GENERATIONS/news/video-test-$STAMP}"
NEWS_MAX_ITERATIONS="${NEWS_MAX_ITERATIONS:-2}"
NEWS_SCENE_COUNT_MODE="${NEWS_SCENE_COUNT_MODE:-taktmuster}"
NEWS_SCENE_LENGTH_TAKT="${NEWS_SCENE_LENGTH_TAKT:-4}"
NEWS_SCENE_LENGTH_TYPE="${NEWS_SCENE_LENGTH_TYPE:-balanced}"
NEWS_SCENE_LENGTH_MULTIPLIER="${NEWS_SCENE_LENGTH_MULTIPLIER:-1.6}"
NEWS_SCENE_LENGTH_BIAS="${NEWS_SCENE_LENGTH_BIAS:-0.1}"
NEWS_MIN_SCENE_DURATION_SECONDS="${NEWS_MIN_SCENE_DURATION_SECONDS:-2}"
NEWS_MAX_SCENE_DURATION_SECONDS="${NEWS_MAX_SCENE_DURATION_SECONDS:-6}"
NEWS_POLLING_TIME_MS="${NEWS_POLLING_TIME_MS:-0}"
NEWS_VIDEO_MODEL="${NEWS_VIDEO_MODEL:-xai:grok-imagine@video-1.5-lite}"
NEWS_VIDEO_RESOLUTION="${NEWS_VIDEO_RESOLUTION:-480p}"
NEWS_VIDEO_OUTPUT_QUALITY="${NEWS_VIDEO_OUTPUT_QUALITY:-20}"
NEWS_VIDEO_POLL_TIMEOUT_SECONDS="${NEWS_VIDEO_POLL_TIMEOUT_SECONDS:-60}"
NEWS_VIDEO_DIRECTION="${NEWS_VIDEO_DIRECTION:-on}"
NEWS_VIDEO_AUDIO_DIRECTION="${NEWS_VIDEO_AUDIO_DIRECTION:-off}"
NEWS_VIDEO_MAX_ZOOM="${NEWS_VIDEO_MAX_ZOOM:-0.08}"
NEWS_SUPERVISOR_RESTARTS="${NEWS_SUPERVISOR_RESTARTS:-5}"

case "$NEWS_MAX_ITERATIONS" in
  ''|*[!0-9]*) echo 'NEWS_MAX_ITERATIONS must be a positive integer.' >&2; exit 2 ;;
  0) echo 'This test starter requires a finite iteration count.' >&2; exit 2 ;;
esac
case "$NEWS_VIDEO_POLL_TIMEOUT_SECONDS" in
  ''|*[!0-9]*) echo 'NEWS_VIDEO_POLL_TIMEOUT_SECONDS must be an integer from 10 to 600.' >&2; exit 2 ;;
esac
if [ "$NEWS_VIDEO_POLL_TIMEOUT_SECONDS" -lt 10 ] || [ "$NEWS_VIDEO_POLL_TIMEOUT_SECONDS" -gt 600 ]; then
  echo 'NEWS_VIDEO_POLL_TIMEOUT_SECONDS must be an integer from 10 to 600.' >&2
  exit 2
fi
case "$NEWS_SUPERVISOR_RESTARTS" in
  ''|*[!0-9]*) echo 'NEWS_SUPERVISOR_RESTARTS must be an integer from 1 to 20.' >&2; exit 2 ;;
esac
if [ "$NEWS_SUPERVISOR_RESTARTS" -lt 1 ] || [ "$NEWS_SUPERVISOR_RESTARTS" -gt 20 ]; then
  echo 'NEWS_SUPERVISOR_RESTARTS must be an integer from 1 to 20.' >&2
  exit 2
fi

ENV_FILE="${NEWS_ENV_FILE:-$WORKTREE_ROOT/.env}"
if [ ! -f "$ENV_FILE" ]; then
  COMMON_GIT_DIR="$(git -C "$WORKTREE_ROOT" rev-parse --path-format=absolute --git-common-dir)"
  ENV_FILE="$(dirname "$COMMON_GIT_DIR")/.env"
fi
if [ ! -f "$ENV_FILE" ]; then echo "Missing environment file: $ENV_FILE" >&2; exit 2; fi

export NEWS_PROFILE NEWS_OUTPUT_DIR NEWS_MAX_ITERATIONS NEWS_SCENE_COUNT_MODE
export NEWS_SCENE_LENGTH_TAKT NEWS_SCENE_LENGTH_TYPE NEWS_SCENE_LENGTH_MULTIPLIER NEWS_SCENE_LENGTH_BIAS
export NEWS_MIN_SCENE_DURATION_SECONDS NEWS_MAX_SCENE_DURATION_SECONDS NEWS_POLLING_TIME_MS
export NEWS_VIDEO_MODEL NEWS_VIDEO_RESOLUTION NEWS_VIDEO_OUTPUT_QUALITY NEWS_VIDEO_POLL_TIMEOUT_SECONDS NEWS_VIDEO_DIRECTION
export NEWS_VIDEO_AUDIO_DIRECTION NEWS_VIDEO_MAX_ZOOM

printf 'Test run: %s\n' "$NEWS_OUTPUT_DIR"
printf 'Duration Taktmuster: %s/%s · multiplier %s · bias %s · bounds %s–%s s\n' \
  "$NEWS_SCENE_LENGTH_TYPE" "$NEWS_SCENE_LENGTH_TAKT" "$NEWS_SCENE_LENGTH_MULTIPLIER" \
  "$NEWS_SCENE_LENGTH_BIAS" "$NEWS_MIN_SCENE_DURATION_SECONDS" "$NEWS_MAX_SCENE_DURATION_SECONDS"
printf 'Video: %s · %s · outputQuality %s · %s iterations\n' \
  "$NEWS_VIDEO_MODEL" "$NEWS_VIDEO_RESOLUTION" "$NEWS_VIDEO_OUTPUT_QUALITY" "$NEWS_MAX_ITERATIONS"
printf 'Video direction: audio %s · max zoom fraction %s (0.08 = 8%%)\n' "$NEWS_VIDEO_AUDIO_DIRECTION" "$NEWS_VIDEO_MAX_ZOOM"
printf 'GPT video direction: %s · per-scene mode %s\n' "$NEWS_VIDEO_DIRECTION" "auto"
printf 'Video wait per attempt: %s seconds; same command resumes a pending task\n' "$NEWS_VIDEO_POLL_TIMEOUT_SECONDS"
printf 'Automatic resume passes: %s · max 60 s between passes\n' "$NEWS_SUPERVISOR_RESTARTS"

ATTEMPT=1
while [ "$ATTEMPT" -le "$NEWS_SUPERVISOR_RESTARTS" ]; do
  printf 'Supervisor pass %s/%s\n' "$ATTEMPT" "$NEWS_SUPERVISOR_RESTARTS"
  RESUME_STATE="$(node --input-type=module - "$NEWS_OUTPUT_DIR" <<'NODE'
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.argv[2];
let runs = [];
try {
  runs = (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && /^run-\d+$/.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => Number(left.slice(4)) - Number(right.slice(4)));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

const name = runs.at(-1);
if (!name) process.exit(0);
const directory = join(root, name);
const manifestPath = join(directory, 'run.json');
let manifest;
try { manifest = JSON.parse(await readFile(manifestPath, 'utf8')); }
catch (error) { if (error.code === 'ENOENT') process.exit(0); throw error; }

if (manifest.status === 'running') {
  console.log(`images\n${directory}`);
  process.exit(0);
}
if (manifest.status === 'completed') {
  console.log(`videos\n${directory}`);
}
NODE
)"
  RESUME_MODE="$(printf '%s\n' "$RESUME_STATE" | sed -n '1p')"
  RUN_DIR="$(printf '%s\n' "$RESUME_STATE" | sed -n '2p')"
  IMAGE_PHASE_FAILED=0

  if [ "$RESUME_MODE" != videos ]; then
    if [ "$RESUME_MODE" = images ]; then
      printf 'Resuming saved image run: %s\n' "$RUN_DIR"
      sh "$SCRIPT_DIR/MIX-again-eu-news-scenes.sh" "--resume-run=$RUN_DIR" --video-direction="$NEWS_VIDEO_DIRECTION" --video-mode=auto "$@" || {
        echo 'Image run paused; checkpoint is saved. Supervisor will resume it.' >&2
        IMAGE_PHASE_FAILED=1
      }
    else
      RUN_DIR=''
      sh "$SCRIPT_DIR/MIX-again-eu-news-scenes.sh" --video-direction="$NEWS_VIDEO_DIRECTION" --video-mode=auto "$@" || {
        echo 'Image run paused; checkpoint is saved. Supervisor will resume it.' >&2
        IMAGE_PHASE_FAILED=1
      }
    fi
    if [ -z "$RUN_DIR" ]; then
      RUN_DIR="$(find "$NEWS_OUTPUT_DIR" -maxdepth 1 -type d -name 'run-*' -print | sort | tail -n 1)"
    fi
  fi

  if [ "$IMAGE_PHASE_FAILED" -eq 0 ] && [ -n "$RUN_DIR" ]; then
    printf 'Generating or resuming videos for: %s\n' "$RUN_DIR"
    if node --env-file="$ENV_FILE" "$SCRIPT_DIR/generate-news-scene-videos.mjs" \
      --run="$RUN_DIR" --model="$NEWS_VIDEO_MODEL" --resolution="$NEWS_VIDEO_RESOLUTION" \
      --output-quality="$NEWS_VIDEO_OUTPUT_QUALITY" --poll-timeout-seconds="$NEWS_VIDEO_POLL_TIMEOUT_SECONDS"; then
      exit 0
    fi
    echo 'Video run paused; task checkpoints are saved. Supervisor will resume them.' >&2
  elif [ "$IMAGE_PHASE_FAILED" -eq 0 ]; then
    echo 'No resumable run directory found.' >&2
  fi

  if [ "$ATTEMPT" -lt "$NEWS_SUPERVISOR_RESTARTS" ]; then
    DELAY=$((ATTEMPT * 5))
    [ "$DELAY" -le 60 ] || DELAY=60
    printf 'Retrying from saved state in %s seconds.\n' "$DELAY" >&2
    sleep "$DELAY"
  fi
  ATTEMPT=$((ATTEMPT + 1))
done

echo "Generation remains incomplete after $NEWS_SUPERVISOR_RESTARTS supervisor passes. Rerun the same command to resume its saved checkpoints." >&2
exit 1
