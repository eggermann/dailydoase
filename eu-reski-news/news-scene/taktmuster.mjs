import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function loadTaktmuster() {
  try {
    return createRequire(import.meta.url)('taktmuster').Taktmuster;
  } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error;
    const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
      cwd: dirname(fileURLToPath(import.meta.url)), encoding: 'utf8',
    }).trim();
    return createRequire(join(dirname(common), 'package.json'))('taktmuster').Taktmuster;
  }
}
