import { expect, test } from '@jest/globals';

import {
  DEFAULT_CAMERA_PRESENCE_PROMPT,
  resolveCameraPresenceDecision,
} from './camera-presence.js';

test('camera presence prompt requests strict yes-no output for real people only', () => {
  expect(DEFAULT_CAMERA_PRESENCE_PROMPT).toContain('PERSON_PRESENT');
  expect(DEFAULT_CAMERA_PRESENCE_PROMPT).toContain('NO_PERSON');
  expect(DEFAULT_CAMERA_PRESENCE_PROMPT).toContain('Ignore posters');
});

test('resolveCameraPresenceDecision detects explicit no-person outputs', () => {
  expect(resolveCameraPresenceDecision('NO_PERSON')).toEqual(expect.objectContaining({
    hasPerson: false,
    status: 'no_person',
  }));

  expect(resolveCameraPresenceDecision('No visible person, empty room.')).toEqual(expect.objectContaining({
    hasPerson: false,
    status: 'no_person',
  }));
});

test('resolveCameraPresenceDecision detects visible people outputs', () => {
  expect(resolveCameraPresenceDecision('PERSON_PRESENT')).toEqual(expect.objectContaining({
    hasPerson: true,
    status: 'person_present',
  }));

  expect(resolveCameraPresenceDecision('Subject: one person with glasses in a room.')).toEqual(expect.objectContaining({
    hasPerson: true,
    status: 'person_present',
  }));
});

test('resolveCameraPresenceDecision stays conservative on ambiguous outputs', () => {
  expect(resolveCameraPresenceDecision('unclear shot, hard to classify')).toEqual(expect.objectContaining({
    hasPerson: false,
    status: 'unknown',
  }));
});
