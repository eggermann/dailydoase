const TRUTHY_VALUES = new Set(['1', 'true', 'yes', 'on', 'debug']);
const SENSITIVE_KEYS = new Set([
  'authorization',
  'x-api-key',
  'api_key',
  'apikey',
  'token',
  'hf_token',
  'openai_api_key',
]);

const normalize = (value) => String(value ?? '').trim().toLowerCase();

const isTruthyEnv = (envKey) => TRUTHY_VALUES.has(normalize(process.env[envKey]));

const matchesScopePattern = (scope, pattern) => {
  const p = normalize(pattern);
  if (!p) return false;
  if (TRUTHY_VALUES.has(p) || p === '*') return true;
  if (p.endsWith('*')) return scope.startsWith(p.slice(0, -1));
  return scope === p || scope.startsWith(`${p}:`);
};

const isDebugEnabled = (scope, envKeys = []) => {
  const normalizedScope = normalize(scope);

  if (isTruthyEnv('GENERATOR_DEBUG') || isTruthyEnv('GEN_DEBUG')) {
    return true;
  }

  for (const key of envKeys) {
    if (isTruthyEnv(key)) return true;
  }

  const debugRaw = String(process.env.DEBUG ?? process.env.GENERATOR_DEBUG_SCOPES ?? '').trim();
  if (!debugRaw) return false;

  return debugRaw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .some((pattern) => matchesScopePattern(normalizedScope, pattern));
};

const maskSecret = (value) => {
  const s = String(value ?? '');
  if (!s) return s;
  if (s.length <= 8) return '*'.repeat(s.length);
  return `${s.slice(0, 3)}…${s.slice(-3)}`;
};

const sanitize = (value, key = '') => {
  if (!value || typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item, key));
  }

  const out = {};
  for (const [k, v] of Object.entries(value)) {
    const nk = normalize(k);
    if (SENSITIVE_KEYS.has(nk)) {
      out[k] = typeof v === 'string' ? maskSecret(v) : '***';
      continue;
    }
    out[k] = sanitize(v, k);
  }
  return out;
};

const toDebugString = (value, maxLength = 6000) => {
  let text;
  try {
    text = JSON.stringify(sanitize(value), null, 2);
  } catch (_) {
    text = String(value);
  }

  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}\n...[truncated ${text.length - maxLength} chars]`;
};

const truncateText = (value, maxLength = 1500) => {
  const text = String(value ?? '');
  if (!text) return text;
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...[truncated ${text.length - maxLength} chars]`;
};

const extractPromptValue = (value) => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value !== 'object') return null;

  if (typeof value.prompt === 'string' && value.prompt.trim()) return value.prompt;
  if (typeof value.text_prompt === 'string' && value.text_prompt.trim()) return value.text_prompt;
  if (typeof value.inputs === 'string' && value.inputs.trim()) return value.inputs;
  return null;
};

export const createLogger = (scope, options = {}) => {
  const normalizedScope = normalize(scope) || 'app';
  const prefix = `[${scope}]`;
  const envKeys = options.envKeys || [];

  const debug = (...args) => {
    if (!isDebugEnabled(normalizedScope, envKeys)) return;
    console.log(prefix, ...args);
  };

  return {
    isDebugEnabled: () => isDebugEnabled(normalizedScope, envKeys),
    info: (...args) => console.log(prefix, ...args),
    warn: (...args) => console.warn(prefix, ...args),
    error: (...args) => console.error(prefix, ...args),
    debug,
    payload: (label, payload, opts = {}) => {
      const promptText = extractPromptValue(payload);
      if (promptText) {
        const maxPromptLength = Number(opts.maxPromptLength ?? 1500);
        console.log(prefix, `[prompt:${label}]`, truncateText(promptText, maxPromptLength));
      }

      if (!isDebugEnabled(normalizedScope, envKeys)) return;
      const maxLength = Number(opts.maxLength ?? 6000);
      console.log(prefix, `${label}:`, toDebugString(payload, maxLength));
    },
    netRequest: ({ method = 'GET', url = '', headers = null, body = null, label = 'request' } = {}) => {
      if (!isDebugEnabled(normalizedScope, envKeys)) return;
      console.log(prefix, `[net:${label}] ${method} ${url}`);
      if (headers) console.log(prefix, '[net:headers]', toDebugString(headers, 3000));
      if (body) console.log(prefix, '[net:body]', toDebugString(body, 6000));
    },
    netResponse: ({ method = 'GET', url = '', status, statusText, body = null, label = 'response' } = {}) => {
      if (!isDebugEnabled(normalizedScope, envKeys)) return;
      const statusPart = typeof status === 'number' ? `${status}${statusText ? ` ${statusText}` : ''}` : 'n/a';
      console.log(prefix, `[net:${label}] ${method} ${url} -> ${statusPart}`);
      if (body !== null && body !== undefined) {
        console.log(prefix, '[net:body]', toDebugString(body, 6000));
      }
    },
  };
};
