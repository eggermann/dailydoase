import 'dotenv/config';
// chatModelProbe.js  – probe Hugging Face chat models
import fs from 'fs/promises';
import fetch from 'node-fetch';      // 3.x (ES-modules only)
import { fileURLToPath } from 'url';

const HF_API_TOKEN = process.env.HF_API_TOKEN;
if (!HF_API_TOKEN) throw new Error('HF_API_TOKEN not set – define it in your .env file!');

// ---------------------------------------------------------------------------
// Tunables (take values from env if present)
// ---------------------------------------------------------------------------
const API_BASE = 'https://huggingface.co';
const HUB_ENDPOINT = `${API_BASE}/api/models`;
const CHAT_ENDPOINT = 'https://api-inference.huggingface.co/models';

const LIMIT = +process.env.LIMIT || 1000;
const PATTERN = new RegExp(process.env.PATTERN || 'chat|instruct|assistant', 'i');
const RESULT_FILE = process.env.RESULT_FILE || 'chat_model_probe_results.json';

const TEST_PROMPT = process.env.TEST_PROMPT || 'Say hello in one word';
const MAX_TOKENS = +process.env.MAX_TOKENS || 10;

const HEADERS = {
    'Authorization': `Bearer ${HF_API_TOKEN}`,
    'Content-Type': 'application/json'
};

const GENERATION_TYPE = 'text-generation'; // pipeline tag for text generation

// ---------------------------------------------------------------------------
// Low-level helpers
// ---------------------------------------------------------------------------
async function fetchJson(url, opt = {}) {
    const res = await fetch(url, { headers: HEADERS, ...opt });
    if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
    return res.json();
}

async function probeModel(modelId) {
    const body = JSON.stringify({
        inputs: TEST_PROMPT,
        parameters: { max_new_tokens: MAX_TOKENS, temperature: 0.6, top_p: 0.95 }
    });

    const res = await fetch(`${CHAT_ENDPOINT}/${modelId}`, { method: 'POST', headers: HEADERS, body, timeout: 15_000 });
    return res.ok;                       // 200 → true, otherwise false
}

// ---------------------------------------------------------------------------
// Scan Hugging Face hub for candidate models and write the **available** ones
// ---------------------------------------------------------------------------
export async function regenerateAvailabilityList(useCache = false) {
    if (useCache) {
        try {
            const txt = await fs.readFile(RESULT_FILE, 'utf8');
            const data = JSON.parse(txt);
            if (Array.isArray(data) && data.length > 0) {
                console.log(`Loaded existing availability list from ${RESULT_FILE}`);
                return data;
            }
        } catch {
            // File does not exist or is invalid, proceed to regenerate
            console.log(`No valid cache found, regenerating list...`);
        }
    }

    console.log(`Fetching top ${LIMIT} text-generation models …`);
    const raw = await fetchJson(`${HUB_ENDPOINT}?pipeline_tag=${GENERATION_TYPE}&sort=downloads&limit=${LIMIT}`);
    const ids = raw.map(r => r.modelId).filter(id => PATTERN.test(id));

    console.log(`Probing ${ids.length} candidates, please stand by …`);
    const available = [];
    for (const id of ids) {
        process.stderr.write(` • ${id.padEnd(60)} `);
        if (await probeModel(id)) {
            available.push({ model: id, available: true });
            process.stderr.write('✓\n');
        } else {
            process.stderr.write('×\n');
        }
    }

    await fs.writeFile(RESULT_FILE, JSON.stringify(available, null, 2));
    console.log(`→ wrote ${available.length} live models to ${RESULT_FILE}`);
    return available;
}

async function readOrRegenerate() {
    try {
        const txt = await fs.readFile(RESULT_FILE, 'utf8');
        return JSON.parse(txt);
    } catch {
        return regenerateAvailabilityList();
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * init(defaultModel?) – return the first live model ID.
 *
 * Algorithm:
 *   • try defaultModel (or first entry in JSON) + the next 4
 *   • if none work → regenerate JSON once and repeat
 *   • if still none work → throw
 */
export async function init(defaultModel) {
    let list = await readOrRegenerate();

    if (!list.length) list = await regenerateAvailabilityList();
    console.log(`Found ${list.length} live models in ${RESULT_FILE}`);

    const firstIndex = defaultModel
        ? list.findIndex(e => e.model === defaultModel)
        : 0;



    for (let index = 0; index < 10005 && index < list.length; index++) {
        if (index === firstIndex) continue;

        const idx = (index) % list.length;
        console.log(`Trying model at index ${idx}: ${list[idx].model}`);

        const model = list[idx].model;
        if (await probeModel(model)) {
            console.log(`Using live model: ${model}`);
            return model;
        }
        console.warn(`Model ${model} unavailable – trying next …`);
    }

    // first pass failed → regenerate and give it one more go
    console.warn('No live model found in first five – regenerating list …');
    list = await regenerateAvailabilityList();

    for (const { model } of list.slice(0, 5)) {
        if (await probeModel(model)) {
            console.log(`Using live model after refresh: ${model}`);
            return model;
        }
    }

    throw new Error('init() could not find a live chat model after two attempts.');
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    // Optional positional argument: default model ID
    const defaultModel = process.argv[2];
    init(defaultModel)
        .then(model => {
            console.log('First available model:', model);
            return model
        })
        .catch(err => {
            console.error(err);
            process.exit(1);
        });
}