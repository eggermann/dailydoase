import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import dotenv from 'dotenv';

import { createLogger } from '../../logger.js';

try {
  dotenv.config();
} catch {}

const logger = createLogger('vision-model', { envKeys: ['VISION_DEBUG'] });

const DEFAULT_PROMPT = 'Describe this image in detail.';
const DEFAULT_LMSTUDIO_URL = 'http://127.0.0.1:1234';
const DEFAULT_LMSTUDIO_MODEL = 'mistralai/ministral-3-3b';
const DEFAULT_HF_SPACE_ID = 'huggingface-projects/llama-3.2-vision-11B';
const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';
const DEFAULT_HF_MODEL = 'meta-llama/Llama-3.2-11B-Vision-Instruct';
const DEFAULT_HF_CAPTION_MODEL = 'Salesforce/blip-image-captioning-large';
const DEFAULT_FAL_MODEL = 'fal-ai/moondream3-preview/query';
const FALLBACK_PROVIDERS = ['lmstudio', 'hfspace', 'openai', 'huggingface', 'fal'];

const MIME_BY_EXT = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
};

const trimText = (value) => String(value ?? '').trim();

const isUrl = (value) => /^https?:\/\//i.test(String(value ?? '').trim());

const isDataUrl = (value) => /^data:/i.test(String(value ?? '').trim());

const extractText = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item?.type === 'text' && typeof item.text === 'string') return item.text;
        if (typeof item?.content === 'string') return item.content;
        return '';
      })
      .filter(Boolean)
      .join('\n')
      .trim();
  }
  if (typeof value?.text === 'string') return value.text.trim();
  if (typeof value?.content === 'string') return value.content.trim();
  if (typeof value?.generated_text === 'string') return value.generated_text.trim();
  if (typeof value?.output === 'string') return value.output.trim();
  return '';
};

export function resolveHuggingFaceToken(env = process.env) {
  return (
    env.HF_API_TOKEN ||
    env.HF_TOKEN ||
    env.HF_APIKEY ||
    env.HF_API_KEY ||
    env.HUGGINGFACE_API_KEY ||
    env.HUGGINGFACEHUB_API_TOKEN ||
    ''
  );
}

export function resolveFalKey(env = process.env) {
  return env.FAL_KEY || env.FAL_API_KEY || '';
}

export function resolveOpenAiKey(env = process.env) {
  return env.OPENAI_API_KEY || '';
}

export function resolveLmStudioUrl(env = process.env) {
  return (
    env.LMSTUDIO_URL ||
    env.VITE_LMSTUDIO_URL ||
    env.LM_STUDIO_URL ||
    DEFAULT_LMSTUDIO_URL
  );
}

export function resolveLmStudioModel(env = process.env) {
  return (
    env.LMSTUDIO_MODEL ||
    env.VITE_LMSTUDIO_MODEL ||
    env.LM_STUDIO_MODEL ||
    DEFAULT_LMSTUDIO_MODEL
  );
}

export function resolveHfSpaceId(env = process.env) {
  return (
    env.HF_VISION_SPACE_ID ||
    env.HF_SPACE_ID ||
    DEFAULT_HF_SPACE_ID
  );
}

export function resolveOpenAiModel(env = process.env) {
  return (
    env.OPENAI_VISION_MODEL ||
    env.OPENAI_MODEL ||
    DEFAULT_OPENAI_MODEL
  );
}

export async function imagePathToDataUrl(imagePath, mimeType) {
  const resolvedPath = path.resolve(String(imagePath));
  const ext = path.extname(resolvedPath).toLowerCase();
  const finalMime = mimeType || MIME_BY_EXT[ext] || 'application/octet-stream';
  const buffer = await fs.readFile(resolvedPath);
  return `data:${finalMime};base64,${buffer.toString('base64')}`;
}

export async function normalizeVisionImageInput(options = {}) {
  const imageUrl = trimText(options.imageUrl);
  const imagePath = trimText(options.imagePath);
  const imageBase64 = trimText(options.imageBase64);
  const mimeType = trimText(options.mimeType);

  if (imageUrl) {
    return {
      imageSource: imageUrl,
      sourceType: isDataUrl(imageUrl) ? 'data-url' : 'url',
    };
  }

  if (imageBase64) {
    const finalMime = mimeType || 'image/png';
    return {
      imageSource: imageBase64.startsWith('data:')
        ? imageBase64
        : `data:${finalMime};base64,${imageBase64}`,
      sourceType: 'data-url',
    };
  }

  if (imagePath) {
    return {
      imageSource: await imagePathToDataUrl(imagePath, mimeType),
      sourceType: 'path',
    };
  }

  throw new Error('Vision helper requires one of imageUrl, imagePath, or imageBase64');
}

