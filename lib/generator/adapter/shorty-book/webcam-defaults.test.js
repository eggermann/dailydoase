import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@jest/globals';

import {
  DEFAULT_WEBCAM_CAMERA_SCENE_SYSTEM_PROMPT,
  applyWebcamScenePlanVideoModeDefaults,
  createWebcamFirstLastPrompt,
  createWebcamSingleImagePrompt,
  describeWebcamCameraScenePlanIssues,
  resolveWebcamScenePlanSystemPrompt,
  saveWebcamScenePlanArtifact,
  sanitizeWebcamCameraScenePlan,
} from './webcam-defaults.js';

test('resolveWebcamScenePlanSystemPrompt prefers camera-specific prompt in camera mode', () => {
  expect(resolveWebcamScenePlanSystemPrompt({
    configMode: 'camera',
    scenePlanSystemPrompt: 'general-scene-prompt',
    cameraScenePlanSystemPrompt: 'camera-scene-prompt',
  })).toBe('camera-scene-prompt');
});

test('resolveWebcamScenePlanSystemPrompt falls back to general prompt before camera default', () => {
  expect(resolveWebcamScenePlanSystemPrompt({
    configMode: 'camera',
    scenePlanSystemPrompt: 'general-scene-prompt',
  })).toBe('general-scene-prompt');
});

test('resolveWebcamScenePlanSystemPrompt uses camera default when no override is provided', () => {
  expect(resolveWebcamScenePlanSystemPrompt({
    configMode: 'camera',
  })).toBe(DEFAULT_WEBCAM_CAMERA_SCENE_SYSTEM_PROMPT);
});

test('camera default prompt tells the planner to choose frameSource and videoMode from the story point', () => {
  expect(DEFAULT_WEBCAM_CAMERA_SCENE_SYSTEM_PROMPT).toContain(
    'first decide the new story point or subscene moment, then choose frameSource and videoMode to fit that moment'
  );
  expect(DEFAULT_WEBCAM_CAMERA_SCENE_SYSTEM_PROMPT).toContain(
    'source cues must shape the emotional arc and implied off-screen story inside the real shot'
  );
  expect(DEFAULT_WEBCAM_CAMERA_SCENE_SYSTEM_PROMPT).toContain(
    'Treat the source screenshot as the stage for a curious spectacle shaped by the wordstream'
  );
  expect(DEFAULT_WEBCAM_CAMERA_SCENE_SYSTEM_PROMPT).toContain(
    'do not turn the source cues into a generic host presentation, review, explanation, or discussion'
  );
  expect(DEFAULT_WEBCAM_CAMERA_SCENE_SYSTEM_PROMPT).toContain(
    'show the subject reacting to it, remembering it, craving it, or fearing it inside the real shot'
  );
  expect(DEFAULT_WEBCAM_CAMERA_SCENE_SYSTEM_PROMPT).toContain(
    'keep the location static across the sequence and follow the beat through expression, gesture, props, framing, and lighting inside that same space'
  );
  expect(DEFAULT_WEBCAM_CAMERA_SCENE_SYSTEM_PROMPT).toContain(
    'Default to videoMode "singleImage" in camera mode when in doubt'
  );
  expect(DEFAULT_WEBCAM_CAMERA_SCENE_SYSTEM_PROMPT).toContain(
    'Choose videoMode "singleImage" when the subscene is mainly one held visual state with believable internal motion.'
  );
  expect(DEFAULT_WEBCAM_CAMERA_SCENE_SYSTEM_PROMPT).toContain(
    'Choose videoMode "firstLast" only when the subscene should travel from the current frame toward a small, clearly believable destination setup in the same real room and subject continuity.'
  );
  expect(DEFAULT_WEBCAM_CAMERA_SCENE_SYSTEM_PROMPT).toContain(
    'After scene 1, keep later camera scenes chained from the previous generated last frame instead of restarting from a fresh webcam shot.'
  );
  expect(DEFAULT_WEBCAM_CAMERA_SCENE_SYSTEM_PROMPT).toContain(
    'Do not force firstLast just to create variety; continuity is more important than mode variety in camera mode.'
  );
  expect(DEFAULT_WEBCAM_CAMERA_SCENE_SYSTEM_PROMPT).toContain(
    'For every later firstLast camera scene, set useCameraShot=true and freshImage=false.'
  );
  expect(DEFAULT_WEBCAM_CAMERA_SCENE_SYSTEM_PROMPT).toContain(
    'Before you output JSON, check that every later singleImage scene starts from lastFrame and that every firstLast camera scene has useCameraShot=true.'
  );
  expect(DEFAULT_WEBCAM_CAMERA_SCENE_SYSTEM_PROMPT).toContain(
    'Do not let the last two scenes repeat the same confrontation, determination, or payoff beat.'
  );
});

