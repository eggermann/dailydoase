const retryableNetworkCodes = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'ENOTFOUND',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_SOCKET',
]);

export function isRetryableNetworkError(error) {
  if (error?.name === 'AbortError' || error?.name === 'TimeoutError') return true;
  if (error?.name !== 'TypeError' && error?.name !== 'FetchError') return false;
  let cause = error.cause;
  while (cause) {
    if (retryableNetworkCodes.has(cause.code)) return true;
    cause = cause.cause;
  }
  return error.message === 'fetch failed';
}

export function isRetryableHttpStatus(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export function retryDelayMs(attempt, baseDelayMs = 1000, maxDelayMs = 15000) {
  const exponentialDelay = Math.min(maxDelayMs, baseDelayMs * (2 ** (attempt - 1)));
  return Math.min(maxDelayMs, Math.round(exponentialDelay * (0.8 + Math.random() * 0.4)));
}

export async function retryTransient(operation, {
  attempts = 5,
  baseDelayMs = 1000,
  maxDelayMs = 15000,
  shouldRetry = isRetryableNetworkError,
  onRetry = () => {},
  wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
} = {}) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      if (attempt >= attempts || !shouldRetry(error)) throw error;
      const delay = retryDelayMs(attempt, baseDelayMs, maxDelayMs);
      onRetry({ attempt, nextAttempt: attempt + 1, delay, error });
      await wait(delay);
    }
  }
}
