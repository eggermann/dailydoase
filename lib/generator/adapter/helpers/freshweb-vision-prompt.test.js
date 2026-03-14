import { expect, test } from '@jest/globals';

import {
  extractVisionSections,
  extractVisionStoryContext,
  summarizeVisionStoryContext,
} from './frame-vision.js';
import {
  buildCameraGroundedPrompt,
  buildVisionAwarePrompt,
  DEFAULT_FRESHWEB_VISION_PROMPT,
} from './freshweb-vision-prompt.js';

const START_VISION = [
  'Subject: a bald man with glasses at a desk.',
  'Setting: an industrial-style room with a window and framed artwork.',
  'Framing: medium webcam shot from desk height.',
  'Lighting: soft side window light.',
  'Location: an industrial-style room with a window and framed artwork.',
  'Actors: Male Actor: bald man with glasses and a dark sweater.',
  'Description: the desk shot holds on tense shoulders and a fixed look toward the window.',
  'Continuity: keep the same actor identity, desk, artwork, and window side of the room.',
].join(' ');

const END_VISION = [
  'Subject: the same man turned toward the window with raised shoulders.',
  'Setting: the same room, now framed tighter toward the window side.',
  'Location: the same room, framed tighter toward the window side.',
  'Actors: Male Actor: the same bald man with glasses turned toward the window.',
  'Description: the shot tightens as the shoulders rise and the room feels more ominous.',
].join(' ');

test('default freshweb vision prompt requests Location, Actors, and Description', () => {
  expect(DEFAULT_FRESHWEB_VISION_PROMPT).toContain('Location');
  expect(DEFAULT_FRESHWEB_VISION_PROMPT).toContain('Actors');
  expect(DEFAULT_FRESHWEB_VISION_PROMPT).toContain('Description');
});

test('extractVisionSections parses labeled vision output', () => {
  expect(extractVisionSections(START_VISION)).toEqual(expect.objectContaining({
    subject: 'a bald man with glasses at a desk',
    setting: 'an industrial-style room with a window and framed artwork',
    framing: 'medium webcam shot from desk height',
    lighting: 'soft side window light',
    location: 'an industrial-style room with a window and framed artwork',
    actors: 'Male Actor: bald man with glasses and a dark sweater',
    description: 'the desk shot holds on tense shoulders and a fixed look toward the window',
    continuity: 'keep the same actor identity, desk, artwork, and window side of the room',
  }));
});

test('summarizeVisionStoryContext keeps location and actors for planner continuity', () => {
  const summary = summarizeVisionStoryContext(START_VISION);

  expect(summary).toContain('Location: an industrial-style room.');
  expect(summary).toContain('Actors: [{"reference":"male actor","description":"bald man with glasses and a dark sweater"}].');
  expect(summary).toContain('Setup: medium webcam shot from desk height in an industrial-style room under soft side window light.');
  expect(summary).toContain('Continuity: keep the same actor identity, desk, artwork, and window side of the room');
});

test('extractVisionStoryContext returns structured location and actors', () => {
  const context = extractVisionStoryContext(START_VISION);

  expect(context.location).toBe('an industrial-style room with a window and framed artwork');
  expect(context.actors).toEqual([
    {
      reference: 'male actor',
      description: 'bald man with glasses and a dark sweater',
    },
  ]);
  expect(context.locationSummary).toBe('an industrial-style room');
  expect(context.actorIdentity).toBe('bald man with glasses and a dark sweater');
  expect(context.setupSummary).toBe('medium webcam shot from desk height in an industrial-style room under soft side window light');
});

test('extractVisionStoryContext falls back to subject and setting when location and actors are missing', () => {
  const context = extractVisionStoryContext('Subject: one person at a desk. Setting: a real room with window light.');

  expect(context.location).toBe('a real room with window light');
  expect(context.actors).toEqual([
    {
      reference: 'the actor',
      description: 'one person at a desk',
    },
  ]);
  expect(context.locationAndActors).toBe('one person at a desk in a real room');
  expect(context.description).toContain('one person at a desk');
});

