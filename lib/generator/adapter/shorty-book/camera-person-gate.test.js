import { shouldResetPersonlessGenerationCount } from './camera-person-gate.js';

test('only a confirmed person resets the exhibition personless-generation count', () => {
  expect(shouldResetPersonlessGenerationCount({
    requirePerson: true,
    shot: { hasConfirmedPerson: false },
  })).toBe(false);
  expect(shouldResetPersonlessGenerationCount({
    requirePerson: true,
    shot: { hasConfirmedPerson: true },
  })).toBe(true);
  expect(shouldResetPersonlessGenerationCount({
    requirePerson: false,
    shot: { hasConfirmedPerson: false },
  })).toBe(true);
});
