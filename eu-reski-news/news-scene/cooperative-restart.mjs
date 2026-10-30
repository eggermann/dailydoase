export function installCooperativeRestart(processObject = process, enabled = process.env.EXHIBITION_COOPERATIVE_RESTART === '1') {
  let requested = false;
  let wake = null;
  if (enabled) {
    processObject.on('SIGUSR2', () => {
      requested = true;
      wake?.();
    });
    processObject.send?.({ type: 'cooperative-restart-ready' });
  }
  return {
    get requested() { return requested; },
    async wait(milliseconds) {
      if (requested || milliseconds <= 0) return;
      await new Promise((resolve) => {
        const timer = setTimeout(() => { wake = null; resolve(); }, milliseconds);
        wake = () => { clearTimeout(timer); wake = null; resolve(); };
        if (requested) wake();
      });
    },
  };
}
