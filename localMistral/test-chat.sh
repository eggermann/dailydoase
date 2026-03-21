#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "${SCRIPT_DIR}/env.local-mistral.sh"

PROMPT="${1:-Say hello in one short sentence.}"

curl -s "${LOCAL_MISTRAL_OPENAI_BASE_URL}/chat/completions" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer ${LOCAL_MISTRAL_OPENAI_API_KEY}" \
  -d "{
    \"model\": \"${LOCAL_MISTRAL_MODEL}\",
    \"messages\": [{\"role\":\"user\",\"content\":\"${PROMPT}\"}],
    \"max_tokens\": 96
  }"

printf '\n'
