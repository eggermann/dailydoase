import { expect, jest, test } from '@jest/globals';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';

import {
  createSelfomatAdmission,
  createSelfomatAnnouncement,
  createSelfomatSession,
} from './selfomat-session.js';

test('selfomat accepts every newly submitted image that contains people', () => {
  const admission = createSelfomatAdmission();

  expect(admission.inspect({ hash: 'person-a', peopleCount: 1 })).toBe(true);
  expect(admission.inspect({ hash: 'person-a', peopleCount: 1 })).toBe(true);
  expect(admission.inspect({ hash: 'person-b', peopleCount: 2 })).toBe(true);
  expect(admission.inspect({ hash: 'empty-frame', peopleCount: 0 })).toBe(false);
  expect(admission.snapshot()).toMatchObject({ acceptedImages: 3 });
});

test('selfomat announcement describes only planned interaction text', async () => {
  const client = {
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue({
          choices: [{
            message: {
              content: 'Ich seh dich. Gleich winkst du einer Erinnerung zu, drehst dich mit ihr im Kreis und ihr lacht beide in die schiefe Kamera.',
            },
          }],
        }),
      },
    },
  };

  const message = await createSelfomatAnnouncement({
    client,
    model: 'test-model',
    scenePlan: [{ actorsInteraction: 'They wave.' }],
  });

  expect(message).toMatch(/^Ich seh dich\./);
  expect(client.chat.completions.create).toHaveBeenCalledWith(expect.objectContaining({
    model: 'test-model',
  }));
});

test('selfomat announcement falls back without stopping the render when text generation fails', async () => {
  const client = { chat: { completions: { create: jest.fn().mockRejectedValue(new Error('temporary failure')) } } };
  await expect(createSelfomatAnnouncement({ client, model: 'test-model', scenePlan: [] }))
    .resolves.toMatch(/^Ich seh dich\./);
});

test('selfomat display serves the live rendering announcement', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'selfomat-session-'));
  const session = await createSelfomatSession({ directory, port: 0 });
  try {
    await session.publish({ phase: 'rendering', message: 'Ich seh dich. Gleich winkst du einer Erinnerung zu.' });
    const response = await fetch(`${session.url}/status`);
    await expect(response.json()).resolves.toMatchObject({
      phase: 'rendering',
      message: 'Ich seh dich. Gleich winkst du einer Erinnerung zu.',
    });
  } finally {
    await session.close();
    await fs.remove(directory);
  }
});
