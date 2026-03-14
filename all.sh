#!/bin/zsh
set -euo pipefail

cd "$(dirname "$0")"

FIRST_LAST_SPACE_URL="${WAN22_FIRST_LAST_SELF_HOSTED_URL:-https://huggingface.co/spaces/eggman-poff/wan-flf2v}"
SINGLE_SPACE_URL="${WAN22_SINGLE_SELF_HOSTED_URL:-https://huggingface.co/spaces/eggman-poff/wan-s}"

normalize_space_id() {
  local value="${1:-}"
  value="${value#https://huggingface.co/spaces/}"
  value="${value%/}"
  printf '%s' "$value"
}

export FRESHWEB_MIDDLE_SELF_HOSTED_FIRST_LAST="${FRESHWEB_MIDDLE_SELF_HOSTED_FIRST_LAST:-1}"
export FRESHWEB_MIDDLE_SELF_HOSTED_SINGLE="${FRESHWEB_MIDDLE_SELF_HOSTED_SINGLE:-1}"
export WAN22_FIRST_LAST_SELF_HOSTED_SPACE="${WAN22_FIRST_LAST_SELF_HOSTED_SPACE:-$(normalize_space_id "$FIRST_LAST_SPACE_URL")}"
export WAN22_SINGLE_SELF_HOSTED_SPACE="${WAN22_SINGLE_SELF_HOSTED_SPACE:-$(normalize_space_id "$SINGLE_SPACE_URL")}"

printf '[all] first-last self-hosted space: %s\n' "$WAN22_FIRST_LAST_SELF_HOSTED_SPACE"
printf '[all] single-image self-hosted space: %s\n' "$WAN22_SINGLE_SELF_HOSTED_SPACE"

node lib/generator/adapter/MIX-again-freshweb.middle-cost-4-3.js "$@"
