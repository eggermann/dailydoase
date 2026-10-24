import { readFile, writeFile, unlink } from 'node:fs/promises';
import { join, basename } from 'node:path';

const SPACE_URL = 'https://black-forest-labs-flux-3-image-klein.hf.space';
const OUTPUT_SETTINGS = {
  mode_choice: 'Distilled (16 steps)',
  randomize_seed: false,
  width: 1680,
  height: 944,
  num_inference_steps: 16,
  guidance_scale: 1,
  prompt_upsampling: true,
};

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const writeJson = (path, value) => writeFile(path, `${JSON.stringify(value, null, 2)}\n`);

async function request(path, token, options = {}) {
  const response = await fetch(`${SPACE_URL}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...options.headers },
    signal: AbortSignal.timeout(240_000),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Hugging Face FLUX Space HTTP ${response.status}: ${body.slice(0, 1000)}`);
  return body;
}

async function uploadImage(imagePath, token) {
  const buffer = await readFile(imagePath);
  const form = new FormData();
  form.append('files', new Blob([buffer]), basename(imagePath));
  const response = JSON.parse(await request('/gradio_api/upload', token, { method: 'POST', body: form }));
  if (!Array.isArray(response) || typeof response[0] !== 'string') throw new Error('Hugging Face image upload returned no file path');
  return { image: { path: response[0], meta: { _type: 'gradio.FileData' }, orig_name: basename(imagePath) }, caption: null };
}

async function poll(eventId, token) {
  const response = await fetch(`${SPACE_URL}/gradio_api/call/v2/generate/${encodeURIComponent(eventId)}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(240_000),
  });
  if (!response.ok) throw new Error(`Hugging Face image polling failed: HTTP ${response.status}`);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent = '';
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (line.startsWith('event:')) currentEvent = line.slice(6).trim();
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (currentEvent === 'error') throw new Error(`Hugging Face image generation failed: ${data}`);
      if (currentEvent === 'complete') {
        const result = JSON.parse(data);
        if (!Array.isArray(result) || !result[0]) throw new Error('Hugging Face generation returned no completed image');
        return result;
      }
    }
    if (done) break;
  }
  throw new Error('Hugging Face generation stream ended before completion');
}

export async function generateFluxKleinImage({ prompt, referencePaths, token, directory, name, seed }) {
  if (!token) throw new Error('Set HF_TOKEN to use Hugging Face ZeroGPU');
  const requestPath = join(directory, `${name}-hf-request.json`);
  const submissionPath = join(directory, `${name}-hf-submission.json`);
  const responsePath = join(directory, `${name}-hf-response.json`);
  const pendingPath = join(directory, `${name}-hf-pending.json`);
  const requestLog = {
    provider: 'huggingface-zerogpu',
    space: 'black-forest-labs/flux-3-image-klein',
    endpoint: '/generate',
    prompt,
    referencePaths: referencePaths.map((path) => path.replace(`${directory}/`, '')),
    settings: { ...OUTPUT_SETTINGS, seed },
  };
  if (!(await exists(requestPath))) await writeJson(requestPath, requestLog);
  else if ((await readJson(requestPath)).prompt !== prompt) throw new Error(`${name}: saved FLUX prompt differs from scene plan`);

  if (!(await exists(responsePath))) {
    let eventId;
    if (await exists(submissionPath)) {
      eventId = (await readJson(submissionPath)).eventId;
      if (!eventId) throw new Error(`${name}: saved Hugging Face submission has no event id`);
    } else {
      try {
        await writeJson(pendingPath, { startedAt: new Date().toISOString(), provider: 'huggingface-zerogpu' });
      } catch (error) {
        if (error.code === 'EEXIST') throw new Error(`${name}: previous Hugging Face outcome unknown; inspect Space history before retrying`);
        throw error;
      }
      const inputImages = [];
      for (const imagePath of referencePaths) inputImages.push(await uploadImage(imagePath, token));
      const body = {
        prompt,
        input_images: inputImages,
        ...OUTPUT_SETTINGS,
        seed,
      };
      await writeJson(join(directory, `${name}-hf-api-request.json`), body);
      const submitted = JSON.parse(await request('/gradio_api/call/v2/generate', token, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      }));
      if (!submitted.event_id) throw new Error(`${name}: Hugging Face returned no event id; pending marker retained`);
      eventId = submitted.event_id;
      await writeJson(submissionPath, { eventId, submittedAt: new Date().toISOString() });
    }
    const completed = await poll(eventId, token);
    await writeJson(responsePath, { eventId, data: completed, completedAt: new Date().toISOString() });
    await unlink(pendingPath).catch((error) => { if (error.code !== 'ENOENT') throw error; });
  }

  const saved = await readJson(responsePath);
  const outputImage = saved.data?.[0];
  const imageLocation = outputImage?.url || (outputImage?.path
    ? `${SPACE_URL}/gradio_api/file=${encodeURIComponent(outputImage.path)}`
    : null);
  if (!imageLocation) throw new Error(`${name}: saved Hugging Face response has no downloadable image`);
  const imageUrl = new URL(imageLocation, SPACE_URL).toString();
  return { imageUrl, seed: saved.data?.[1] ?? seed, eventId: saved.eventId };
}

async function exists(path) {
  try { await readFile(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