async function createHFClient(token) {
  let InferenceClient;
  try {
    ({ InferenceClient } = await import('@huggingface/inference'));
  } catch {
    throw new Error('Hugging Face vision helper requires @huggingface/inference');
  }

  return new InferenceClient(token);
}

async function createOpenAiClient(apiKey) {
  let OpenAI;
  try {
    ({ default: OpenAI } = await import('openai'));
  } catch {
    throw new Error('OpenAI vision helper requires openai');
  }

  return new OpenAI({ apiKey });
}

async function createGradioRuntime(options = {}, runtime = {}) {
  if (runtime.gradioClient && runtime.gradioHandleFile) {
    return {
      Client: runtime.gradioClient,
      handle_file: runtime.gradioHandleFile,
    };
  }

  try {
    return await import('@gradio/client');
  } catch {
    throw new Error('HF Space vision helper requires @gradio/client');
  }
}

async function buildHfSpaceFileInput(options = {}, gradioModule) {
  const imagePath = trimText(options.imagePath);
  const imageUrl = trimText(options.imageUrl);
  const imageBase64 = trimText(options.imageBase64);
  const mimeType = trimText(options.mimeType) || 'image/png';

  if (imagePath) {
    return gradioModule.handle_file(path.resolve(imagePath));
  }

  if (imageUrl) {
    return gradioModule.handle_file(imageUrl);
  }

  if (imageBase64) {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vision-hf-space-'));
    const ext = mimeType.includes('jpeg') ? '.jpg' : '.png';
    const tmpPath = path.join(tmpDir, `space-input${ext}`);
    const base64Payload = imageBase64.startsWith('data:')
      ? imageBase64.split(',')[1] || ''
      : imageBase64;
    await fs.writeFile(tmpPath, Buffer.from(base64Payload, 'base64'));
    return gradioModule.handle_file(tmpPath);
  }

  throw new Error('HF Space vision helper requires one of imageUrl, imagePath, or imageBase64');
}

async function runHuggingFaceVision(options = {}, runtime = {}) {
  const token = options.hfToken || resolveHuggingFaceToken(runtime.env || process.env);
  if (!token) {
    throw new Error('Missing Hugging Face API token');
  }

  const { imageSource } = await normalizeVisionImageInput(options);
  const model = options.hfModel || DEFAULT_HF_MODEL;
  const prompt = trimText(options.prompt || DEFAULT_PROMPT);
  const temperature = Number.isFinite(options.temperature) ? options.temperature : 0.2;
  const maxTokens = Number.isFinite(options.maxTokens) ? options.maxTokens : 500;
  const provider = trimText(options.hfProvider || (runtime.env || process.env).HF_PROVIDER);

  const hf = runtime.hfClient || await createHFClient(token);
  if (typeof hf.chatCompletion !== 'function') {
    throw new Error('Installed @huggingface/inference client does not expose chatCompletion');
  }

  const payload = {
    model,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: imageSource,
            },
          },
          {
            type: 'text',
            text: prompt,
          },
        ],
      },
    ],
    temperature,
    max_tokens: maxTokens,
  };

  if (provider) {
    payload.provider = provider;
  }

  logger.payload('hf-vision-request', payload);
  const response = await hf.chatCompletion(payload);
  const outputText = extractText(response?.choices?.[0]?.message?.content);

  if (!outputText) {
    throw new Error('Hugging Face vision model returned no text output');
  }

  return {
    provider: 'huggingface',
    model,
    outputText,
    raw: response,
  };
}

async function runHuggingFaceCaption(options = {}, runtime = {}) {
  const token = options.hfToken || resolveHuggingFaceToken(runtime.env || process.env);
  if (!token) {
    throw new Error('Missing Hugging Face API token');
  }

  const imageArg = options.imagePath || options.imageUrl || options.imageBase64;
  if (!imageArg) {
    throw new Error('Missing image input for Hugging Face caption fallback');
  }

  const model = options.hfCaptionModel || DEFAULT_HF_CAPTION_MODEL;
  const hf = runtime.hfClient || await createHFClient(token);
  if (typeof hf.imageToText !== 'function') {
    throw new Error('Installed @huggingface/inference client does not expose imageToText');
  }

  const payload = {
    model,
    data: options.imagePath ? await fs.readFile(path.resolve(options.imagePath)) : imageArg,
  };

  logger.payload('hf-caption-request', { model, image: options.imagePath || options.imageUrl || '[base64]' });
  const response = await hf.imageToText(payload);
  const outputText = extractText(response);

  if (!outputText) {
    throw new Error('Hugging Face image caption fallback returned no text output');
  }

  return {
    provider: 'huggingface',
    model,
    outputText,
    raw: response,
  };
}

