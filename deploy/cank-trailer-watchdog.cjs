const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const logPath = process.env.CANK_TRAILER_LOG_PATH
  || '/home/eggman/logs/cankTrailer.out.log';
const pollMs = Number(process.env.CANK_TRAILER_WATCHDOG_POLL_MS || 300_000);
const staleMs = Number(process.env.CANK_TRAILER_WATCHDOG_STALE_MS || 108_000_000);

if (!Number.isFinite(pollMs) || pollMs <= 0) {
  throw new Error('CANK_TRAILER_WATCHDOG_POLL_MS must be a positive number');
}

if (!Number.isFinite(staleMs) || staleMs <= pollMs) {
  throw new Error('CANK_TRAILER_WATCHDOG_STALE_MS must be greater than the poll interval');
}

const restartTrailer = () => {
  console.warn('[cank-trailer-watchdog] no trailer progress within the allowed window; restarting cankTrailer.');
  execFileSync('supervisorctl', ['restart', 'cankTrailer'], { stdio: 'inherit' });
};

const checkTrailerProgress = () => {
  let logStat;
  try {
    logStat = fs.statSync(logPath);
  } catch (error) {
    console.warn(`[cank-trailer-watchdog] cannot read ${logPath}: ${error.message}`);
    return;
  }

  const ageMs = Date.now() - logStat.mtimeMs;
  if (ageMs > staleMs) {
    restartTrailer();
  }
};

console.log(
  `[cank-trailer-watchdog] watching ${logPath}; poll ${pollMs}ms, stale after ${staleMs}ms.`
);
checkTrailerProgress();
setInterval(checkTrailerProgress, pollMs);
