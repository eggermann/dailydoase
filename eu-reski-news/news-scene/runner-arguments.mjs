function flagName(argument) {
  return argument.startsWith('--') ? argument.split('=', 1)[0] : null;
}

function addDefault(argumentsList, userArguments, flag, value = null) {
  if ([...argumentsList, ...userArguments].some((argument) => flagName(argument) === flag)) return;
  if (value === null) argumentsList.push(flag);
  else argumentsList.push(`${flag}=${value}`);
}

export function mergeRunnerArguments(defaults, userArguments, {
  stopAfterIterations = null,
  newsDirectory,
  outputDirectory,
} = {}) {
  const normalizedUserArguments = userArguments.map((argument) => argument.replace(
    /^--(no-)?stop-ommit-similar(?==|$)/,
    '--$1stop-omit-similar',
  ));
  const merged = [];
  const oppositeFlags = new Map([
    ['--auto-mode', '--no-auto-mode'], ['--no-auto-mode', '--auto-mode'],
    ['--symbolic', '--no-symbolic'], ['--no-symbolic', '--symbolic'],
    ['--room-deepness', '--no-room-deepness'], ['--no-room-deepness', '--room-deepness'],
    ['--scene-visual-controls', '--fixed-visual-controls'], ['--fixed-visual-controls', '--scene-visual-controls'],
    ['--style-reference', '--no-style-reference'], ['--no-style-reference', '--style-reference'],
    ['--use-style-reference', '--no-style-reference'], ['--no-style-reference', '--use-style-reference'],
    ['--use-guernica-figure-reference', '--no-guernica-figure-reference'], ['--no-guernica-figure-reference', '--use-guernica-figure-reference'],
    ['--preserve-cubist-video-style', '--no-preserve-cubist-video-style'], ['--no-preserve-cubist-video-style', '--preserve-cubist-video-style'],
    ['--videos-after-each-iteration', '--no-videos-after-each-iteration'], ['--no-videos-after-each-iteration', '--videos-after-each-iteration'],
    ['--generate-title-cards', '--no-generate-title-cards'], ['--no-generate-title-cards', '--generate-title-cards'],
    ['--guernica-location-reference', '--no-guernica-location-reference'], ['--no-guernica-location-reference', '--guernica-location-reference'],
    ['--article-image-reference', '--no-article-image-reference'], ['--no-article-image-reference', '--article-image-reference'],
    ['--landscape-prompt', '--no-landscape-prompt'], ['--no-landscape-prompt', '--landscape-prompt'],
    ['--legacy-guernica-style-reference-prompt', '--no-legacy-guernica-style-reference-prompt'], ['--no-legacy-guernica-style-reference-prompt', '--legacy-guernica-style-reference-prompt'],
    ['--no-dialogue-narration', '--allow-dialogue-narration'], ['--allow-dialogue-narration', '--no-dialogue-narration'],
    ['--stop-omit-similar', '--no-stop-omit-similar'], ['--no-stop-omit-similar', '--stop-omit-similar'],
  ]);
  const suppliedFlags = new Set(normalizedUserArguments.map(flagName));
  for (const argument of defaults) {
    const flag = flagName(argument);
    if (flag && (suppliedFlags.has(flag) || suppliedFlags.has(oppositeFlags.get(flag)))) continue;
    merged.push(argument);
  }

  const suppliedIterations = normalizedUserArguments.find((argument) => flagName(argument) === '--iterations');
  if (suppliedIterations) {
    const value = suppliedIterations.includes('=') ? suppliedIterations.split('=').at(-1) : normalizedUserArguments[normalizedUserArguments.indexOf(suppliedIterations) + 1];
    if (!['0', '-1'].includes(value)) {
      const finiteCount = Number(value);
      if (!Number.isSafeInteger(finiteCount) || finiteCount < 1 || finiteCount !== stopAfterIterations) {
        throw new Error('Use --stop-after-iterations=N for a finite exhibition run');
      }
    }
  }
  addDefault(merged, normalizedUserArguments, '--iterations', '-1');
  addDefault(merged, normalizedUserArguments, '--pause-ms', '0');
  addDefault(merged, normalizedUserArguments, '--article-order', 'linear');
  addDefault(merged, normalizedUserArguments, '--news-dir', newsDirectory);
  addDefault(merged, normalizedUserArguments, '--output-dir', outputDirectory);
  return [...merged, ...normalizedUserArguments];
}
