import { expect, test } from '@jest/globals';

import {
  DEFAULT_WEBCAM_CAMERA_SCENE_SYSTEM_PROMPT,
  applyWebcamScenePlanVideoModeDefaults,
  describeWebcamCameraScenePlanIssues,
  resolveWebcamScenePlanSystemPrompt,
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