test('applyWebcamScenePlanVideoModeDefaults forces first clip to singleImage', () => {
  const scenePlan = applyWebcamScenePlanVideoModeDefaults(
    [
      { title: 'Opening', videoMode: 'firstLast' },
      { title: 'Middle', videoMode: 'firstLast' },
    ],
    {
      resolveConfiguredVideoMode: () => 'firstLast',
      scenePlanControlsVideoMode: true,
    }
  );

  expect(scenePlan[0].videoMode).toBe('singleImage');
  expect(scenePlan[1].videoMode).toBe('firstLast');
  expect(scenePlan[1].originalVideoMode).toBe('firstLast');
});

test('applyWebcamScenePlanVideoModeDefaults can override later scenes from configured defaults', () => {
  const scenePlan = applyWebcamScenePlanVideoModeDefaults(
    [
      { title: 'Opening', videoMode: 'firstLast' },
      { title: 'Middle', videoMode: 'firstLast' },
      { title: 'Ending', videoMode: 'firstLast' },
    ],
    {
      resolveConfiguredVideoMode: ({ isLast }) => (isLast ? 'firstLast' : 'singleImage'),
      scenePlanControlsVideoMode: false,
    }
  );

  expect(scenePlan.map((scene) => scene.videoMode)).toEqual([
    'singleImage',
    'singleImage',
    'firstLast',
  ]);
});

test('sanitizeWebcamCameraScenePlan forces first scene to singleImage from fresh webcam shot', () => {
  const scenePlan = sanitizeWebcamCameraScenePlan([
    {
      title: 'Opening',
      videoMode: 'firstLast',
      frameSource: 'lastFrame',
      freshImage: false,
      useCameraShot: false,
    },
  ]);

  expect(scenePlan[0]).toMatchObject({
    videoMode: 'singleImage',
    frameSource: 'newImage',
    freshImage: true,
    useCameraShot: true,
  });
});

test('sanitizeWebcamCameraScenePlan repairs only illegal firstLast camera combinations', () => {
  const scenePlan = sanitizeWebcamCameraScenePlan([
    {
      title: 'Opening',
      videoMode: 'singleImage',
      frameSource: 'newImage',
      freshImage: true,
      useCameraShot: true,
    },
    {
      title: 'Later',
      videoMode: 'firstLast',
      frameSource: 'newImage',
      freshImage: true,
      useCameraShot: false,
    },
  ]);

  expect(scenePlan[1]).toMatchObject({
    videoMode: 'firstLast',
    frameSource: 'lastFrame',
    useCameraShot: true,
  });
  expect(scenePlan[1].title).toBe('Later');
});

test('sanitizeWebcamCameraScenePlan forces later singleImage scenes to continue from the previous last frame', () => {
  const scenePlan = sanitizeWebcamCameraScenePlan([
    {
      title: 'Opening',
      videoMode: 'singleImage',
      frameSource: 'newImage',
      freshImage: true,
      useCameraShot: true,
    },
    {
      title: 'Reuse last frame',
      videoMode: 'singleImage',
      frameSource: 'lastFrame',
      freshImage: false,
      useCameraShot: false,
    },
    {
      title: 'Fresh webcam',
      videoMode: 'singleImage',
      frameSource: 'newImage',
      freshImage: false,
      useCameraShot: true,
    },
  ]);

  expect(scenePlan[1]).toMatchObject({
    videoMode: 'singleImage',
    frameSource: 'lastFrame',
    freshImage: false,
    useCameraShot: false,
  });
  expect(scenePlan[2]).toMatchObject({
    videoMode: 'singleImage',
    frameSource: 'lastFrame',
    freshImage: false,
    useCameraShot: false,
  });
});