async function runHfSpaceVision(options = {}, runtime = {}) {
  const token = options.hfToken || resolveHuggingFaceToken(runtime.env || process.env);
  const gradioModule = await createGradioRuntime(options, runtime);
  const spaceId = trimText(options.hfSpaceId || resolveHfSpaceId(runtime.env || process.env));
  const prompt = trimText(options.prompt || DEFAULT_PROMPT);
  const maxTokens = Number.isFinite(options.maxTokens) ? options.maxTokens : 250;

  if (!spaceId) {
    throw new Error('Missing Hugging Face Space id');
  }

  const connectOptions = token ? { hf_token: token } : {};
  const client = runtime.gradioSpaceClient || await gradioModule.Client.connect(spaceId, connectOptions);
  if (!client || typeof client.predict !== 'function') {
    throw new Error('Connected HF Space client does not expose predict');
  }

  const fileInput = await buildHfSpaceFileInput(options, gradioModule);
  const payload = {
    message: {
      text: prompt,
      files: [fileInput],
    },
    max_new_tokens: maxTokens,
  };

  logger.payload('hf-space-vision-request', {
    spaceId,
    hasToken: Boolean(token),
    payload: {
      ...payload,
      message: {
        text: payload.message.text,
        files: ['[file]'],
      },
    },
  });

  const response = await client.predict('/chat', payload);
  const outputText = extractText(response?.data);

  if (!outputText) {
    throw new Error('HF Space vision model returned no text output');
  }

  return {
    provider: 'hfspace',
    model: spaceId,
    outputText,
    raw: response,
  };
}

async function runOpenAiVision(options = {}, runtime = {}) {
  const env = runtime.env || process.env;
  const apiKey = options.openAiKey || resolveOpenAiKey(env);
  if (!apiKey) {
    throw new Error('Missing OpenAI API key');
  }

  const { imageSource } = await normalizeVisionImageInput(options);
  const model = trimText(options.openAiModel || options.model || resolveOpenAiModel(env));
  const prompt = trimText(options.prompt || DEFAULT_PROMPT);
  const systemPrompt = trimText(options.systemPrompt);
  const maxTokens = Number.isFinite(options.maxTokens) ? options.maxTokens : 220;
  const temperature = Number.isFinite(options.temperature) ? options.temperature : 0.2;

  const client = runtime.openaiClient || await createOpenAiClient(apiKey);
  if (!client?.chat?.completions?.create) {
    throw new Error('OpenAI client does not expose chat.completions.create');
  }

  const payload = {
    model,
    messages: [
      ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: prompt,
          },
          {
            type: 'image_url',
            image_url: {
              url: imageSource,
            },
          },
        ],
      },
    ],
    max_tokens: maxTokens,
    temperature,
  };

  logger.payload('openai-vision-request', {
    ...payload,
    messages: payload.messages.map((message) => (
      message.role === 'user'
        ? {
          ...message,
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: '[image]' } },
          ],
        }
        : message
    )),
  });

  const response = await client.chat.completions.create(payload);
  const outputText = extractText(response?.choices?.[0]?.message?.content);

  if (!outputText) {
    throw new Error('OpenAI vision model returned no text output');
  }

  return {
    provider: 'openai',
    model,
    outputText,
    raw: response,
  };
}

function getFetch(runtime = {}) {
  return runtime.fetchImpl || globalThis.fetch;
}

