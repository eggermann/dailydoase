#!/bin/sh
#
# curlModel.sh – quick ping against a Hugging Face text‑generation checkpoint.
#
# Default model & prompt (override with --model / --prompt):
MODEL="microsoft/Phi-3.5-mini-instruct"
PROMPT="Say hello in one word"

# ---- parse CLI flags -------------------------------------------------------
while [ $# -gt 0 ]; do
  case "$1" in
    --model)  MODEL="$2"; shift 2 ;;
    --prompt) PROMPT="$2"; shift 2 ;;
    *) echo "Usage: $0 [--model <repoId>] [--prompt <text>]"; exit 1 ;;
  esac
done

# ---- check for required token ---------------------------------------------
if [ -z "$HF_TOKEN" ]; then
  echo "Error: HF_TOKEN is not set. Run 'export HF_TOKEN=<your_token>' first." >&2
  exit 1
fi

echo "➤ Testing $MODEL …"

# ---- perform request and capture both body and status ----
response=$(curl -s -w "\n%{http_code}" \
  -H "Authorization: Bearer $HF_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -X POST \
  -d "{\"inputs\":\"$PROMPT\",\"parameters\":{\"max_new_tokens\":20,\"temperature\":0.6,\"top_p\":0.95}}" \
  "https://api-inference.huggingface.co/models/$MODEL")

# split response into body and status
http_code=$(printf '%s\n' "$response" | tail -n1)
body=$(printf '%s\n' "$response" | sed '$d')

# ---- handle errors ----
if [ "$http_code" != "200" ]; then
  echo "✗ HTTP $http_code — request failed:"
  printf '%s\n' "$body"
  exit 1
fi

# pretty-print JSON if possible; otherwise just dump the body
echo "$body" | jq . 2>/dev/null || printf '%s\n' "$body"
echo "✓ Done"