test('sanitizeWebcamCameraScenePlan keeps longer camera plans chained through later singleImage scenes', () => {
  const scenePlan = sanitizeWebcamCameraScenePlan([
    {
      title: 'Opening',
      videoMode: 'singleImage',
      frameSource: 'newImage',
      freshImage: true,
      useCameraShot: true,
    },
    {
      title: 'Beat 2',
      videoMode: 'singleImage',
      frameSource: 'lastFrame',
      freshImage: false,
      useCameraShot: false,
    },
    {
      title: 'Beat 3',
      videoMode: 'firstLast',
      frameSource: 'lastFrame',
      freshImage: false,
      useCameraShot: true,
    },
    {
      title: 'Beat 4',
      videoMode: 'singleImage',
      frameSource: 'lastFrame',
      freshImage: false,
      useCameraShot: false,
    },
    {
      title: 'Beat 5',
      videoMode: 'firstLast',
      frameSource: 'lastFrame',
      freshImage: false,
      useCameraShot: true,
    },
    {
      title: 'Beat 6',
      videoMode: 'singleImage',
      frameSource: 'lastFrame',
      freshImage: false,
      useCameraShot: false,
    },
  ]);

  expect(scenePlan[5]).toMatchObject({
    videoMode: 'singleImage',
    frameSource: 'lastFrame',
    freshImage: false,
    useCameraShot: false,
  });
});

test('sanitizeWebcamCameraScenePlan rewrites camera scenes from source cues and vision without literal prop carryover', () => {
  const scenePlan = sanitizeWebcamCameraScenePlan([
    {
      title: 'Baking the Horror Pie',
      beat: 'The man prepares a strange pie, mixing unusual ingredients.',
      stillPrompt: 'A close-up of a man mixing a dark, viscous filling in a bowl, with a focused expression.',
      imageDescription: 'The man stirs a bowl filled with a thick, dark mixture, surrounded by odd ingredients.',
      storyBeat: 'This scene introduces the unsettling atmosphere as the man begins to create something sinister.',
      motionCue: 'The man stirs the mixture vigorously, glancing around nervously.',
      cameraCue: 'The camera slowly zooms in on the bowl, emphasizing the dark mixture.',
      frameSource: 'newImage',
      videoMode: 'singleImage',
      durationSeconds: 7.2,
      videoPrompt: 'The man stirs a dark mixture in a bowl while the camera zooms in on it.',
      singleImagePrompt: 'The man stirs a dark mixture in a bowl.',
      freshImage: true,
      useCameraShot: false,
    },
    {
      title: 'Hold',
      beat: 'He holds the thought in place.',
      stillPrompt: 'The same man in the same room, holding still.',
      imageDescription: 'The same man in the same room, holding still.',
      storyBeat: 'The scene remains quiet.',
      motionCue: 'He barely moves.',
      cameraCue: 'The shot holds.',
      frameSource: 'lastFrame',
      videoMode: 'singleImage',
      durationSeconds: 2.4,
      videoPrompt: 'He stays still in the room.',
      singleImagePrompt: 'He stays still in the room.',
      freshImage: false,
      useCameraShot: false,
    },
  ], {
    visionStoryContext: 'Location: Appears to be a room. Actors: [{"reference":"the actor","description":"Man (shaved head, wearing dark jacket)"}]. Setup: Close-up to mid-shot, slightly tilted composition from low angle in Appears to be a room under natural light from windows complemented by soft indoor lighting; white wall, glass door, and map stay visible.',
    sourceCues: [
      'American Mary Homity pie',
      'Lexikon der Filmbegriffe Erotic horror',
    ],
  });

  expect(scenePlan[0]).toMatchObject({
    videoMode: 'singleImage',
    frameSource: 'newImage',
    freshImage: true,
    useCameraShot: true,
  });
  expect(scenePlan[0].title).toContain('American Mary Homity Pie');
  expect(scenePlan[0].stillPrompt).toContain('room');
  expect(scenePlan[0].storyBeat).toMatch(/american mary homity pie/i);
  expect(scenePlan[0].videoPrompt).toMatch(/american mary homity pie/i);
  expect(scenePlan[0].videoPrompt).not.toMatch(/bowl|mixture|ingredient|oven/i);
  expect(scenePlan[0].imageDescription).toMatch(/window|wall|glass|map|room/i);

  expect(scenePlan[1]).toMatchObject({
    videoMode: 'singleImage',
    frameSource: 'lastFrame',
    freshImage: false,
    useCameraShot: false,
  });
  expect(scenePlan[1].title).toContain('Lexikon Der Filmbegriffe Erotic Horror');
  expect(scenePlan[1].motionCue).toMatch(/lexikon|filmbegriffe|erotic|horror|wall|door|room/i);
});

