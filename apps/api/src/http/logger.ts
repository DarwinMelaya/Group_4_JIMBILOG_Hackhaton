const REDACT_KEYS =
  /(authorization|cookie|secret|password|passwd|token|apikey|api_key|payload|body|phone|email|contact|name|address|reference)/i;

export const REDACTED = '[REDACTED]';

/** Keys matching a sensitive pattern that are known-safe diagnostics (an error class name, never a person's name). */
const SAFE_KEYS = new Set(['errorName']);

/** Deep-redact sensitive keys; truncates depth and long strings. */
export function redact(value: unknown, depth = 0): unknown {
  if (value === null || typeof value !== 'object') {
    return typeof value === 'string' && value.length > 500 ? `${value.slice(0, 500)}...` : value;
  }
  if (depth > 5) return '[TRUNCATED]';
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) out[k] = !SAFE_KEYS.has(k) && REDACT_KEYS.test(k) ? REDACTED : redact(v, depth + 1);
  return out;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogSink = (line: string) => void;

export interface Logger {
  log(level: LogLevel, msg: string, fields?: Record<string, unknown>): void;
}

export function createLogger(sink: LogSink = (l) => process.stdout.write(`${l}\n`)): Logger {
  return {
    log(level, msg, fields = {}) {
      // Caller fields come first so they can never override the reserved ts/level/msg.
      sink(JSON.stringify({ ...(redact(fields) as object), ts: new Date().toISOString(), level, msg }));
    },
  };
}

export const silentLogger: Logger = { log() {} };
