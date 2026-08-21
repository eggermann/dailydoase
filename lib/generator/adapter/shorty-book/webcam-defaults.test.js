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

test('resolveWebcamScenePlanSystemPrompt prefers reference-image-actor-specific prompt in alias mode', () => {
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

test('resolveWebcamScenePlanSystemPrompt appends trippy guidance for ltxTrippy flavor', () => {
  const prompt = resolveWebcamScenePlanSystemPrompt({
    configMode: 'camera',
    sceneFlavor: 'ltxTrippy',
  });

  expect(prompt).toContain('LTX-TRIPPY: Cues may alter actors');
  expect(prompt).toContain('typography, objects, identity, or the room itself');
  expect(prompt).toContain('Stage one readable event or transformation per scene.');
});

test('camera default prompt keeps creative choices open and enforces only transport state', () => {
  expect(DEFAULT_WEBCAM_CAMERA_SCENE_SYSTEM_PROMPT).toContain('may drift when the story or surreal mode benefits');
  expect(DEFAULT_WEBCAM_CAMERA_SCENE_SYSTEM_PROMPT).toContain('typography, or transformation');
  expect(DEFAULT_WEBCAM_CAMERA_SCENE_SYSTEM_PROMPT).not.toContain('ACTION CONTRACT:');
  expect(DEFAULT_WEBCAM_CAMERA_SCENE_SYSTEM_PROMPT).not.toContain('Actor action remains mandatory');
  expect(DEFAULT_WEBCAM_CAMERA_SCENE_SYSTEM_PROMPT).toContain('MODE STATE MACHINE:');
  expect(DEFAULT_WEBCAM_CAMERA_SCENE_SYSTEM_PROMPT).toContain('Scene 1 is newImage + singleImage + freshImage=true + useCameraShot=true');
  expect(DEFAULT_WEBCAM_CAMERA_SCENE_SYSTEM_PROMPT.length).toBeLessThan(4000);
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

test('sanitizeWebcamCameraScenePlan can reanchor non-trippy camera scenes back to fresh webcam shots', () => {
  const scenePlan = sanitizeWebcamCameraScenePlan([
    {
      title: 'Opening',
      videoMode: 'singleImage',
      frameSource: 'newImage',
      freshImage: true,
      useCameraShot: true,
    },
    {
      title: 'Hold continuity',
      videoMode: 'singleImage',
      frameSource: 'lastFrame',
      freshImage: false,
      useCameraShot: false,
    },
    {
      title: 'Reanchor room',
      videoMode: 'firstLast',
      frameSource: 'lastFrame',
      freshImage: false,
      useCameraShot: true,
    },
  ], {
    cameraReanchorInterval: 2,
  });

  expect(scenePlan[1]).toMatchObject({
    videoMode: 'singleImage',
    frameSource: 'lastFrame',
    freshImage: false,
    useCameraShot: false,
  });
  expect(scenePlan[2]).toMatchObject({
    videoMode: 'singleImage',
    frameSource: 'newImage',
    freshImage: true,
    useCameraShot: true,
  });
});

test('sanitizeWebcamCameraScenePlan changes transport modes without rewriting GPT story fields', () => {
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
  expect(scenePlan[0].title).toBe('Baking the Horror Pie');
  expect(scenePlan[0].stillPrompt).toContain('bowl');
  expect(scenePlan[0].storyBeat).toContain('unsettling atmosphere');
  expect(scenePlan[0].videoPrompt).toContain('dark mixture');

  expect(scenePlan[1]).toMatchObject({
    videoMode: 'singleImage',
    frameSource: 'lastFrame',
    freshImage: false,
    useCameraShot: false,
  });
  expect(scenePlan[1].title).toBe('Hold');
  expect(scenePlan[1].motionCue).toBe('He barely moves.');
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

test('sanitizeWebcamCameraScenePlan does not deterministically replace planner props or actions', () => {
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

  expect(combined).toMatch(/plate|hovers over/i);
  expect(scenePlan[0].storyBeat).toMatch(/postmodern horror mozzarella sticks/i);
  expect(scenePlan[0].stillPrompt).toContain('plate of mozzarella sticks');
});

test('sanitizeWebcamCameraScenePlan leaves repeated story fields for model validation', () => {
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

  expect(scenePlan[0].storyBeat).toBe('The room is tense.');
  expect(scenePlan[1].storyBeat).toBe('The room is tense.');
  expect(scenePlan[0].motionCue).toBe(scenePlan[1].motionCue);
  expect(scenePlan[0].cameraCue).toBe(scenePlan[1].cameraCue);
});

test('sanitizeWebcamCameraScenePlan does not rebuild weak story scenes', () => {
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
      durationSeconds: 3.2,
      videoPrompt: 'He stays still in the room.',
      singleImagePrompt: 'He stays still in the room.',
      freshImage: true,
      useCameraShot: false,
    },
  ], {
    visionStoryContext: 'Location: Appears to be a room. Actors: [{"reference":"the actor","description":"Bald man in a dark jacket"}]. Setup: Low-angle shot with a wall and door frame visible. Description: The wall and door frame stay visible beside the actor.',
    sourceCues: ['grand guignol bread'],
  });

  const combined = [
    scenePlan[0].beat,
    scenePlan[0].storyBeat,
    scenePlan[0].motionCue,
    scenePlan[0].cameraCue,
    scenePlan[0].videoPrompt,
  ].join(' ');

  expect(combined).not.toMatch(/grand guignol bread/i);
  expect(scenePlan[0].motionCue).toBe('He barely moves.');
  expect(scenePlan[0].cameraCue).toBe('The shot holds.');
});

test('sanitizeWebcamCameraScenePlan does not invent room-grounded wording', () => {
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

  expect(scenePlan[0].storyBeat).toBe('He reacts to the cue.');
  expect(scenePlan[0].motionCue).toMatch(/\bhe\b|\bhis\b/i);
  expect(scenePlan[0].cameraCue).toMatch(/\bhe\b|\bhis\b/i);
});

test('sanitizeWebcamCameraScenePlan does not inject screenshot anchors into story fields', () => {
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

  expect(scenePlan[0].stillPrompt).toBe('The same person in the same place.');
  expect(combined).not.toMatch(/fluorescent|scaffold|checkerboard|hose/i);
});

test('sanitizeWebcamCameraScenePlan keeps trippy scene content instead of rewriting it back to webcam-safe coverage', () => {
  const scenePlan = sanitizeWebcamCameraScenePlan([
    {
      title: 'Opening',
      beat: 'The red room blooms with impossible food icons and fever light.',
      stillPrompt: 'The actor stands in a warped kitchen as floating neon snacks orbit the frame.',
      imageDescription: 'A warped kitchen grows crowded with floating neon snacks and liquid shadow.',
      storyBeat: 'The webcam room mutates into a surreal food nightmare.',
      motionCue: 'The actor recoils as the glowing objects circle faster around him.',
      cameraCue: 'The camera creeps forward and reframes with unstable drift.',
      frameSource: 'newImage',
      videoMode: 'singleImage',
      durationSeconds: 2.3,
      videoPrompt: 'The room mutates into a food nightmare and the camera drifts into the hallucination.',
      singleImagePrompt: 'The actor recoils while neon snacks orbit and the room warps around him.',
      freshImage: true,
      useCameraShot: true,
    },
    {
      title: 'Later',
      beat: 'A syrup-black eclipse takes over the ceiling while the room bends.',
      stillPrompt: 'The kitchen ceiling opens into a black eclipse above the actor.',
      imageDescription: 'The room bends upward into a black eclipse and glowing debris.',
      storyBeat: 'The hallucination overtakes the room.',
      motionCue: 'He stumbles back as the eclipse spills shadow through the room.',
      cameraCue: 'The frame tilts and drifts as if seasick.',
      frameSource: 'newImage',
      videoMode: 'singleImage',
      durationSeconds: 1.6,
      videoPrompt: 'The eclipse overtakes the room and the camera tilts into the collapse.',
      singleImagePrompt: 'He stumbles back while the eclipse spills shadow and debris through the room.',
      freshImage: true,
      useCameraShot: true,
    },
    {
      title: 'Reanchor',
      beat: 'The room resets into a fresh nightmare tableau around the actor.',
      stillPrompt: 'A fresh webcam-like reset shot shows the actor inside a warped kitchen of glowing debris.',
      imageDescription: 'The actor reappears in a warped kitchen reset with glowing debris and black syrup light.',
      storyBeat: 'The hallucination re-anchors and then blooms again.',
      motionCue: 'He steadies himself as the new nightmare tableau forms around him.',
      cameraCue: 'The camera starts from a fresh frontal angle and then drifts inward.',
      frameSource: 'newImage',
      videoMode: 'singleImage',
      durationSeconds: 2.2,
      videoPrompt: 'The tableau resets from a fresh shot and swells into another hallucination.',
      singleImagePrompt: 'A fresh reset shot blooms into another hallucination around the actor.',
      freshImage: true,
      useCameraShot: true,
    },
  ], {
    sceneFlavor: 'ltxTrippy',
    visionStoryContext: [
      'Location: a plain kitchen-like room.',
      'Actors: middle-aged bald man in a red shirt.',
      'Description: the actor stands in a webcam view in a plain room.',
    ].join(' '),
    sourceCues: ['dark romanticism snack hallucination', 'black eclipse dessert nightmare'],
  });

  expect(scenePlan[0].singleImagePrompt).toContain('neon snacks orbit');
  expect(scenePlan[1].storyBeat).toContain('hallucination overtakes the room');
  expect(scenePlan[1]).toMatchObject({
    frameSource: 'lastFrame',
    freshImage: false,
    useCameraShot: false,
  });
  expect(scenePlan[2]).toMatchObject({
    frameSource: 'newImage',
    freshImage: true,
    useCameraShot: true,
  });
});

test('sanitizeWebcamCameraScenePlan disables trippy reanchor when interval is 0', () => {
  const scenePlan = sanitizeWebcamCameraScenePlan([
    {
      title: 'Opening',
      beat: 'Opening hallucination.',
      stillPrompt: 'Opening shot.',
      imageDescription: 'Opening image.',
      storyBeat: 'The hallucination begins.',
      motionCue: 'He stiffens.',
      cameraCue: 'The camera drifts inward.',
      frameSource: 'newImage',
      videoMode: 'singleImage',
      durationSeconds: 2.3,
      videoPrompt: 'Opening hallucination.',
      singleImagePrompt: 'Opening hallucination.',
      freshImage: true,
      useCameraShot: true,
    },
    {
      title: 'Later',
      beat: 'The hallucination deepens.',
      stillPrompt: 'Later shot.',
      imageDescription: 'Later image.',
      storyBeat: 'The hallucination continues.',
      motionCue: 'He recoils.',
      cameraCue: 'The frame keeps drifting.',
      frameSource: 'newImage',
      videoMode: 'singleImage',
      durationSeconds: 1.6,
      videoPrompt: 'Later hallucination.',
      singleImagePrompt: 'Later hallucination.',
      freshImage: true,
      useCameraShot: true,
    },
    {
      title: 'Later 2',
      beat: 'The hallucination keeps building.',
      stillPrompt: 'Later shot 2.',
      imageDescription: 'Later image 2.',
      storyBeat: 'The hallucination carries forward.',
      motionCue: 'He tries to hold position.',
      cameraCue: 'The frame keeps drifting.',
      frameSource: 'lastFrame',
      videoMode: 'firstLast',
      durationSeconds: 1.6,
      videoPrompt: 'Later hallucination 2.',
      singleImagePrompt: 'Later hallucination 2.',
      freshImage: false,
      useCameraShot: true,
    },
  ], {
    sceneFlavor: 'ltxTrippy',
    trippyReanchorInterval: 0,
  });

  expect(scenePlan[0]).toMatchObject({
    frameSource: 'newImage',
    freshImage: true,
    useCameraShot: true,
  });
  expect(scenePlan[1]).toMatchObject({
    frameSource: 'lastFrame',
    freshImage: false,
    useCameraShot: false,
  });
  expect(scenePlan[2]).toMatchObject({
    frameSource: 'lastFrame',
    freshImage: false,
    videoMode: 'firstLast',
    useCameraShot: true,
  });
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
    'scene 1: opening reference-image-actor scene must use videoMode "singleImage"',
    'scene 1: opening reference-image-actor scene must start from frameSource "newImage"',
    'scene 1: opening reference-image-actor scene must set useCameraShot=true',
    'scene 1: opening reference-image-actor scene must set freshImage=true',
    'scene 2: later singleImage reference-image-actor scene must start from frameSource "lastFrame"',
    'scene 3: singleImage reference-image-actor scene with frameSource "lastFrame" must set useCameraShot=false',
    'scene 3: singleImage reference-image-actor scene with frameSource "lastFrame" must set freshImage=false',
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

  expect(prompt).toContain('The lecture turns into a private nightmare');
  expect(prompt).toContain('He flinches back from the desk');
  expect(prompt).toContain('The camera edges closer');
  expect(prompt).toContain('The professor in the study');
  expect(prompt).not.toMatch(/\b(?:Same actor|Same actors|Same location|Identity lock|Framing lock|Keep readable|Beat|Action|Motion|Camera|Timing|End state|Hold state|Continuity):/);
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

  expect(prompt).toContain('The scholarly mask slips');
  expect(prompt).toContain('The professor in the study');
  expect(prompt).toContain('His face tightens and his gaze locks upward');
  expect(prompt).toContain('A slow push-in increases pressure');
  expect(prompt).not.toContain('6.4-second');
  expect(prompt).not.toMatch(/\b(?:Same actor|Same actors|Same location|Identity lock|Framing lock|Keep readable|Beat|Action|Motion|Camera|Timing|End state|Hold state|Continuity):/);
});

test('createWebcamSingleImagePrompt keeps chosen surveillance-camera style in the WAN prompt', async () => {
  const cameraStyle = 'Real 1989 German Einkaufszentrum CCTV footage: fixed high security-camera angle, slight VHS noise.';
  const createPrompt = createWebcamSingleImagePrompt({
    configMode: 'camera',
    cameraStyle,
    getFrameVision: async () => 'Subject: a visitor. Setting: an exhibition floor.',
  });

  const prompt = await createPrompt(
    'ignored start',
    { index: 1, durationSeconds: 3 },
    {
      scenePlan: [{
        index: 1,
        durationSeconds: 3,
        storyBeat: 'The visitor notices a lit display at the far end of the floor.',
        singleImagePrompt: 'The visitor turns toward the lit display.',
        motionCue: 'The visitor turns their shoulders toward the far display.',
        cameraCue: 'The high aisle-end camera holds the full path to the display.',
      }],
      startFrame: { image: { path: 'start.png' } },
    }
  );

  expect(prompt).toContain(cameraStyle);
  expect(prompt).toContain('The high aisle-end camera holds the full path to the display');
});

test('createWebcamSingleImagePrompt carries previous scene memory into the next scene prompt', async () => {
  const createPrompt = createWebcamSingleImagePrompt({
    configMode: 'camera',
    getFrameVision: async () => 'Subject: the professor. Setting: the study.',
  });

  const prompt = await createPrompt(
    'ignored start',
    { index: 2, durationSeconds: 3 },
    {
      scenePlan: [
        {
          index: 1,
          storyBeat: 'The scholarly mask slips.',
          motionCue: 'His face tightens and his gaze locks upward.',
        },
        {
          index: 2,
          storyBeat: 'He tries to continue speaking while the room keeps pressing in.',
          singleImagePrompt: 'He forces himself onward, but the room keeps crowding the frame.',
          motionCue: 'He swallows, glances aside, and tries to hold the pose.',
          cameraCue: 'A slow push-in keeps the pressure on his face.',
        },
      ],
      startFrame: { image: { path: 'start.png' } },
    }
  );

  expect(prompt).toContain('He tries to continue speaking while the room keeps pressing in');
  expect(prompt).toContain('The scholarly mask slips');
  expect(prompt).toMatch(/trace of the scholarly mask slips/i);
  expect(prompt).toContain('The professor in the study');
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

  expect(prompt).toContain('He craves fries but keeps the feeling internal');
  expect(prompt).toContain('the traveler in a close-up cabin seat shot under soft overhead light');
  expect(prompt).not.toContain('plate of fries');
  expect(prompt).not.toMatch(/\b(?:Same actor|Same actors|Same location|Identity lock|Framing lock|Keep readable|Beat|Action|Motion|Camera|Timing|End state|Hold state|Continuity):/);
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

  expect(prompt).toContain('The professor in the study');
  expect(prompt).toContain('The room closes in around him');
  expect(prompt).toContain('He rises fast and turns toward the window');
  expect(prompt).toContain('The camera pushes in with him');
  expect(prompt).not.toMatch(/\b(?:Same actor|Same actors|Same location|Identity lock|Framing lock|Keep readable|Beat|Action|Motion|Camera|Timing|End state|Hold state|Continuity):/);
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

  expect(prompt).toContain('The professor in the study');
  expect(prompt).toMatch(/same real person from the source frame/i);
  expect(prompt).toMatch(/same face and clothes/i);
  expect(prompt).not.toContain('different jacket');
  expect(prompt).not.toContain('hallway');
  expect(prompt).not.toMatch(/\b(?:Same actor|Same actors|Same location|Identity lock|Framing lock|Keep readable|Beat|Action|Motion|Camera|Timing|End state|Hold state|Continuity):/);
});