test('sanitizeWebcamCameraScenePlan preserves cue-specific planner text when it is already shot-valid', () => {
  const scenePlan = sanitizeWebcamCameraScenePlan([
    {
      title: 'Specific hold',
      beat: 'The cue "chicharr chicken" lands as a quick brace toward the door frame.',
      stillPrompt: 'Bald man in a real room, bracing toward the door frame while the same wall stays readable.',
      imageDescription: 'The bald man remains in the room; the door frame and wall stay visible as his posture tightens.',
      storyBeat: 'The wordstream cue "chicharr chicken" changes the shot through posture and room emphasis around the door frame.',
      motionCue: 'He checks his stance and shifts his gaze toward the door frame.',
      cameraCue: 'The camera leans slightly toward the door frame while holding his face readable.',
      frameSource: 'newImage',
      videoMode: 'singleImage',
      durationSeconds: 3.2,
      videoPrompt: 'The cue lands as a quick brace toward the door frame. He checks his stance and shifts his gaze toward the door frame. The camera leans slightly toward the door frame while holding his face readable.',
      singleImagePrompt: 'Bald man in a real room, bracing toward the door frame while the same wall stays readable. He checks his stance and shifts his gaze toward the door frame.',
      freshImage: true,
      useCameraShot: false,
    },
  ], {
    visionStoryContext: 'Location: Appears to be a room. Actors: [{"reference":"the actor","description":"Bald man in a dark jacket"}]. Setup: Low-angle shot in a room with a wall and door frame.',
    sourceCues: ['chicharr chicken'],
  });

  expect(scenePlan[0].beat).toBe('The cue "chicharr chicken" lands as a quick brace toward the door frame.');
  expect(scenePlan[0].stillPrompt).toBe('Bald man in a real room, bracing toward the door frame while the same wall stays readable.');
  expect(scenePlan[0].storyBeat).toContain('"chicharr chicken"');
});

test('sanitizeWebcamCameraScenePlan rewrites cue-driven literal props that are unsupported by the webcam shot', () => {
  const scenePlan = sanitizeWebcamCameraScenePlan([
    {
      title: 'Mozzarella dread',
      beat: 'The man nervously examines a plate of mozzarella sticks under the dim light.',
      stillPrompt: 'A close-up of the man hovering over a plate of mozzarella sticks.',
      imageDescription: 'The man leans toward a plate of mozzarella sticks while ceiling pipes stay visible.',
      storyBeat: 'The wordstream cue "Postmodern horror Mozzarella sticks" changes the room through the food on the table.',
      motionCue: 'Hands twitching slightly as he hesitates.',
      cameraCue: 'Tilted angle emphasizing the man\'s anxious posture.',
      frameSource: 'newImage',
      videoMode: 'singleImage',
      durationSeconds: 2.3,
      videoPrompt: 'The man hovers over a plate of mozzarella sticks while the camera closes in.',
      singleImagePrompt: 'The man hovers over a plate of mozzarella sticks.',
      freshImage: true,
      useCameraShot: false,
    },
  ], {
    visionStoryContext: 'Location: Ceiling pipes. Actors: [{"reference":"man","description":"Bald man in a black hoodie"}]. Setup: Medium close-up of upper body and hands. Description: Ceiling pipes and upper-body posture stay readable.',
    sourceCues: ['Postmodern horror Mozzarella sticks'],
  });

  const combined = [
    scenePlan[0].beat,
    scenePlan[0].stillPrompt,
    scenePlan[0].imageDescription,
    scenePlan[0].videoPrompt,
    scenePlan[0].singleImagePrompt,
  ].join(' ');

  expect(combined).not.toMatch(/plate|food on the table|hovers over/i);
  expect(scenePlan[0].storyBeat).toMatch(/postmodern horror mozzarella sticks/i);
  expect(scenePlan[0].stillPrompt).toMatch(/ceiling|upper body|hands/i);
});

