import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.js';

describe('loadEnv: clinical approval flag hardening (S1-13)', () => {
  it('refuses CLINICAL_CONTENT_APPROVED=true while DEMO_MODE is true (default), even with evidence', () => {
    expect(() => loadEnv({ CLINICAL_CONTENT_APPROVED: 'true' })).toThrow(/DEMO_MODE/);
    expect(() =>
      loadEnv({ CLINICAL_CONTENT_APPROVED: 'true', DEMO_MODE: 'true', CLINICAL_CONTENT_EVIDENCE_REF: 'REV-001' }),
    ).toThrow(/DEMO_MODE/);
  });

  it('requires an evidence reference when approval is true and DEMO_MODE is false', () => {
    const base = { CLINICAL_CONTENT_APPROVED: 'true', DEMO_MODE: 'false' };
    expect(() => loadEnv(base)).toThrow(/CLINICAL_CONTENT_EVIDENCE_REF/);
    expect(() => loadEnv({ ...base, CLINICAL_CONTENT_EVIDENCE_REF: '' })).toThrow(/CLINICAL_CONTENT_EVIDENCE_REF/);
    expect(() => loadEnv({ ...base, CLINICAL_CONTENT_EVIDENCE_REF: '   ' })).toThrow();
  });

  it('accepts approval only with DEMO_MODE=false and a non-empty evidence reference', () => {
    const env = loadEnv({
      CLINICAL_CONTENT_APPROVED: 'true',
      DEMO_MODE: 'false',
      CLINICAL_CONTENT_EVIDENCE_REF: 'REVIEW-RECORD-123',
    });
    expect(env.CLINICAL_CONTENT_APPROVED).toBe(true);
    expect(env.CLINICAL_CONTENT_EVIDENCE_REF).toBe('REVIEW-RECORD-123');
  });

  it('does not require evidence while approval is false, and treats an empty reference as unset', () => {
    expect(loadEnv({ CLINICAL_CONTENT_EVIDENCE_REF: '' }).CLINICAL_CONTENT_EVIDENCE_REF).toBeUndefined();
    expect(loadEnv({}).CLINICAL_CONTENT_APPROVED).toBe(false);
  });
});
