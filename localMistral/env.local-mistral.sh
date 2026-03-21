#!/bin/sh
set -eu

# OpenAI-compatible llama-server endpoint running on the Mac mini.
export LOCAL_MISTRAL_HOST="${LOCAL_MISTRAL_HOST:-dominiks-Mac-mini.local}"
export LOCAL_MISTRAL_PORT="${LOCAL_MISTRAL_PORT:-8080}"
export LOCAL_MISTRAL_ROOT_URL="${LOCAL_MISTRAL_ROOT_URL:-http://${LOCAL_MISTRAL_HOST}:${LOCAL_MISTRAL_PORT}}"
export LOCAL_MISTRAL_OPENAI_BASE_URL="${LOCAL_MISTRAL_OPENAI_BASE_URL:-${LOCAL_MISTRAL_ROOT_URL}/v1}"
export LOCAL_MISTRAL_MODEL="${LOCAL_MISTRAL_MODEL:-ministral-3-3b}"
export LOCAL_MISTRAL_VISION_PORT="${LOCAL_MISTRAL_VISION_PORT:-8082}"
export LOCAL_MISTRAL_VISION_ROOT_URL="${LOCAL_MISTRAL_VISION_ROOT_URL:-http://${LOCAL_MISTRAL_HOST}:${LOCAL_MISTRAL_VISION_PORT}}"
export LOCAL_MISTRAL_VISION_MODEL="${LOCAL_MISTRAL_VISION_MODEL:-$LOCAL_MISTRAL_MODEL}"
export LOCAL_MISTRAL_OPENAI_API_KEY="${LOCAL_MISTRAL_OPENAI_API_KEY:-local-mistral}"

# Modes:
# - primary: route chat directly to local Mistral
# - fallback: keep the normal primary provider and only use the flags below
export LOCAL_MISTRAL_MODE="${LOCAL_MISTRAL_MODE:-primary}"
export LOCAL_MISTRAL_AS_CHAT="${LOCAL_MISTRAL_AS_CHAT:-0}"
export LOCAL_MISTRAL_AS_VISION="${LOCAL_MISTRAL_AS_VISION:-0}"

append_csv_last() {
  list="${1:-}"
  item="${2:-}"
  if [ -z "$item" ]; then
    printf '%s' "$list"
    return
  fi

  found=0
  OLD_IFS="${IFS}"
  IFS=','
  for entry in $list; do
    trimmed=$(printf '%s' "$entry" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
    if [ "$trimmed" = "$item" ]; then
      found=1
      break
    fi
  done
  IFS="${OLD_IFS}"

  if [ "$found" -eq 1 ]; then
    printf '%s' "$list"
  elif [ -n "$list" ]; then
    printf '%s,%s' "$list" "$item"
  else
    printf '%s' "$item"
  fi
}

if [ "$LOCAL_MISTRAL_MODE" = "primary" ]; then
  export OPENAI_BASE_URL="${OPENAI_BASE_URL:-$LOCAL_MISTRAL_OPENAI_BASE_URL}"
  export OPENAI_API_KEY="${OPENAI_API_KEY:-$LOCAL_MISTRAL_OPENAI_API_KEY}"
  export OPENAI_MODEL="${OPENAI_MODEL:-$LOCAL_MISTRAL_MODEL}"
  export FRESHWEB_CHAT_MODEL="${FRESHWEB_CHAT_MODEL:-$OPENAI_MODEL}"
  export FRESHWEB_USE_VISION="${FRESHWEB_USE_VISION:-0}"
fi

if [ "$LOCAL_MISTRAL_AS_VISION" = "1" ]; then
  export LMSTUDIO_URL="${LMSTUDIO_URL:-$LOCAL_MISTRAL_VISION_ROOT_URL}"
  export LMSTUDIO_MODEL="${LMSTUDIO_MODEL:-$LOCAL_MISTRAL_VISION_MODEL}"
  export FRESHWEB_VISION_PROVIDERS="$(append_csv_last "${FRESHWEB_VISION_PROVIDERS:-}" "lmstudio")"
fi

export FRESHWEB_FOLDER="${FRESHWEB_FOLDER:-freshweb-local-mistral}"