test('sanitizeWebcamCameraScenePlan rewrites repeated adjacent cue scenes into different dominant motion and camera states', () => {
  const scenePlan = sanitizeWebcamCameraScenePlan([
    {
      title: 'Beat 1',
      beat: 'The room feels tense.',
      stillPrompt: 'The same man in the same room.',
      imageDescription: 'The same man in the same room.',
      storyBeat: 'The room is tense.',
      motionCue: 'He barely moves.',
      cameraCue: 'The shot holds.',
      frameSource: 'newImage',
      videoMode: 'singleImage',
      durationSeconds: 2.4,
      videoPrompt: 'He stays still in the room.',
      singleImagePrompt: 'He stays still in the room.',
      freshImage: true,
      useCameraShot: false,
    },
    {
      title: 'Beat 2',
      beat: 'The room feels tense.',
      stillPrompt: 'The same man in the same room.',
      imageDescription: 'The same man in the same room.',
      storyBeat: 'The room is tense.',
      motionCue: 'He barely moves.',
      cameraCue: 'The shot holds.',
      frameSource: 'lastFrame',
      videoMode: 'singleImage',
      durationSeconds: 2.4,
      videoPrompt: 'He stays still in the room.',
      singleImagePrompt: 'He stays still in the room.',
      freshImage: false,
      useCameraShot: false,
    },
  ], {
    visionStoryContext: 'Location: Appears to be a room. Actors: [{"reference":"the actor","description":"Bald man in a dark jacket"}]. Setup: Low-angle shot with a wall and door frame visible.',
    sourceCues: [
      'chicharr chicken',
      'grand guignol bread',
    ],
  });

  expect(scenePlan[0].storyBeat).toMatch(/chicharr chicken/i);
  expect(scenePlan[1].storyBeat).toMatch(/grand guignol bread/i);
  expect(scenePlan[0].motionCue).not.toBe(scenePlan[1].motionCue);
  expect(scenePlan[0].cameraCue).not.toBe(scenePlan[1].cameraCue);
});

test('sanitizeWebcamCameraScenePlan falls back to room-grounded wording when no actor is visible', () => {
  const scenePlan = sanitizeWebcamCameraScenePlan([
    {
      title: 'Beat 1',
      beat: 'He braces and looks upward.',
      stillPrompt: 'The man in the room suddenly looks up.',
      imageDescription: 'The man and the room both stay visible.',
      storyBeat: 'He reacts to the cue.',
      motionCue: 'He shifts his shoulders and locks his gaze.',
      cameraCue: 'The camera follows his face upward.',
      frameSource: 'newImage',
      videoMode: 'singleImage',
      durationSeconds: 3.2,
      videoPrompt: 'He reacts and looks upward.',
      singleImagePrompt: 'He reacts and looks upward.',
      freshImage: true,
      useCameraShot: false,
    },
  ], {
    visionStoryContext: 'Location: Indoor. Actors: (None visibly present in the frame)*. Description: The shot captures a utility-focused ceiling setup with exposed white-painted surfaces and ducts.',
    sourceCues: ['hammer filme tarantula film'],
  });

  expect(scenePlan[0].storyBeat).toMatch(/hammer filme tarantula film/i);
  expect(scenePlan[0].storyBeat).toMatch(/indoor|ceiling|ducts/i);
  expect(scenePlan[0].motionCue).not.toMatch(/\bhe\b|\bhis\b/i);
  expect(scenePlan[0].cameraCue).not.toMatch(/\bhe\b|\bhis\b/i);
});

test('sanitizeWebcamCameraScenePlan can pull novel screenshot anchors without a fixed room dictionary', () => {
  const scenePlan = sanitizeWebcamCameraScenePlan([
    {
      title: 'Beat 1',
      beat: 'The mood changes.',
      stillPrompt: 'The same person in the same place.',
      imageDescription: 'The same place remains visible.',
      storyBeat: 'Something changes in the room.',
      motionCue: 'He barely moves.',
      cameraCue: 'The shot holds.',
      frameSource: 'newImage',
      videoMode: 'singleImage',
      durationSeconds: 3.2,
      videoPrompt: 'The room holds.',
      singleImagePrompt: 'The room holds.',
      freshImage: true,
      useCameraShot: false,
    },
  ], {
    visionStoryContext: 'Location: A narrow service corridor. Actors: [{"reference":"the actor","description":"Bald man in a dark coat"}]. Description: A fluorescent strip, folding scaffold, checkerboard tile floor, and red hose reel stay visible in the shot.',
    sourceCues: ['curious static relay'],
  });

  const combined = [
    scenePlan[0].beat,
    scenePlan[0].stillPrompt,
    scenePlan[0].imageDescription,
    scenePlan[0].cameraCue,
  ].join(' ');

  expect(scenePlan[0].stillPrompt).toMatch(/fluorescent|scaffold|checkerboard|hose/i);
  expect(combined).toMatch(/fluorescent|scaffold|checkerboard|hose/i);
});

