import { describe, expect, jest, test } from '@jest/globals';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'node:url';

import {
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
} from './vision-model.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURE_DIR = path.join(__dirname, 'test-data');

test('resolve token helpers check common env names', () => {
  expect(resolveHuggingFaceToken({ HUGGINGFACE_API_KEY: 'hf-123' })).toBe('hf-123');
  expect(resolveFalKey({ FAL_API_KEY: 'fal-123' })).toBe('fal-123');
  expect(resolveHfSpaceId({ HF_VISION_SPACE_ID: 'huggingface-projects/llama-3.2-vision-11B' })).toBe('huggingface-projects/llama-3.2-vision-11B');
  expect(resolveOpenAiKey({ OPENAI_API_KEY: 'sk-test' })).toBe('sk-test');
  expect(resolveOpenAiModel({ OPENAI_VISION_MODEL: 'gpt-4o-mini' })).toBe('gpt-4o-mini');
  expect(resolveLmStudioUrl({ LMSTUDIO_URL: 'http://192.168.1.2:1234' })).toBe('http://192.168.1.2:1234');
  expect(resolveLmStudioModel({ LMSTUDIO_MODEL: 'mistralai/ministral-3-3b' })).toBe('mistralai/ministral-3-3b');
});

test('normalizeVisionImageInput keeps remote urls as-is', async () => {
  const out = await normalizeVisionImageInput({ imageUrl: 'https://example.com/a.png' });
  expect(out).toEqual({
    imageSource: 'https://example.com/a.png',
    sourceType: 'url',
  });
});

test('imagePathToDataUrl converts a local file into a data uri', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vision-helper-'));
  const imgPath = path.join(tmpDir, 'sample.png');
  await fs.writeFile(imgPath, Buffer.from('png-binary'));

  const result = await imagePathToDataUrl(imgPath);
  expect(result.startsWith('data:image/png;base64,')).toBe(true);
});

test('visionModel prefers Hugging Face multimodal output when available', async () => {
  const result = await visionModel(
    {
      imageUrl: 'https://example.com/cat.png',
      prompt: 'What is in this image?',
    },
    {
      env: { HF_API_TOKEN: 'hf-token' },
      hfClient: {
        chatCompletion: jest.fn().mockResolvedValue({
          choices: [{ message: { content: 'A cat on a chair.' } }],
        }),
      },
    }
  );

  expect(result.provider).toBe('huggingface');
  expect(result.outputText).toBe('A cat on a chair.');
});

test('visionModel prefers LM Studio by default and sends a camera image as image_url content', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vision-lmstudio-camera-'));
  const cameraImagePath = path.join(tmpDir, 'camera-shot.jpg');
  await fs.writeFile(cameraImagePath, Buffer.from('jpeg-binary'));

  const fetchImpl = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => JSON.stringify({
      choices: [{ message: { content: 'Desk scene, warm room light, frontal webcam framing.' } }],
    }),
  });

  const result = await visionModel(
    {
      imagePath: cameraImagePath,
      prompt: 'Describe only the visible shot for the next camera scene.',
      systemPrompt: 'You are a camera scene parser.',
      maxTokens: 120,
    },
    {
      env: {
        LMSTUDIO_URL: 'http://192.168.1.2:1234',
        LMSTUDIO_MODEL: 'mistralai/ministral-3-3b',
      },
      fetchImpl,
    }
  );

  expect(fetchImpl).toHaveBeenCalledTimes(1);
  const [url, requestInit] = fetchImpl.mock.calls[0];
  expect(url).toBe('http://192.168.1.2:1234/v1/chat/completions');

  const body = JSON.parse(requestInit.body);
  const fixturePath = path.join(FIXTURE_DIR, 'vision-model.lmstudio.camera.json');
  await fs.ensureDir(FIXTURE_DIR);
  await fs.writeJson(
    fixturePath,
    {
      endpoint: url,
      request: body,
      response: result,
    },
    { spaces: 2 }
  );
  console.log(`[vision-model.test] saved LM Studio camera fixture: ${fixturePath}`);

  expect(body.model).toBe('mistralai/ministral-3-3b');
  expect(body.messages[0]).toEqual({
    role: 'system',
    content: 'You are a camera scene parser.',
  });
  expect(body.messages[1].role).toBe('user');
  expect(body.messages[1].content[0]).toEqual({
    type: 'text',
    text: 'Describe only the visible shot for the next camera scene.',
  });
  expect(body.messages[1].content[1].type).toBe('image_url');
  expect(body.messages[1].content[1].image_url.url.startsWith('data:image/jpeg;base64,')).toBe(true);

  expect(result.provider).toBe('lmstudio');
  expect(result.outputText).toContain('Desk scene');
});

test('visionModel falls back to HF Space when LM Studio is unavailable', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vision-hfspace-camera-'));
  const cameraImagePath = path.join(tmpDir, 'camera-shot.jpg');
  await fs.writeFile(cameraImagePath, Buffer.from('jpeg-binary'));

  const predict = jest.fn().mockResolvedValue({
    data: ['Studio portrait with overhead light and consistent close framing.'],
  });

  const result = await visionModel(
    {
      imagePath: cameraImagePath,
      prompt: 'Describe only the visible shot.',
      providers: ['lmstudio', 'hfspace'],
    },
    {
      env: {
        HF_API_TOKEN: 'hf-token',
        HF_VISION_SPACE_ID: 'huggingface-projects/llama-3.2-vision-11B',
      },
      fetchImpl: jest.fn().mockRejectedValue(new Error('connect ECONNREFUSED')),
      gradioClient: {
        connect: jest.fn().mockResolvedValue({ predict }),
      },
      gradioHandleFile: jest.fn((value) => ({ path: value })),
    }
  );

  expect(result.provider).toBe('hfspace');
  expect(result.model).toBe('huggingface-projects/llama-3.2-vision-11B');
  expect(result.outputText).toContain('consistent close framing');
  expect(predict).toHaveBeenCalledWith('/chat', expect.objectContaining({
    message: expect.objectContaining({
      text: 'Describe only the visible shot.',
    }),
    max_new_tokens: 250,
  }));
});

