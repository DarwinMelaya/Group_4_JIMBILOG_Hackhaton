import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.js';

describe('loadEnv', () => {
  it('defaults to safe DEMO values', () => {
    expect(loadEnv({})).toMatchObject({
      DEMO_MODE: true,
      CLINICAL_CONTENT_APPROVED: false,
      ALLOW_REAL_BOOKING_REQUESTS: false,
      REAL_MINOR_BOOKING_ENABLED: false,
      NOTIFICATION_TRANSPORT: 'mock',
      REAL_NOTIFICATIONS_ENABLED: false,
    });
  });
  it('treats empty PGLITE_DATA_DIR as unset', () => {
    expect(loadEnv({ PGLITE_DATA_DIR: '' }).PGLITE_DATA_DIR).toBeUndefined();
  });
  it('refuses unsafe combinations', () => {
    expect(() => loadEnv({ REAL_NOTIFICATIONS_ENABLED: 'true' })).toThrow();
    expect(() => loadEnv({ REAL_MINOR_BOOKING_ENABLED: 'true' })).toThrow();
    expect(() => loadEnv({ ALLOW_REAL_BOOKING_REQUESTS: 'true' })).toThrow();
    expect(() => loadEnv({ NODE_ENV: 'production' })).toThrow(/DEMO_MODE/);
    expect(() => loadEnv({ NOTIFICATION_TRANSPORT: 'sms' })).toThrow();
  });
});