test('configured singleImage override can sanitize a later firstLast scene into a last-frame continuation', () => {
  const configuredPlan = applyWebcamScenePlanVideoModeDefaults(
    [
      {
        title: 'Opening',
        videoMode: 'singleImage',
        frameSource: 'newImage',
        freshImage: true,
        useCameraShot: true,
      },
      {
        title: 'Former transition',
        videoMode: 'firstLast',
        frameSource: 'lastFrame',
        freshImage: false,
        useCameraShot: true,
      },
    ],
    {
      resolveConfiguredVideoMode: () => 'singleImage',
      scenePlanControlsVideoMode: false,
    }
  );

  const scenePlan = sanitizeWebcamCameraScenePlan(configuredPlan);

  expect(scenePlan[1]).toMatchObject({
    videoMode: 'singleImage',
    frameSource: 'lastFrame',
    freshImage: false,
    useCameraShot: false,
  });
});

test('describeWebcamCameraScenePlanIssues reports invalid raw camera combinations', () => {
  expect(describeWebcamCameraScenePlanIssues([
    {
      title: 'Opening',
      videoMode: 'firstLast',
      frameSource: 'lastFrame',
      freshImage: false,
      useCameraShot: false,
    },
    {
      title: 'Later',
      videoMode: 'singleImage',
      frameSource: 'newImage',
      freshImage: false,
      useCameraShot: false,
    },
    {
      title: 'Continue',
      videoMode: 'singleImage',
      frameSource: 'lastFrame',
      freshImage: true,
      useCameraShot: true,
    },
  ])).toEqual([
    'scene 1: opening camera scene must use videoMode "singleImage"',
    'scene 1: opening camera scene must start from frameSource "newImage"',
    'scene 1: opening camera scene must set useCameraShot=true',
    'scene 1: opening camera scene must set freshImage=true',
    'scene 2: later singleImage camera scene must start from frameSource "lastFrame"',
    'scene 3: singleImage camera scene with frameSource "lastFrame" must set useCameraShot=false',
    'scene 3: singleImage camera scene with frameSource "lastFrame" must set freshImage=false',
  ]);
});

test('describeWebcamCameraScenePlanIssues accepts a valid raw camera plan', () => {
  expect(describeWebcamCameraScenePlanIssues([
    {
      title: 'Opening',
      videoMode: 'singleImage',
      frameSource: 'newImage',
      freshImage: true,
      useCameraShot: true,
    },
    {
      title: 'Destination',
      videoMode: 'firstLast',
      frameSource: 'lastFrame',
      freshImage: false,
      useCameraShot: true,
    },
    {
      title: 'Hold',
      videoMode: 'singleImage',
      frameSource: 'lastFrame',
      freshImage: false,
      useCameraShot: false,
    },
  ])).toEqual([]);
});

test('describeWebcamCameraScenePlanIssues allows longer all-singleImage camera continuations', () => {
  expect(describeWebcamCameraScenePlanIssues([
    {
      title: 'Opening',
      videoMode: 'singleImage',
      frameSource: 'newImage',
      freshImage: true,
      useCameraShot: true,
    },
    {
      title: 'Beat 2',
      videoMode: 'singleImage',
      frameSource: 'lastFrame',
      freshImage: false,
      useCameraShot: false,
    },
    {
      title: 'Beat 3',
      videoMode: 'singleImage',
      frameSource: 'lastFrame',
      freshImage: false,
      useCameraShot: false,
    },
    {
      title: 'Beat 4',
      videoMode: 'singleImage',
      frameSource: 'lastFrame',
      freshImage: false,
      useCameraShot: false,
    },
  ])).toEqual([]);
});

