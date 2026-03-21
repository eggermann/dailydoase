#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "${SCRIPT_DIR}/.." && pwd)

. "${SCRIPT_DIR}/env.local-mistral.sh"

IMAGE_PATH="${1:-${PROJECT_ROOT}/tests/assets/remote_test_image.png}"
PROMPT="${2:-Describe this image in one short sentence.}"

if [ ! -f "${IMAGE_PATH}" ]; then
  echo "Image not found: ${IMAGE_PATH}" >&2
  exit 1
fi

python3 - "${LOCAL_MISTRAL_VISION_ROOT_URL}/v1/chat/completions" "${LOCAL_MISTRAL_OPENAI_API_KEY}" "${LOCAL_MISTRAL_VISION_MODEL}" "${IMAGE_PATH}" "${PROMPT}" <<'PY'
import base64
import json
import pathlib
import sys
import urllib.request

url, api_key, model, image_path, prompt = sys.argv[1:6]
image_bytes = pathlib.Path(image_path).read_bytes()
payload = {
    "model": model,
    "messages": [
        {
            "role": "user",
            "content": [
                {"type": "text", "text": prompt},
                {
                    "type": "image_url",
                    "image_url": {
                        "url": "data:image/png;base64," + base64.b64encode(image_bytes).decode("ascii")
                    },
                },
            ],
        }
    ],
    "max_tokens": 96,
}

request = urllib.request.Request(
    url,
    data=json.dumps(payload).encode("utf-8"),
    headers={
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    },
)

with urllib.request.urlopen(request, timeout=180) as response:
    print(response.read().decode("utf-8"))
PY
