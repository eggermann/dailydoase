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

test('extractVisionSections treats continuity notes for next shot as continuity', () => {
  const sections = extractVisionSections([
    'Subject: Man in center of frame',
    'Actors: Man: Bald, wearing dark jacket, glasses, short beard',
    'Continuity Notes for Next Shot: Maintain the same angle and framing of the subject. Keep the indoor setting consistent.',
  ].join(' '));

  expect(sections).toEqual(expect.objectContaining({
    subject: 'Man in center of frame',
    actors: 'Man: Bald, wearing dark jacket, glasses, short beard',
    continuity: 'Maintain the same angle and framing of the subject. Keep the indoor setting consistent',
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

test('extractVisionStoryContext parses pseudo-JSON actor arrays with trailing punctuation', () => {
  const context = extractVisionStoryContext([
    'Location: Ceiling visible.',
    'Actors: [{"reference":"the actor","description":"1. Man (Primary) - Middle-aged, balding, goatee, wearing a dark jacket over a dark shirt"}].',
    'Description: the man in a contemplative pose under fluorescent light.',
  ].join(' '));

  expect(context.actors).toEqual([
    {
      reference: 'the actor',
      description: 'Man (Primary) - Middle-aged, balding, goatee, wearing a dark jacket over a dark shirt',
    },
  ]);
  expect(context.actorIdentity).toBe('Man (Primary) - Middle-aged, balding, goatee, wearing a dark jacket over a dark shirt');
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
  expect(prompt).toContain('Continuity: keep the same actor identity, desk, artwork, and window side of the room');
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
  expect(prompt).toContain('Identity lock: keep bald man with glasses and a dark sweater as the exact same person from the source frame');
  expect(prompt).toContain('Framing lock: keep the same actor identity, desk, artwork, and window side of the room');
  expect(prompt).toContain('Action: Hold the desk shot, then let the subject tense up and glance toward the window.');
  expect(prompt).toContain('Beat: the room feels wrong for the first time.');
  expect(prompt).toContain('Continuity: keep the same actor identity, desk, artwork, and window side of the room.');
  expect(prompt).toContain('Motion: small inhale, eyes shift, shoulders tighten.');
  expect(prompt).toContain('Camera: subtle handheld drift inward.');
  expect(prompt).toContain('Keep readable: the desk shot holds on tense shoulders and a fixed look toward the window.');
  expect(prompt).toContain('End state: the shot tightens as the shoulders rise and the room feels more ominous.');
  expect(prompt).toContain('By the end, the same actor and same setting should still read clearly');
});

test('buildCameraGroundedPrompt trims redundant single-image continuity and weak location fragments', () => {
  const prompt = buildCameraGroundedPrompt({
    basePrompt: 'He pauses and thinks.',
    storyBeat: 'the thought settles in',
    imageDescription: 'the man in a contemplative pose under fluorescent light',
    motionCue: 'eyes shift slightly to the left',
    cameraCue: 'slow push in on the face',
    startVision: [
      'Location: Ceiling visible.',
      'Actors: 1. Bald man in a dark jacket.',
      'Description: the man in a contemplative pose under fluorescent light.',
      'Continuity: Maintain consistency in: the man in a contemplative pose under fluorescent light.',
    ].join(' '),
    useSingleImage: true,
  });

  expect(prompt).toContain('Same actor: Bald man in a dark jacket.');
  expect(prompt).toContain('Identity lock: keep Bald man in a dark jacket as the exact same person from the source frame');
  expect(prompt).not.toContain('Same location: Ceiling visible.');
  expect(prompt).not.toContain('Continuity:');
  expect(prompt).toContain('Keep readable: the man in a contemplative pose under fluorescent light.');
});

test('buildCameraGroundedPrompt falls back to room-grounded continuity when no actor is visible', () => {
  const prompt = buildCameraGroundedPrompt({
    basePrompt: 'The room tightens and the frame starts to search the ceiling and wall line.',
    storyBeat: 'the cue changes the room itself',
    imageDescription: 'utility ceiling, wall line, and fluorescent fixtures stay readable in the room',
    motionCue: 'light and crop pressure shift across the ceiling line',
    cameraCue: 'the camera drifts slightly toward the wall line',
    startVision: [
      'Location: Indoor.',
      'Actors: (None visibly present in the frame)*.',
      'Description: The shot captures a utility-focused ceiling setup, dominated by exposed white-painted concrete surfaces and ducts.',
    ].join(' '),
    useSingleImage: true,
  });

  expect(prompt).not.toContain('Same actor:');
  expect(prompt).not.toContain('(None visibly present in the frame)');
  expect(prompt).toContain('Identity lock: keep the same visible shot identity from the source frame');
  expect(prompt).toContain('Keep readable: The shot captures a utility-focused ceiling setup');
});

test('buildCameraGroundedPrompt handles summarized setup labels without leaking actor JSON', () => {
  const prompt = buildCameraGroundedPrompt({
    storyBeat: 'the scene introduces the man\'s anxiety about cooking, hinting at deeper issues',
    motionCue: 'The man\'s hands shake as he cuts vegetables',
    cameraCue: 'The camera slowly zooms in on the man\'s face to capture his expression',
    startVision: [
      'Location: Ceiling visible.',
      'Actors: [{"reference":"the actor","description":"1. Man (Primary) - Middle-aged, balding, goatee, wearing a dark jacket over a dark shirt"}].',
      'Setup: Close-up of head and upper shoulders Slightly tilted upward angle in Ceiling visible under Soft, even lighting from above/left Minimal shadows under chin and on forehead.',
    ].join(' '),
    useSingleImage: true,
  });

  expect(prompt).toContain('Same actor: Man (Primary) - Middle-aged, balding, goatee, wearing a dark jacket over a dark shirt.');
  expect(prompt).not.toContain('"reference"');
  expect(prompt).not.toContain('Same location: Ceiling visible.');
  expect(prompt).toContain('Keep readable: Close-up of head and upper shoulders Slightly tilted upward angle in Ceiling visible under Soft, even lighting');
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
  expect(prompt).toContain('Action: The man notices the figure near the window and braces himself.');
  expect(prompt).toContain('male actor (bald man with glasses and a dark sweater)');
  expect(prompt).toContain('shadow figure (tall dark silhouette near the window)');
  expect(prompt).toContain('Keep readable: Framing: medium shot from desk height.');
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
  expect(prompt).toContain('Action: He rises from the desk and crosses toward the window as the camera drives in after him.');
  expect(prompt).toContain('Motion: he rises sharply and crosses the room.');
  expect(prompt).toContain('Camera: the camera pushes with him toward the window.');
  expect(prompt).toContain('Keep readable: the desk shot holds on tense shoulders and a fixed look toward the window.');
});

test('buildCameraGroundedPrompt adds anti-freeze guidance for short camera single-image shots', () => {
  const prompt = buildCameraGroundedPrompt({
    basePrompt: 'He startles and looks back over his shoulder.',
    storyBeat: 'the room suddenly feels unsafe',
    stillPrompt: 'the man freezes halfway through the turn',
    imageDescription: 'his shoulder turn and alarmed face stay readable in the office',
    motionCue: 'he snaps his head toward the doorway',
    cameraCue: 'the camera tilts with the reaction',
    durationSeconds: 1.2,
    startVision: START_VISION,
    useSingleImage: true,
  });

  expect(prompt).toContain('Timing: one 1.2-second held shot with one continuous motion arc.');
  expect(prompt).toContain('Fit the action to a 1.2-second held shot: play one immediate readable beat and avoid a frozen hold.');
  expect(prompt).toContain('Action: He startles and looks back over his shoulder.');
});
