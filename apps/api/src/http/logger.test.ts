import { describe, expect, it } from 'vitest';
import { createLogger, redact, REDACTED } from './logger.js';

function capture() {
  const lines: string[] = [];
  return { lines, logger: createLogger((l) => lines.push(l)) };
}

describe('logger hardening (S1-13)', () => {
  it('does not let caller fields override ts, level or msg', () => {
    const { lines, logger } = capture();
    logger.log('info', 'real message', { ts: 'forged', level: 'error', msg: 'forged', extra: 'kept' });
    const rec = JSON.parse(lines[0] ?? '{}') as Record<string, unknown>;
    expect(rec.level).toBe('info');
    expect(rec.msg).toBe('real message');
    expect(rec.ts).not.toBe('forged');
    expect(Number.isNaN(Date.parse(String(rec.ts)))).toBe(false);
    expect(rec.extra).toBe('kept');
  });

  it('keeps errorName readable but still redacts other name-like keys', () => {
    const { lines, logger } = capture();
    logger.log('error', 'unhandled', { errorName: 'TypeError', name: 'Juan', fullName: 'Juan D', contactPhone: '0917' });
    const rec = JSON.parse(lines[0] ?? '{}') as Record<string, unknown>;
    expect(rec.errorName).toBe('TypeError');
    expect(rec.name).toBe(REDACTED);
    expect(rec.fullName).toBe(REDACTED);
    expect(rec.contactPhone).toBe(REDACTED);
    expect(lines[0]).not.toMatch(/Juan|0917/);
  });

  it('redact keeps errorName nested too', () => {
    const out = redact({ err: { errorName: 'RangeError', message: 'x', email: 'a@b.invalid' } }) as {
      err: Record<string, unknown>;
    };
    expect(out.err.errorName).toBe('RangeError');
    expect(out.err.email).toBe(REDACTED);
  });
});
