

# Hugging Face Grabber – README

This mini‑toolkit contains two executable shell scripts that help you **discover, probe, and spot‑test Hugging Face text‑generation models** without running a local server.

| Script | Purpose | Typical use |
| ------ | ------- | ----------- |
| **`Script.sh`** | Bulk crawler & checker – downloads a list of popular *chat/instruct* checkpoints and performs a live generation request against each endpoint. A JSON health report is written to disk. | Nightly cron job to find which chat models are currently live. |
| **`curlModel.sh`** | One‑off probe – sends a single prompt to one model you specify and pretty‑prints the JSON (or the HTTP error). | Manual sanity check before wiring a checkpoint into code. |

Both scripts talk to the **free Hugging Face Inference API**, so no self‑hosting is required.

---

## Quick start

```bash
# 1) Clone or download this folder
cd huggin-api-test                # adjust path if needed

# 2) Create or copy a personal token (Settings → Access Tokens on HF)
export HF_TOKEN=hf_yourRealTokenHere

# 3) Make the tools executable (one‑time)
chmod +x Script.sh curlModel.sh

# 4) Bulk scan the top 1 000 chat models (about 2 min)
./Script.sh

# 5) Spot‑test a single checkpoint
./curlModel.sh \
    --model "microsoft/Phi-3.5-mini-instruct" \
    --prompt "Explain the number 42 in one sentence."
```

---

## `Script.sh` – parameters

Set these *environment variables* before running to change behaviour:

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `HF_TOKEN` | _(none)_ | **Required.** Your personal HF token with *inference* scope. |
| `LIMIT` | `1000` | Max repos fetched from the Hub (`pipeline_tag=text-generation`). |
| `PATTERN` | `chat\|instruct\|assistant` | Grep filter for names that look chat‑related (case‑insensitive). |
| `MODELS_FILE` | `models.txt` | Path of the intermediate candidate list. |
| `RESULT_FILE` | `chat_model_probe_results.json` | Path of the final report. |
| `TEST_PROMPT` | `Say hello in one word` | Prompt sent to every model. |
| `MAX_TOKENS` | `10` | `max_new_tokens` for each generation call. |

### Output format

```jsonc
[
  { "model": "meta-llama/Llama‑3‑8B‑Instruct", "ok": true,  "http_code": 200 },
  { "model": "unsloth/Qwen2.5‑0.5B‑Instruct", "ok": false, "http_code": 404 }
]
```

---

## `curlModel.sh` – flags

| Flag | Default | What it does |
| ---- | ------- | ------------ |
| `--model`  | `microsoft/Phi-3.5-mini-instruct` | Target repo ID. |
| `--prompt` | `Say hello in one word` | Text prompt to send. |

Exit status is `0` on success, `1` if `HF_TOKEN` is missing or HTTP != 200.

---

## Requirements

* **curl** – installed on macOS/Linux by default  
* **jq** – JSON pretty‑printer (`brew install jq` on macOS)  
* A Hugging Face **User Access Token** with **“Make calls to Inference API”** scope.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
| ------- | ------------ | --- |
| `Invalid credentials in Authorization header` | Token missing or wrong scope | Re‑export the correct token. |
| `HTTP 404 Not Found` in bulk scan | Endpoint is private, gated, or offline | Request access or choose a public model. |
| `jq: parse error` | Endpoint returned non‑JSON body | Check the raw output for details. |

---

Happy model hunting! 🎉