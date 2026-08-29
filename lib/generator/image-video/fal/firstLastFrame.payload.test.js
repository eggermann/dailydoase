import fs from 'fs-extra';
import os from 'os';
import path from 'node:path';

import { buildFalFirstLastPayload } from './firstLastFrame.js';

describe('buildFalFirstLastPayload', () => {
  const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z0n0AAAAASUVORK5CYII=';
  let tmpStart;
  let tmpEnd;

  beforeAll(async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fal-first-last-payload-'));
    tmpStart = path.join(tmpDir, 'start.png');
    tmpEnd = path.join(tmpDir, 'end.png');
    const pngBuffer = Buffer.from(pngBase64, 'base64');
    await fs.writeFile(tmpStart, pngBuffer);
    await fs.writeFile(tmpEnd, pngBuffer);
  });

  test('uses adapter first-last aliases for fps, steps, and guidance', async () => {
    const payload = await buildFalFirstLastPayload({
      tmpStart,
      tmpEnd,
      model: 'fal-ai/wan-flf2v',
      options: {
        duration_seconds: 2,
        fps: 8,
        steps: 18,
        guidance_scale: 4,
      },
      config: {},
    });

    expect(payload.frames_per_second).toBe(8);
    expect(payload.num_frames).toBe(81);
    expect(payload.num_inference_steps).toBe(18);
    expect(payload.guide_scale).toBe(4);
  });

  test('honors an explicit num_frames override when provided', async () => {
    const payload = await buildFalFirstLastPayload({
      tmpStart,
      tmpEnd,
      model: 'fal-ai/wan-flf2v',
      options: {
        duration_seconds: 2,
        fps: 8,
        num_frames: 33,
      },
      config: {},
    });

    expect(payload.frames_per_second).toBe(8);
    expect(payload.num_frames).toBe(33);
  });

  test('uses Wan 2.7 native first-last fields and exact supported duration', async () => {
    const payload = await buildFalFirstLastPayload({
      tmpStart,
      tmpEnd,
      model: 'fal-ai/wan/v2.7/image-to-video',
      options: {
        duration_seconds: 3,
        width: 1088,
        height: 832,
        seed: 42,
      },
    });

    expect(payload).toMatchObject({
      duration: 3,
      resolution: '720p',
      seed: 42,
      enable_prompt_expansion: false,
    });
    expect(payload.image_url).toMatch(/^data:image\/png;base64,/);
    expect(payload.end_image_url).toMatch(/^data:image\/png;base64,/);
    expect(payload.start_image_url).toBeUndefined();
    expect(payload.num_frames).toBeUndefined();
  });
});