test('describeWebcamCameraScenePlanIssues accepts longer camera plans with optional firstLast destinations', () => {
  expect(describeWebcamCameraScenePlanIssues([
    {
      title: 'Opening',
      videoMode: 'singleImage',
      frameSource: 'newImage',
      freshImage: true,
      useCameraShot: true,
    },
    {
      title: 'Beat 2',
      videoMode: 'singleImage',
      frameSource: 'lastFrame',
      freshImage: false,
      useCameraShot: false,
    },
    {
      title: 'Beat 3',
      videoMode: 'singleImage',
      frameSource: 'lastFrame',
      freshImage: false,
      useCameraShot: false,
    },
    {
      title: 'Beat 4',
      videoMode: 'firstLast',
      frameSource: 'lastFrame',
      freshImage: false,
      useCameraShot: true,
    },
    {
      title: 'Beat 5',
      videoMode: 'singleImage',
      frameSource: 'lastFrame',
      freshImage: false,
      useCameraShot: false,
    },
    {
      title: 'Beat 6',
      videoMode: 'singleImage',
      frameSource: 'lastFrame',
      freshImage: false,
      useCameraShot: false,
    },
  ])).toEqual([]);
});

test('saveWebcamScenePlanArtifact writes the camera snapshot payload into the run root', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'webcam-artifact-'));

  try {
    const payload = {
      imagePath: '/tmp/opening-camera.jpg',
      runtimeScenePlan: [
        { index: 1, title: 'Opening' },
      ],
    };

    const targetPath = await saveWebcamScenePlanArtifact({
      outputDir: tmpDir,
      payload,
    });

    expect(targetPath).toBe(path.join(tmpDir, 'scene-generator.camera-snapshot.live-1.json'));
    await expect(fs.readJson(targetPath)).resolves.toEqual(payload);
  } finally {
    await fs.remove(tmpDir);
  }
});

test('createWebcamFirstLastPrompt keeps planned story text in camera mode', async () => {
  const createPrompt = createWebcamFirstLastPrompt({
    configMode: 'camera',
    getFrameVision: async (frame) => (
      frame?.image?.path === 'end.png'
        ? 'Subject: the professor. Setting: the hallway.'
        : 'Subject: the professor. Setting: the study.'
    ),
  });

  const prompt = await createPrompt(
    'ignored start',
    'ignored end',
    { index: 1, durationSeconds: 3.2 },
    {
      scenePlan: [
        {
          index: 1,
          durationSeconds: 4.8,
          storyBeat: 'The lecture turns into a private nightmare.',
          videoPrompt: 'He recoils as the theory stops being abstract and becomes immediate.',
          motionCue: 'He flinches back from the desk.',
          cameraCue: 'The camera edges closer.',
        },
      ],
      startFrame: { image: { path: 'start.png' } },
      endFrame: { image: { path: 'end.png' } },
    }
  );

  expect(prompt).toContain('Beat: The lecture turns into a private nightmare.');
  expect(prompt).toContain('He flinches back from the desk');
  expect(prompt).toContain('The camera edges closer');
  expect(prompt).toContain('Same actor: the professor.');
  expect(prompt).toContain('Same location: the study.');
  expect(prompt).toContain('End state:');
  expect(prompt).not.toContain('Identity lock:');
  expect(prompt).not.toContain('Framing lock:');
});

test('createWebcamSingleImagePrompt keeps planned story text in camera mode', async () => {
  const createPrompt = createWebcamSingleImagePrompt({
    configMode: 'camera',
    getFrameVision: async () => 'Subject: the professor. Setting: the study.',
  });

  const prompt = await createPrompt(
    'ignored start',
    { index: 1, durationSeconds: 3 },
    {
      scenePlan: [
        {
          index: 1,
          durationSeconds: 6.4,
          storyBeat: 'The scholarly mask slips.',
          singleImagePrompt: 'A hint of dread surfaces as he realizes the material is speaking back to him.',
          motionCue: 'His face tightens and his gaze locks upward.',
          cameraCue: 'A slow push-in increases pressure.',
        },
      ],
      startFrame: { image: { path: 'start.png' } },
    }
  );

  expect(prompt).toContain('Beat: The scholarly mask slips.');
  expect(prompt).toContain('Same actor: the professor.');
  expect(prompt).toContain('Same location: the study.');
  expect(prompt).toContain('Motion: His face tightens and his gaze locks upward.');
  expect(prompt).toContain('Camera: A slow push-in increases pressure.');
  expect(prompt).toContain('Timing: one 3-second held shot with one continuous motion arc.');
  expect(prompt).not.toContain('6.4-second held shot');
});

