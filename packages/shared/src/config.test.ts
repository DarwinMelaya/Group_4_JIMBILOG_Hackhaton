import { describe, expect, it } from 'vitest';
import { PublicConfigSchema } from './config.js';

const valid = {
  apiVersion: 'v1',
  demoMode: true,
  locales: ['en', 'fil'],
  defaultLocale: 'en',
  timezone: 'Asia/Manila',
  notificationTransport: 'mock',
  realBookingEnabled: false,
  clinicalContentApproved: false,
};

describe('PublicConfigSchema', () => {
  it('accepts the safe demo config', () => {
    expect(PublicConfigSchema.safeParse(valid).success).toBe(true);
  });
  it('rejects real booking enabled, non-mock transport and unknown keys', () => {
    expect(PublicConfigSchema.safeParse({ ...valid, realBookingEnabled: true }).success).toBe(false);
    expect(PublicConfigSchema.safeParse({ ...valid, notificationTransport: 'sms' }).success).toBe(false);
    expect(PublicConfigSchema.safeParse({ ...valid, extra: 1 }).success).toBe(false);
    expect(PublicConfigSchema.safeParse({ ...valid, locales: ['de'] }).success).toBe(false);
  });
});
