const REDACT_KEYS =
  /(authorization|cookie|secret|password|passwd|token|apikey|api_key|payload|body|phone|email|contact|name|address|reference)/i;

export const REDACTED = '[REDACTED]';

/** Deep-redact sensitive keys; truncates depth and long strings. */
export function redact(value: unknown, depth = 0): unknown {
  if (value === null || typeof value !== 'object') {
    return typeof value === 'string' && value.length > 500 ? `${value.slice(0, 500)}...` : value;
  }
  if (depth > 5) return '[TRUNCATED]';
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) out[k] = REDACT_KEYS.test(k) ? REDACTED : redact(v, depth + 1);
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
      sink(JSON.stringify({ ts: new Date().toISOString(), level, msg, ...(redact(fields) as object) }));
    },
  };
}

export const silentLogger: Logger = { log() {} };
