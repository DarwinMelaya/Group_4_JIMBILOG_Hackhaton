import { describe, expect, it } from 'vitest';
import {
  BOOKING_REFERENCE_RE,
  BookingCreateRequestSchema,
  BookingCreatedSchema,
  BookingLookupRequestSchema,
  BookingLookupResponseSchema,
  BookingReplaySchema,
  IDEMPOTENCY_KEY_RE,
} from './booking.js';

const good = {
  clinicId: 'demo-clinic-a',
  ageBand: '18_plus',
  preferredDate: '2026-11-03',
  preferredWindow: 'morning',
  acknowledgedDisclosure: true,
} as const;

describe('booking request contract', () => {
  it('accepts a minimal request and rejects identifying or unknown keys', () => {
    expect(BookingCreateRequestSchema.safeParse(good).success).toBe(true);
    for (const extra of [{ name: 'x' }, { phone: '1' }, { dateOfBirth: '2000-01-01' }, { symptoms: 'x' }]) {
      expect(BookingCreateRequestSchema.safeParse({ ...good, ...extra }).success).toBe(false);
    }
  });

  it('requires the disclosure acknowledgement, a real calendar date and a known age band', () => {
    expect(BookingCreateRequestSchema.safeParse({ ...good, acknowledgedDisclosure: false }).success).toBe(false);
    expect(BookingCreateRequestSchema.safeParse({ ...good, preferredDate: '2026-02-30' }).success).toBe(false);
    expect(BookingCreateRequestSchema.safeParse({ ...good, preferredDate: '03/11/2026' }).success).toBe(false);
    expect(BookingCreateRequestSchema.safeParse({ ...good, ageBand: '16' }).success).toBe(false);
  });

  it('validates references and idempotency keys', () => {
    expect(BOOKING_REFERENCE_RE.test('KAL-ABCDEFGHIJ')).toBe(true);
    expect(BOOKING_REFERENCE_RE.test('KAL-ABCDEFGH1J')).toBe(false);
    expect(BOOKING_REFERENCE_RE.test('kal-abcdefghij')).toBe(false);
    expect(IDEMPOTENCY_KEY_RE.test('0123456789abcdef')).toBe(true);
    expect(IDEMPOTENCY_KEY_RE.test('short')).toBe(false);
    expect(IDEMPOTENCY_KEY_RE.test('has space and is long enough')).toBe(false);
  });

  it('only the created response carries a secret; the replay and lookup shapes cannot', () => {
    const clinic = { name: 'DEMO Clinic A', slug: 'demo-clinic-a', isDemo: true };
    const replay = { alreadyCreated: true, status: 'pending', requestOnly: true, demo: true, reference: 'KAL-ABCDEFGHIJ', clinic };
    expect(BookingReplaySchema.safeParse(replay).success).toBe(true);
    expect(BookingReplaySchema.safeParse({ ...replay, secret: 'x'.repeat(43) }).success).toBe(false);
    const created = {
      status: 'pending', requestOnly: true, demo: true, demoMinorFlow: false, reference: 'KAL-ABCDEFGHIJ',
      secret: 'x'.repeat(43), clinic, createdAt: '2026-10-30T00:00:00.000Z',
    };
    expect(BookingCreatedSchema.safeParse(created).success).toBe(true);
    expect(BookingCreatedSchema.safeParse({ ...created, status: 'confirmed' }).success).toBe(false);
    const lookup = { reference: 'KAL-ABCDEFGHIJ', status: 'pending', requestOnly: true, demo: true, clinic, clinicNote: null, visitInstructions: null, updatedAt: 'x' };
    expect(BookingLookupResponseSchema.safeParse(lookup).success).toBe(true);
    expect(BookingLookupResponseSchema.safeParse({ ...lookup, notes: 'echoed preference' }).success).toBe(false);
    expect(BookingLookupRequestSchema.safeParse({ reference: 'a', secret: 'b', extra: 1 }).success).toBe(false);
  });
});
