import { describe, expect, test } from '@jest/globals';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';

import {
  buildFalImageEditPayload,
  buildRunwareImageEditTask,
  extractFalImageUrl,
  resolveDirectFalImageEditModel,
  resolveRunwareImageEditModel,
  resolveRunwareKontextDimensions,
  shouldUseDirectFalImageEdit,
  shouldUseRunwareImageEdit,
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

describe('imageActorInScene Runware helpers', () => {
  test('routes FLUX Kontext dev through Runware', () => {
    expect(resolveRunwareImageEditModel('black-forest-labs/FLUX.1-Kontext-dev')).toBe('runware:106@1');
    expect(resolveRunwareImageEditModel('black-forest-labs/FLUX.1-Kontext-pro')).toBe('bfl:3@1');
    expect(resolveRunwareImageEditModel('runware:106@1')).toBe('runware:106@1');
    expect(resolveRunwareImageEditModel('black-forest-labs/FLUX.2-flex')).toBe('bfl:6@1');
    expect(shouldUseRunwareImageEdit({
      model: 'runware:106@1',
      provider: 'runware',
      runwareKey: 'runware_test_key',
    })).toBe(true);
  });

  test('maps requested 1088x832 canvas to supported near-4:3 dimensions', () => {
    expect(resolveRunwareKontextDimensions(1088, 832)).toMatchObject({ width: 1184, height: 880 });
  });

  test('builds Runware image edit with primary and camera references', async () => {
    const tempPath = path.join(os.tmpdir(), `dailydoase-runware-actor-${Date.now()}.png`);
    await fs.writeFile(tempPath, Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6N1ioAAAAASUVORK5CYII=',
      'base64'
    ));
    try {
      const task = await buildRunwareImageEditTask({
        model: 'bfl:3@1',
        prompt: 'Keep person and room stable.',
        inputPath: tempPath,
        referencePaths: ['https://example.com/camera.png'],
        parameters: { width: 1088, height: 832, num_inference_steps: 12, guidance_scale: 2, seed: 7 },
        taskUUID: '00000000-0000-4000-8000-000000000001',
      });
      expect(task.model).toBe('bfl:3@1');
      expect(task.inputs.referenceImages).toHaveLength(2);
      expect(task.inputs.referenceImages[0]).toMatch(/^data:image\/png;base64,/);
      expect(task.inputs.referenceImages[1]).toBe('https://example.com/camera.png');
      expect(task.width).toBe(1184);
      expect(task.height).toBe(880);
      expect(task.steps).toBeUndefined();
      expect(task.CFGScale).toBeUndefined();
    } finally {
      await fs.remove(tempPath);
    }
  });

  test('limits Kontext dev to its single supported reference image', async () => {
    const task = await buildRunwareImageEditTask({
      model: 'runware:106@1',
      prompt: 'Keep scene stable.',
      inputPath: 'https://example.com/last-frame.png',
      referencePaths: ['https://example.com/camera.png'],
    });
    expect(task.inputs.referenceImages).toEqual(['https://example.com/last-frame.png']);
  });

  test('keeps at most ten FIFO-selected references for FLUX.2 flex', async () => {
    const task = await buildRunwareImageEditTask({
      model: 'bfl:6@1',
      prompt: 'Keep this ensemble cast consistent.',
      inputPath: 'https://example.com/story-frame.png',
      referencePaths: Array.from(
        { length: 12 },
        (_, index) => `https://example.com/persona-${index + 1}.png`
      ),
    });

    expect(task.inputs.referenceImages).toHaveLength(10);
    expect(task.inputs.referenceImages[0]).toBe('https://example.com/story-frame.png');
    expect(task.inputs.referenceImages.at(-1)).toBe('https://example.com/persona-9.png');
    expect(task.negativePrompt).toBeUndefined();
    expect(task.steps).toBeUndefined();
    expect(task.CFGScale).toBeUndefined();
  });
});