test('buildVisionAwarePrompt uses location, actors, and description as prompt continuity', () => {
  const prompt = buildVisionAwarePrompt({
    basePrompt: 'The subject freezes, then leans toward the window as the room grows tense.',
    startVision: START_VISION,
    endVision: END_VISION,
    useSingleImage: false,
  });

  expect(prompt).toContain('Keep continuity with the same actor, same setting, and same shot family');
  expect(prompt).toContain('bald man with glasses and a dark sweater in an industrial-style room');
  expect(prompt).toContain('Keep the location fixed in an industrial-style room');
  expect(prompt).toContain('By the end, the same actor and same setting should still read clearly');
});

test('buildCameraGroundedPrompt injects location and actor continuity into camera prompts', () => {
  const prompt = buildCameraGroundedPrompt({
    basePrompt: 'Hold the desk shot, then let the subject tense up and glance toward the window.',
    storyBeat: 'the room feels wrong for the first time',
    stillPrompt: 'the man sees his reflection in a dark window while a shadowy figure stands behind him',
    imageDescription: 'a dark window, the reflected face, and the shadowy figure behind him become readable in the office',
    motionCue: 'small inhale, eyes shift, shoulders tighten',
    cameraCue: 'subtle handheld drift inward',
    startVision: START_VISION,
    endVision: END_VISION,
    useSingleImage: false,
  });

  expect(prompt).toContain('Same actor: bald man with glasses and a dark sweater.');
  expect(prompt).toContain('Same location: an industrial-style room.');
  expect(prompt).toContain('Beat: the room feels wrong for the first time.');
  expect(prompt).toContain('Motion: small inhale, eyes shift, shoulders tighten.');
  expect(prompt).toContain('Camera: subtle handheld drift inward.');
  expect(prompt).toContain('Keep readable: a dark window, the reflected face, and the shadowy figure behind him become readable in the office.');
  expect(prompt).toContain('End state: the man sees his reflection in a dark window while a shadowy figure stands behind him.');
  expect(prompt).toContain('By the end, the same actor and same setting should still read clearly');
});

test('buildCameraGroundedPrompt keeps multiple actor identities available', () => {
  const prompt = buildCameraGroundedPrompt({
    basePrompt: 'The man notices the figure near the window and braces himself.',
    storyBeat: 'the room is no longer empty',
    stillPrompt: 'the man faces the window while a shadow figure stands behind him',
    imageDescription: 'the office window and the second figure both become clearly readable in the frame',
    motionCue: 'the man stiffens while the figure holds still',
    cameraCue: 'slow drift to include both figures in frame',
    startVision: [
      'Location: the same office with a desk and window.',
      'Framing: medium shot from desk height.',
      'Lighting: soft overhead lighting.',
      'Actors: Male Actor: bald man with glasses and a dark sweater; Shadow Figure: tall dark silhouette near the window.',
      'Continuity: keep both figures and the office window readable.',
    ].join(' '),
    useSingleImage: true,
  });

  expect(prompt).toContain('Same actors: male actor (bald man with glasses and a dark sweater); shadow figure (tall dark silhouette near the window).');
  expect(prompt).toContain('Same location: the office.');
  expect(prompt).toContain('male actor (bald man with glasses and a dark sweater)');
  expect(prompt).toContain('shadow figure (tall dark silhouette near the window)');
  expect(prompt).toContain('Hold state: the man faces the window while a shadow figure stands behind him.');
});

test('buildCameraGroundedPrompt keeps dynamic transition energy when a single-image scene came from firstLast planning', () => {
  const prompt = buildCameraGroundedPrompt({
    basePrompt: 'He rises from the desk and crosses toward the window as the camera drives in after him.',
    storyBeat: 'the room suddenly closes in',
    stillPrompt: 'the man reaches the window and braces against the frame',
    imageDescription: 'desk, window, and body movement stay readable in the office',
    motionCue: 'he rises sharply and crosses the room',
    cameraCue: 'the camera pushes with him toward the window',
    startVision: START_VISION,
    useSingleImage: true,
    preferDynamicSingleImage: true,
  });

  expect(prompt).toContain('Same actor: bald man with glasses and a dark sweater.');
  expect(prompt).toContain('Same location: an industrial-style room.');
  expect(prompt).toContain('Motion: he rises sharply and crosses the room.');
  expect(prompt).toContain('Camera: the camera pushes with him toward the window.');
  expect(prompt).toContain('Hold state: the man reaches the window and braces against the frame.');
});
