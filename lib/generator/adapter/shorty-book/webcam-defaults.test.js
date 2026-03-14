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
    'do not turn the source cues into a generic host presentation, review, explanation, or discussion'
  );
  expect(DEFAULT_WEBCAM_CAMERA_SCENE_SYSTEM_PROMPT).toContain(
    'keep the location static across the sequence and follow the beat through expression, gesture, props, framing, and lighting inside that same space'
  );
  expect(DEFAULT_WEBCAM_CAMERA_SCENE_SYSTEM_PROMPT).toContain(
    'Choose videoMode "singleImage" when the subscene is mainly one held visual state with believable internal motion.'
  );
  expect(DEFAULT_WEBCAM_CAMERA_SCENE_SYSTEM_PROMPT).toContain(
    'Choose videoMode "firstLast" when the subscene should travel from the current frame toward a clearly different destination setup in the same real room and subject continuity.'
  );
  expect(DEFAULT_WEBCAM_CAMERA_SCENE_SYSTEM_PROMPT).toContain(
    'Choose frameSource "newImage" only when the story point needs a fresh webcam re-anchor of the same real person and room.'
  );
  expect(DEFAULT_WEBCAM_CAMERA_SCENE_SYSTEM_PROMPT).toContain(
    'In a camera plan with 4 or more scenes, do not make every later scene use the same videoMode.'
  );
  expect(DEFAULT_WEBCAM_CAMERA_SCENE_SYSTEM_PROMPT).toContain(
    'In a camera plan with 5 or more scenes, include at least one later continuation beat as singleImage from lastFrame and at least one later destination beat as firstLast from lastFrame.'
  );
  expect(DEFAULT_WEBCAM_CAMERA_SCENE_SYSTEM_PROMPT).toContain(
    'For every later firstLast camera scene, set useCameraShot=true and freshImage=false.'
  );
  expect(DEFAULT_WEBCAM_CAMERA_SCENE_SYSTEM_PROMPT).toContain(
    'Before you output JSON, check the later scenes and confirm the plan includes the required mix and that every firstLast camera scene has useCameraShot=true.'
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

test('sanitizeWebcamCameraScenePlan preserves later singleImage choice and only fixes matching flags', () => {
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
    frameSource: 'newImage',
    freshImage: true,
    useCameraShot: true,
  });
});

test('sanitizeWebcamCameraScenePlan enforces a later fresh webcam re-anchor in 6-scene camera plans', () => {
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
    frameSource: 'newImage',
    freshImage: true,
    useCameraShot: true,
  });
});

test('sanitizeWebcamCameraScenePlan enforces a later fresh webcam re-anchor in 4-scene camera plans', () => {
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
  ]);

  expect(scenePlan[3]).toMatchObject({
    videoMode: 'singleImage',
    frameSource: 'newImage',
    freshImage: true,
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
    'scene 1: opening camera scene must use videoMode "singleImage"',
    'scene 1: opening camera scene must start from frameSource "newImage"',
    'scene 1: opening camera scene must set useCameraShot=true',
    'scene 1: opening camera scene must set freshImage=true',
    'scene 2: singleImage camera scene with frameSource "newImage" must set useCameraShot=true',
    'scene 2: singleImage camera scene with frameSource "newImage" must set freshImage=true',
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
      title: 'Re-anchor',
      videoMode: 'singleImage',
      frameSource: 'newImage',
      freshImage: true,
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

test('describeWebcamCameraScenePlanIssues rejects monotone later video modes in longer camera plans', () => {
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
  ])).toContain(
    'camera plan: later scenes must not all use the same videoMode when scene count is 4 or more'
  );
});

test('describeWebcamCameraScenePlanIssues requires destination and re-anchor beats in longer camera plans', () => {
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
  ])).toContain(
    'camera plan: for 6 or more scenes, include at least one later re-anchored beat using singleImage from a fresh webcam shot'
  );
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
    { index: 1 },
    {
      scenePlan: [
        {
          index: 1,
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
  expect(prompt).toContain('By the end, the same actor and same setting should still read clearly');
});

test('createWebcamSingleImagePrompt keeps planned story text in camera mode', async () => {
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