async function runFalVision(options = {}, runtime = {}) {
  const falKey = options.falKey || resolveFalKey(runtime.env || process.env);
  if (!falKey) {
    throw new Error('Missing fal.ai API key');
  }

  const { imageSource } = await normalizeVisionImageInput(options);
  const prompt = trimText(options.prompt || DEFAULT_PROMPT);
  const model = options.falModel || DEFAULT_FAL_MODEL;
  const fetchImpl = getFetch(runtime);

  if (typeof fetchImpl !== 'function') {
    throw new Error('Fetch is not available for fal.ai fallback');
  }

  const url = `https://fal.run/${model}`;
  const payload = {
    image_url: imageSource,
    prompt,
    reasoning: typeof options.falReasoning === 'boolean' ? options.falReasoning : false,
  };

  if (Number.isFinite(options.temperature)) {
    payload.temperature = options.temperature;
  }
  if (Number.isFinite(options.topP)) {
    payload.top_p = options.topP;
  }

  logger.netRequest({
    method: 'POST',
    url,
    headers: {
      Authorization: `Key ${falKey}`,
      'Content-Type': 'application/json',
    },
    body: payload,
    label: 'fal-vision',
  });

  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      Authorization: `Key ${falKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const rawText = await response.text();
  let json = null;
  try {
    json = rawText ? JSON.parse(rawText) : {};
  } catch {
    json = { output: rawText };
  }

  logger.netResponse({
    method: 'POST',
    url,
    status: response.status,
    statusText: response.statusText,
    body: json,
    label: 'fal-vision',
  });

  if (!response.ok) {
    throw new Error(`fal.ai request failed: ${response.status} ${response.statusText} ${extractText(json)}`.trim());
  }

  const outputText = extractText(json?.output || json);
  if (!outputText) {
    throw new Error('fal.ai vision fallback returned no text output');
  }

  return {
    provider: 'fal',
    model,
    outputText,
    raw: json,
  };
}

function getTextFromChatResponse(response) {
  return extractText(response?.choices?.[0]?.message?.content);
}

async function runLmStudioVision(options = {}, runtime = {}) {
  const env = runtime.env || process.env;
  const fetchImpl = getFetch(runtime);
  if (typeof fetchImpl !== 'function') {
    throw new Error('Fetch is not available for LM Studio vision');
  }

  const { imageSource } = await normalizeVisionImageInput(options);
  const prompt = trimText(options.prompt || DEFAULT_PROMPT);
  const model = trimText(options.lmStudioModel || options.model || resolveLmStudioModel(env));
  const baseUrl = trimText(options.lmStudioUrl || resolveLmStudioUrl(env)).replace(/\/$/, '');
  const endpoint = `${baseUrl}/v1/chat/completions`;
  const temperature = Number.isFinite(options.temperature) ? options.temperature : 0.4;
  const maxTokens = Number.isFinite(options.maxTokens) ? options.maxTokens : 180;

  const payload = {
    model,
    messages: [
      ...(trimText(options.systemPrompt)
        ? [{ role: 'system', content: trimText(options.systemPrompt) }]
        : []),
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: prompt,
          },
          {
            type: 'image_url',
            image_url: {
              url: imageSource,
            },
          },
        ],
      },
    ],
    temperature,
    max_tokens: maxTokens,
  };

  logger.netRequest({
    method: 'POST',
    url: endpoint,
    headers: {
      'Content-Type': 'application/json',
    },
    body: payload,
    label: 'lmstudio-vision',
  });

  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const rawText = await response.text();
  let json = null;
  try {
    json = rawText ? JSON.parse(rawText) : {};
  } catch {
    json = { output: rawText };
  }

  logger.netResponse({
    method: 'POST',
    url: endpoint,
    status: response.status,
    statusText: response.statusText,
    body: json,
    label: 'lmstudio-vision',
  });

  if (!response.ok) {
    throw new Error(`LM Studio request failed: ${response.status} ${response.statusText} ${extractText(json)}`.trim());
  }

  const outputText = getTextFromChatResponse(json);
  if (!outputText) {
    throw new Error('LM Studio vision model returned no text output');
  }

  return {
    provider: 'lmstudio',
    model,
    outputText,
    raw: json,
  };
}

export async function visionModel(input = {}, runtime = {}) {
  const options = typeof input === 'string'
    ? { prompt: input }
    : { ...input };

  const providers = Array.isArray(options.providers) && options.providers.length > 0
    ? options.providers
    : FALLBACK_PROVIDERS;

  const errors = [];

  for (const provider of providers) {
    try {
      if (provider === 'lmstudio') {
        return await runLmStudioVision(options, runtime);
      }

      if (provider === 'hfspace') {
        return await runHfSpaceVision(options, runtime);
      }

      if (provider === 'openai') {
        return await runOpenAiVision(options, runtime);
      }

      if (provider === 'huggingface') {
        try {
          return await runHuggingFaceVision(options, runtime);
        } catch (error) {
          errors.push(`[huggingface:vision] ${error.message}`);
          if (options.disableHfCaptionFallback === true) {
            continue;
          }
          return await runHuggingFaceCaption(options, runtime);
        }
      }

      if (provider === 'fal') {
        return await runFalVision(options, runtime);
      }

      errors.push(`[${provider}] Unsupported provider`);
    } catch (error) {
      errors.push(`[${provider}] ${error.message}`);
    }
  }

  throw new Error(`Vision helper failed for all providers: ${errors.join(' | ')}`);
}

export function createVisionHelper(defaultOptions = {}, runtime = {}) {
  return async function runVisionModel(options = {}) {
    return visionModel({ ...defaultOptions, ...options }, runtime);
  };
}

export default {
  createVisionHelper,
  imagePathToDataUrl,
  normalizeVisionImageInput,
  resolveFalKey,
  resolveHuggingFaceToken,
  resolveHfSpaceId,
  resolveOpenAiKey,
  resolveOpenAiModel,
  resolveLmStudioModel,
  resolveLmStudioUrl,
  visionModel,
};
