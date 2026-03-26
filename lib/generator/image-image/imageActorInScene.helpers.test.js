import { describe, expect, test } from '@jest/globals';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';

import {
  buildFalImageEditPayload,
  extractFalImageUrl,
  resolveDirectFalImageEditModel,
  shouldUseDirectFalImageEdit,
} from './imageActorInScene.js';

describe('imageActorInScene fal helpers', () => {
  test('maps HF flux kontext models to direct fal ids', () => {
    expect(resolveDirectFalImageEditModel('black-forest-labs/FLUX.1-Kontext-dev')).toBe('fal-ai/flux-kontext/dev');
    expect(resolveDirectFalImageEditModel('fal-ai/flux-kontext/dev')).toBe('fal-ai/flux-kontext/dev');
    expect(resolveDirectFalImageEditModel('Qwen/Qwen-Image-Edit-2511')).toBe('');
  });

  test('uses direct fal only when a FAL key is present and the route is supported', () => {
    expect(shouldUseDirectFalImageEdit({
      model: 'black-forest-labs/FLUX.1-Kontext-dev',
      provider: 'fal-ai',
      falKey: 'fal_test_key',
    })).toBe(true);
    expect(shouldUseDirectFalImageEdit({
      model: 'black-forest-labs/FLUX.1-Kontext-dev',
      provider: 'fal-ai',
      falKey: '',
    })).toBe(false);
    expect(shouldUseDirectFalImageEdit({
      model: 'Qwen/Qwen-Image-Edit-2511',
      provider: 'fal-ai',
      falKey: 'fal_test_key',
    })).toBe(false);
  });

  test('extracts an image url from nested fal result payloads', () => {
    expect(extractFalImageUrl({ images: [{ url: 'https://cdn.example.com/a.png' }] })).toBe('https://cdn.example.com/a.png');
    expect(extractFalImageUrl({ output: { images: [{ url: 'https://cdn.example.com/b.png' }] } })).toBe('https://cdn.example.com/b.png');
    expect(extractFalImageUrl({ response: { data: { image: { url: 'https://cdn.example.com/c.png' } } } })).toBe('https://cdn.example.com/c.png');
  });

  test('builds a direct fal payload from a local input image', async () => {
    const tempPath = path.join(os.tmpdir(), `dailydoase-image-actor-${Date.now()}.png`);
    const onePixelPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6N1ioAAAAASUVORK5CYII=',
      'base64'
    );
    await fs.writeFile(tempPath, onePixelPng);

    try {
      const payload = await buildFalImageEditPayload({
        prompt: 'Keep the shot stable.',
        inputPath: tempPath,
        parameters: {
          guidance_scale: 4,
          num_inference_steps: 20,
          seed: 123,
          negative_prompt: 'mirror flip, double face',
        },
      });

      expect(payload.prompt).toContain('Keep the shot stable.');
      expect(payload.prompt).toContain('Avoid: mirror flip, double face.');
      expect(payload.image_url.startsWith('data:image/png;base64,')).toBe(true);
      expect(payload.guidance_scale).toBe(4);
      expect(payload.num_inference_steps).toBe(20);
      expect(payload.seed).toBe(123);
      expect(payload.output_format).toBe('png');
      expect(payload.resolution_mode).toBe('match_input');
    } finally {
      await fs.remove(tempPath);
    }
  });
});