test.each(['localMistral', 'mac-mini-vision'])('visionModel accepts %s as an LM Studio alias', async (provider) => {
  const fetchImpl = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => JSON.stringify({
      choices: [{ message: { content: 'Visible person near a desk.' } }],
    }),
  });

  const result = await visionModel(
    {
      imageUrl: 'https://example.com/person.jpg',
      prompt: 'Describe the visible person only.',
      providers: [provider],
    },
    {
      env: {
        LMSTUDIO_URL: 'http://127.0.0.1:1234',
        LMSTUDIO_MODEL: 'mistralai/ministral-3-3b',
      },
      fetchImpl,
    }
  );

  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(result.provider).toBe('lmstudio');
  expect(result.outputText).toContain('Visible person');
});

test('visionModel falls back to OpenAI after LM Studio and HF Space fail', async () => {
  const result = await visionModel(
    {
      imageUrl: 'https://example.com/portrait.jpg',
      prompt: 'Describe only the visible shot.',
      providers: ['lmstudio', 'hfspace', 'openai'],
    },
    {
      env: {
        OPENAI_API_KEY: 'sk-test',
        OPENAI_VISION_MODEL: 'gpt-4o-mini',
      },
      fetchImpl: jest.fn().mockRejectedValue(new Error('connect ECONNREFUSED')),
      gradioClient: {
        connect: jest.fn().mockRejectedValue(new Error('space unavailable')),
      },
      gradioHandleFile: jest.fn((value) => ({ path: value })),
      openaiClient: {
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue({
              choices: [{ message: { content: 'Close portrait, indoor studio, soft overhead light.' } }],
            }),
          },
        },
      },
    }
  );

  expect(result.provider).toBe('openai');
  expect(result.model).toBe('gpt-4o-mini');
  expect(result.outputText).toContain('indoor studio');
});

test('visionModel falls back to HF image caption if multimodal chat fails', async () => {
  const result = await visionModel(
    {
      imageUrl: 'https://example.com/dog.png',
    },
    {
      env: { HF_API_TOKEN: 'hf-token' },
      hfClient: {
        chatCompletion: jest.fn().mockRejectedValue(new Error('router unsupported')),
        imageToText: jest.fn().mockResolvedValue({ generated_text: 'a dog in a field' }),
      },
    }
  );

  expect(result.provider).toBe('huggingface');
  expect(result.outputText).toBe('a dog in a field');
});

test('visionModel falls back to fal when Hugging Face is unavailable', async () => {
  const fetchImpl = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => JSON.stringify({ output: 'worker wearing gloves and a helmet' }),
  });

  const result = await visionModel(
    {
      imageUrl: 'https://example.com/worker.jpg',
      prompt: 'List the safety measures',
      providers: ['fal'],
    },
    {
      env: { FAL_KEY: 'fal-token' },
      fetchImpl,
    }
  );

  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(result.provider).toBe('fal');
  expect(result.outputText).toContain('helmet');
});

describe('createVisionHelper', () => {
  test('applies defaults and runtime injection', async () => {
    const helper = createVisionHelper(
      {
        prompt: 'Default prompt',
      },
      {
        env: { HF_API_TOKEN: 'hf-token' },
        hfClient: {
          chatCompletion: jest.fn().mockResolvedValue({
            choices: [{ message: { content: 'default result' } }],
          }),
        },
      }
    );

    const result = await helper({
      imageUrl: 'https://example.com/default.png',
    });

    expect(result.outputText).toBe('default result');
  });

  test('keeps LM Studio defaults for camera-style helper calls', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify({
        choices: [{ message: { content: 'Close camera still of a person at a desk.' } }],
      }),
    });

    const helper = createVisionHelper(
      {
        prompt: 'Describe the current camera shot.',
      },
      {
        env: {
          LMSTUDIO_URL: 'http://127.0.0.1:1234',
          LMSTUDIO_MODEL: 'mistralai/ministral-3-3b',
        },
        fetchImpl,
      }
    );

    const result = await helper({
      imageUrl: 'https://example.com/camera.jpg',
    });

    expect(result.provider).toBe('lmstudio');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test('uses HF Space as the next default fallback after LM Studio', async () => {
    const helper = createVisionHelper(
      {
        prompt: 'Describe the current camera shot.',
      },
      {
        env: {
          HF_API_TOKEN: 'hf-token',
          HF_VISION_SPACE_ID: 'huggingface-projects/llama-3.2-vision-11B',
        },
        fetchImpl: jest.fn().mockRejectedValue(new Error('connect ECONNREFUSED')),
        gradioClient: {
          connect: jest.fn().mockResolvedValue({
            predict: jest.fn().mockResolvedValue({
              data: ['Close camera still of a person in a studio.'],
            }),
          }),
        },
        gradioHandleFile: jest.fn((value) => ({ path: value })),
      }
    );

    const result = await helper({
      imageUrl: 'https://example.com/camera.jpg',
    });

    expect(result.provider).toBe('hfspace');
  });
});
