import { loadTaktmuster } from './taktmuster.mjs';

export function parseTransitionWaitPattern(value) {
  if (value === undefined) return undefined;
  if (value.trim().toLowerCase() === 'classic') return undefined;
  if (value.trim().toLowerCase() === 'all') return null;

  const pattern = value.split(',').map((part) => Number(part.trim()));
  if (!pattern.length || pattern.some((count) => !Number.isInteger(count) || count < 1)) {
    throw new Error('--transition-wait-pattern must be comma-separated positive integers');
  }
  return pattern;
}

export function createTransitionWaitScheduler(waitPattern) {
  if (waitPattern === null) return null;

  const taktSettings = { taktCnt: 2, zaehler: 4, nenner: 4, type: 'classic' };
  const Taktmuster = waitPattern === undefined ? loadTaktmuster() : null;
  const taktMuster = Taktmuster ? new Taktmuster(taktSettings) : null;
  const nextPatternValue = () => {
    if (taktMuster) {
      const value = Number(taktMuster.getNext().patternValue);
      if (!Number.isInteger(value) || value < 1) throw new Error('Taktmuster returned an invalid transition wait');
      return value;
    }

    return waitPattern[patternIndex % waitPattern.length];
  };

  let patternIndex = 0;
  let scenesUntilTransition = nextPatternValue();
  let transitionIsDue = false;

  function advancePattern() {
    patternIndex += 1;
    const nextWait = nextPatternValue();
    scenesUntilTransition = nextWait === 1 ? 1 : nextWait + 1;
    transitionIsDue = false;
  }

  return {
    patternSource: taktMuster ? { ...taktSettings } : 'explicit-list',
    get boundariesScheduled() {
      return patternIndex;
    },
    scheduleForIteration(scenes) {
      const boundaries = new Set();

      for (let index = 0; index < scenes.length; index += 1) {
        if (!transitionIsDue) {
          scenesUntilTransition -= 1;
          if (scenesUntilTransition === 0) transitionIsDue = true;
        }

        if (!transitionIsDue) continue;
        if (index < scenes.length - 1) {
          boundaries.add(`${scenes[index].index}->${scenes[index + 1].index}`);
        }
        advancePattern();
      }

      return boundaries;
    },
  };
}
