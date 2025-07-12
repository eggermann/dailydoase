#!/bin/sh

#  Script.sh
#
#
#  Created by dominik eggermann on 21.06.25.
#
#  This script queries Hugging Face for popular text‑generation models,
#  filters for checkpoints likely to support chat‑style usage, probes each
#  one with the Inference API, and records a success/fail report in JSON.
#
#  Requirements:
#    • bash/z‑sh compatible `/bin/sh`
#    • `curl` and `jq` installed
#    • Environment variable HF_TOKEN exported with a valid Hugging Face token
#
#  Optional environment variables:
#    LIMIT    – number of models to request from the Hub  (default 1000)
#    PATTERN  – grep pattern for chat models              (default chat|instruct|assistant)
#    MODELS_FILE  – where to save the candidate list      (default models.txt)
#    RESULT_FILE  – where to write the JSON results       (default chat_model_probe_results.json)
#

set -e

API_BASE="https://huggingface.co"
INF_API="$API_BASE/api/models"
CHAT_API="https://api-inference.huggingface.co/v1/models"

LIMIT="${LIMIT:-1000}"
PATTERN="${PATTERN:-chat|instruct|assistant}"
MODELS_FILE="${MODELS_FILE:-models.txt}"

RESULT_FILE="${RESULT_FILE:-chat_model_probe_results.json}"
TEST_PROMPT="${TEST_PROMPT:-Say hello in one word}"
MAX_TOKENS="${MAX_TOKENS:-10}"

if [ -z "$HF_TOKEN" ]; then
  echo "Error: HF_TOKEN is not set. Export your Hugging Face API token and retry." >&2
  exit 1
fi

echo "➤ Fetching up to $LIMIT text‑generation models from Hugging Face Hub…"
curl -s "$INF_API?pipeline_tag=text-generation&sort=downloads&limit=$LIMIT" \
  | jq -r '.[].modelId' \
  | grep -Ei "(${PATTERN})" \
  > "$MODELS_FILE"

CANDIDATE_COUNT=$(wc -l < "$MODELS_FILE" | tr -d ' ')
echo "   → $CANDIDATE_COUNT candidate chat models written to $MODELS_FILE"

echo "➤ Probing each model endpoint with a live generation request (this may take a while)…"

printf '[' > "$RESULT_FILE"
first=true
while IFS= read -r model; do
  [ -n "$model" ] || continue   # skip blank lines

  echo -n "   • $model … " >&2
  # --- POST a minimal prompt to /models/<repoId> ----------------------------
  response=$(curl -s -w "\n%{http_code}" \
    -H "Authorization: Bearer $HF_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"inputs\":\"$TEST_PROMPT\",\"parameters\":{\"max_new_tokens\":$MAX_TOKENS,\"temperature\":0.6,\"top_p\":0.95}}" \
    "https://api-inference.huggingface.co/models/$model")

  http_code=$(printf '%s\n' "$response" | tail -n1)
  body=$(printf '%s\n' "$response" | sed '$d')

  if [ "$http_code" = "200" ]; then
    ok=true
    echo "ok" >&2
  else
    ok=false
    echo "fail ($http_code)" >&2
  fi

  ${first:+true} && first=false || printf ',' >> "$RESULT_FILE"
  printf '\n  { "model": "%s", "ok": %s, "http_code": %s }' "$model" "$ok" "$http_code" >> "$RESULT_FILE"
done < "$MODELS_FILE"
printf '\n]\n' >> "$RESULT_FILE"

echo "➤ Results saved to $RESULT_FILE"
#
