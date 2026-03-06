import { describe, expect, jest, test } from '@jest/globals';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';

import {
  createVisionHelper,
  imagePathToDataUrl,
  normalizeVisionImageInput,
  resolveFalKey,
  resolveHuggingFaceToken,
  visionModel,
} from './vision-model.js';

test('resolve token helpers check common env names', () => {
  expect(resolveHuggingFaceToken({ HUGGINGFACE_API_KEY: 'hf-123' })).toBe('hf-123');
  expect(resolveFalKey({ FAL_API_KEY: 'fal-123' })).toBe('fal-123');
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
});