test('createWebcamSingleImagePrompt keeps camera visibility grounded in start vision instead of invented props', async () => {
  const createPrompt = createWebcamSingleImagePrompt({
    configMode: 'camera',
    getFrameVision: async () => [
      'Subject: the traveler.',
      'Setting: the cabin seat.',
      'Description: the traveler in a close-up cabin seat shot under soft overhead light.',
    ].join(' '),
  });

  const prompt = await createPrompt(
    'ignored start',
    { index: 1, durationSeconds: 2.4 },
    {
      scenePlan: [
        {
          index: 1,
          storyBeat: 'He craves fries but keeps the feeling internal.',
          singleImagePrompt: 'He leans toward an imagined plate of fries.',
          stillPrompt: 'A close-up of the traveler staring at a plate of fries.',
          imageDescription: 'The traveler focuses on a plate of fries in front of him.',
          motionCue: 'He leans in slightly and narrows his eyes.',
          cameraCue: 'A slow push-in.',
        },
      ],
      startFrame: { image: { path: 'start.png' } },
    }
  );

  expect(prompt).toContain('Beat: He craves fries but keeps the feeling internal.');
  expect(prompt).toContain('Keep readable: the traveler in a close-up cabin seat shot under soft overhead light.');
  expect(prompt).not.toContain('plate of fries');
});

test('createWebcamSingleImagePrompt keeps transition energy when a firstLast beat is forced to singleImage', async () => {
  const createPrompt = createWebcamSingleImagePrompt({
    configMode: 'camera',
    getFrameVision: async () => 'Subject: the professor. Setting: the study.',
  });

  const prompt = await createPrompt(
    'ignored start',
    { index: 1 },
    {
      scenePlan: [
        {
          index: 1,
          videoMode: 'singleImage',
          originalVideoMode: 'firstLast',
          storyBeat: 'The room closes in around him.',
          videoPrompt: 'He surges up from the desk and the camera pushes toward the window side of the study.',
          singleImagePrompt: 'He looks uneasy in the study.',
          motionCue: 'He rises fast and turns toward the window.',
          cameraCue: 'The camera pushes in with him.',
        },
      ],
      startFrame: { image: { path: 'start.png' } },
    }
  );

  expect(prompt).toContain('Same actor: the professor.');
  expect(prompt).toContain('Same location: the study.');
  expect(prompt).toContain('Beat: The room closes in around him.');
  expect(prompt).toContain('Motion: He rises fast and turns toward the window.');
  expect(prompt).toContain('Camera: The camera pushes in with him.');
});

test('createWebcamSingleImagePrompt locks actor and location continuity to the provided opening vision', async () => {
  const createPrompt = createWebcamSingleImagePrompt({
    configMode: 'camera',
    getFrameVision: async () => [
      'Subject: a balding man with a different jacket in a hallway.',
      'Setting: an indoor hallway.',
      'Actors: Male Actor: balding man with a different jacket, looking alarmed.',
      'Location: an indoor hallway.',
    ].join(' '),
    getContinuityFrameVision: async () => [
      'Subject: the professor.',
      'Setting: the study.',
      'Actors: Male Actor: the professor.',
      'Location: the study.',
    ].join(' '),
  });

  const prompt = await createPrompt(
    'ignored start',
    { index: 1 },
    {
      scenePlan: [
        {
          index: 1,
          storyBeat: 'The room closes in around him.',
          singleImagePrompt: 'He holds still and listens for the next sound.',
          motionCue: 'His shoulders tighten and he looks toward the doorway.',
          cameraCue: 'A slow push-in adds pressure.',
        },
      ],
      startFrame: { image: { path: 'start.png' } },
    }
  );

  expect(prompt).toContain('Same actor: the professor.');
  expect(prompt).toContain('Same location: the study.');
  expect(prompt).not.toContain('different jacket');
  expect(prompt).not.toContain('hallway');
});
