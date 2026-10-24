import { loadTaktmuster } from './taktmuster.mjs';

export function resolveSceneCountSettings(options) {
  const mode = options['scene-count-mode'] || 'fixed';
  if (!['fixed', 'taktmuster'].includes(mode)) throw new Error('--scene-count-mode must be fixed or taktmuster');
  if (mode === 'fixed') {
    const count = Number(options.scenes ?? 3);
    if (!Number.isInteger(count) || count < 1 || count > 12) throw new Error('Use --scenes=1 through 12');
    return { mode, count };
  }
  const settings = {
    mode,
    takt: Number(options['scene-count-takt'] ?? 2),
    numerator: Number(options['scene-count-numerator'] ?? 3),
    denominator: Number(options['scene-count-denominator'] ?? 4),
    type: options['scene-count-type'] || 'balanced',
    bias: Number(options['scene-count-bias'] ?? 2),
    minimum: Number(options['min-scenes'] ?? 1),
    maximum: Number(options['max-scenes'] ?? 12),
  };
  if (!Number.isInteger(settings.takt) || settings.takt < 1 || settings.takt > 64
    || !Number.isInteger(settings.numerator) || settings.numerator < 1 || settings.numerator > 32
    || !Number.isInteger(settings.denominator) || settings.denominator < 1 || settings.denominator > 32
    || !['balanced', 'classic'].includes(settings.type) || !Number.isSafeInteger(settings.bias)
    || !Number.isInteger(settings.minimum) || !Number.isInteger(settings.maximum)
    || settings.minimum < 1 || settings.maximum > 12 || settings.maximum < settings.minimum) {
    throw new Error('Invalid scene-count rhythm: positive measures/meter, balanced|classic, integer bias and 1 <= min-scenes <= max-scenes <= 12 required');
  }
  return settings;
}

export function createSceneCountStream(settings, TaktmusterClass) {
  settings = resolveSceneCountSettings({
    'scene-count-mode': settings.mode, scenes: settings.count,
    'scene-count-takt': settings.takt, 'scene-count-numerator': settings.numerator,
    'scene-count-denominator': settings.denominator, 'scene-count-type': settings.type,
    'scene-count-bias': settings.bias, 'min-scenes': settings.minimum, 'max-scenes': settings.maximum,
  });
  let stream;
  let index = 0;
  if (settings.mode === 'taktmuster') {
    const Taktmuster = TaktmusterClass || loadTaktmuster();
    stream = new Taktmuster();
    stream.setTakt(settings.takt, settings.numerator, settings.denominator);
    stream.setType(settings.type);
  }
  return {
    settings,
    next() {
      const iteration = index++;
      if (settings.mode === 'fixed') return { iteration, count: settings.count, settings };
      const step = stream.getNext();
      const rawValue = Number(step?.patternValue ?? step);
      if (!Number.isFinite(rawValue) || rawValue <= 0) throw new Error('Taktmuster returned an invalid scene-count value');
      const biasedValue = Math.round(rawValue) + settings.bias;
      return {
        iteration, rawValue, biasedValue,
        count: Math.max(settings.minimum, Math.min(settings.maximum, biasedValue)),
        settings,
      };
    },
  };
}
