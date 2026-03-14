#!/bin/zsh
set -euo pipefail

cd "$(dirname "$0")"

# This wrapper always runs in image-to-video-only mode.
export FRESHWEB_MIDDLE_IMAGE_TO_VIDEO_ONLY=1

normalize_space_id() {
  local value="${1:-}"
  value="${value#https://huggingface.co/spaces/}"
  value="${value%/}"
  printf '%s' "$value"
}

CHAT_MODEL="${1:-${OPENAI_MODEL:-gpt-4o-mini}}"
VISION_MODEL="${2:-${OPENAI_VISION_MODEL:-$CHAT_MODEL}}"
FIRST_LAST_SPACE="$(normalize_space_id "${3:-${WAN22_FIRST_LAST_SPACE:-cakegreen/Wan-2-2-first-last-frame}}")"
SINGLE_SPACE="$(normalize_space_id "${4:-${WAN22_SINGLE_SPACE:-Wan-AI/Wan-2.2-5B}}")"
FIRST_LAST_SELF_HOSTED="$(normalize_space_id "${5:-${WAN22_FIRST_LAST_SELF_HOSTED_SPACE:-${WAN22_FIRST_LAST_SELF_HOSTED_URL:-https://huggingface.co/spaces/eggman-poff/wan-flf2v}}}")"
SINGLE_SELF_HOSTED="$(normalize_space_id "${6:-${WAN22_SINGLE_SELF_HOSTED_SPACE:-${WAN22_SINGLE_SELF_HOSTED_URL:-https://huggingface.co/spaces/eggman-poff/wan-s}}}")"

export OPENAI_MODEL="$CHAT_MODEL"
export OPENAI_VISION_MODEL="$VISION_MODEL"
export WAN22_FIRST_LAST_SPACE="$FIRST_LAST_SPACE"
export WAN22_SINGLE_SPACE="$SINGLE_SPACE"
export WAN22_FIRST_LAST_SELF_HOSTED_SPACE="$FIRST_LAST_SELF_HOSTED"
export WAN22_SINGLE_SELF_HOSTED_SPACE="$SINGLE_SELF_HOSTED"
export FRESHWEB_MIDDLE_SELF_HOSTED_FIRST_LAST="${FRESHWEB_MIDDLE_SELF_HOSTED_FIRST_LAST:-1}"
export FRESHWEB_MIDDLE_SELF_HOSTED_SINGLE="${FRESHWEB_MIDDLE_SELF_HOSTED_SINGLE:-1}"
export FRESHWEB_MIDDLE_VISION_PROVIDERS="${FRESHWEB_MIDDLE_VISION_PROVIDERS:-openai}"
export FRESHWEB_MIDDLE_SCENE_COUNT="${FRESHWEB_MIDDLE_SCENE_COUNT:-7}"
export FRESHWEB_MIDDLE_USE_TAKTMUSTER_LENGTHS="${FRESHWEB_MIDDLE_USE_TAKTMUSTER_LENGTHS:-1}"
export FRESHWEB_MIDDLE_TAKTMUSTER_TAKT="${FRESHWEB_MIDDLE_TAKTMUSTER_TAKT:-4}"
export FRESHWEB_MIDDLE_TAKTMUSTER_TYPE="${FRESHWEB_MIDDLE_TAKTMUSTER_TYPE:-balanced}"
export FRESHWEB_MIDDLE_SCENE_LENGTH_BIAS="${FRESHWEB_MIDDLE_SCENE_LENGTH_BIAS:-0}"
export FRESHWEB_MIDDLE_SCENE_LENGTHS="${FRESHWEB_MIDDLE_SCENE_LENGTHS:-}"
export FRESHWEB_MIDDLE_SCENE_LENGTH_MULTIPLIER="${FRESHWEB_MIDDLE_SCENE_LENGTH_MULTIPLIER:-1}"

resolve_scene_lengths_display() {
  if [ -n "${FRESHWEB_MIDDLE_SCENE_LENGTHS:-}" ]; then
    printf '%s' "$FRESHWEB_MIDDLE_SCENE_LENGTHS"
    return
  fi

  if [ "${FRESHWEB_MIDDLE_USE_TAKTMUSTER_LENGTHS:-0}" != "1" ]; then
    printf '%s' ''
    return
  fi

  node - <<'NODE'
const { Taktmuster } = require('taktmuster');

const sceneCount = Number(process.env.FRESHWEB_MIDDLE_SCENE_COUNT || 0);
const takt = Number(process.env.FRESHWEB_MIDDLE_TAKTMUSTER_TAKT || 4);
const type = String(process.env.FRESHWEB_MIDDLE_TAKTMUSTER_TYPE || 'balanced').trim() || 'balanced';
const multiplier = Number(process.env.FRESHWEB_MIDDLE_SCENE_LENGTH_MULTIPLIER || 1);
const bias = Number(process.env.FRESHWEB_MIDDLE_SCENE_LENGTH_BIAS || 0);

const tm = new Taktmuster();
tm.setTakt(takt);
tm.setType(type);

const lengths = [];
for (let index = 0; index < sceneCount; index += 1) {
  const step = tm.getNext();
  const rawValue = Number(step?.patternValue ?? step);
  const withMultiplier = Number.isFinite(multiplier) && multiplier > 0
    ? rawValue * multiplier
    : rawValue;
  const withBias = Number.isFinite(bias) ? withMultiplier + bias : withMultiplier;
  lengths.push(Number(Math.max(1, withBias).toFixed(2)));
}

process.stdout.write(lengths.join(','));
NODE
}

SCENE_LENGTHS_DISPLAY="$(resolve_scene_lengths_display)"

printf '[all-medium] chat model: %s\n' "$OPENAI_MODEL"
printf '[all-medium] vision model: %s\n' "$OPENAI_VISION_MODEL"
printf '[all-medium] first-last primary: %s\n' "$WAN22_FIRST_LAST_SPACE"
printf '[all-medium] single-image primary: %s\n' "$WAN22_SINGLE_SPACE"
printf '[all-medium] first-last self-hosted: %s\n' "$WAN22_FIRST_LAST_SELF_HOSTED_SPACE"
printf '[all-medium] single-image self-hosted: %s\n' "$WAN22_SINGLE_SELF_HOSTED_SPACE"
printf '[all-medium] vision providers: %s\n' "$FRESHWEB_MIDDLE_VISION_PROVIDERS"
printf '[all-medium] scene count: %s\n' "$FRESHWEB_MIDDLE_SCENE_COUNT"
printf '[all-medium] scene lengths: %s\n' "${SCENE_LENGTHS_DISPLAY:-}"
printf '[all-medium] scene length multiplier: %s\n' "$FRESHWEB_MIDDLE_SCENE_LENGTH_MULTIPLIER"
printf '[all-medium] taktmuster: %s | takt %s\n' "$FRESHWEB_MIDDLE_TAKTMUSTER_TYPE" "$FRESHWEB_MIDDLE_TAKTMUSTER_TAKT"
printf '[all-medium] scene length bias: %s\n' "$FRESHWEB_MIDDLE_SCENE_LENGTH_BIAS"
printf '[all-medium] image-to-video only: %s\n' "$FRESHWEB_MIDDLE_IMAGE_TO_VIDEO_ONLY"
node lib/generator/adapter/MIX-again-freshweb.middle-cost-4-3.js "$@"
