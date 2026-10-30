import { describe, expect, it } from 'vitest';
import { BOOKING_STATUSES } from './booking.js';
import {
  CLINIC_BOOKING_ROLES,
  STAFF_BOOKING_TRANSITIONS,
  STAFF_ROLES,
  StaffBookingListQuerySchema,
  StaffBookingTransitionSchema,
  StaffLoginRequestSchema,
  canStaffTransition,
} from './staff.js';

describe('staff booking transition matrix', () => {
  it('allows exactly the documented moves', () => {
    const legal: [string, string][] = [];
    for (const from of BOOKING_STATUSES) for (const to of BOOKING_STATUSES) if (canStaffTransition(from, to)) legal.push([from, to]);
    expect(legal).toEqual([
      ['pending', 'confirmed'],
      ['pending', 'alternative_offered'],
      ['pending', 'cancelled'],
      ['alternative_offered', 'confirmed'],
      ['alternative_offered', 'cancelled'],
    ]);
  });

  it('has no way back to pending and no exit from terminal states; expiry is never a staff move', () => {
    for (const to of BOOKING_STATUSES) {
      expect(canStaffTransition('confirmed', to)).toBe(false);
      expect(canStaffTransition('cancelled', to)).toBe(false);
      expect(canStaffTransition('expired', to)).toBe(false);
      expect(canStaffTransition(to, 'pending')).toBe(false);
      expect(canStaffTransition(to, 'expired')).toBe(false);
    }
    expect(Object.keys(STAFF_BOOKING_TRANSITIONS).sort()).toEqual([...BOOKING_STATUSES].sort());
  });
});

describe('staff schemas', () => {
  it('only clinic roles are booking readers', () => {
    expect([...CLINIC_BOOKING_ROLES]).toEqual(['clinic_staff', 'clinic_admin']);
    expect(STAFF_ROLES).toContain('technical_admin');
    expect(CLINIC_BOOKING_ROLES).not.toContain('technical_admin');
  });

  it('login normalises e-mail and rejects unknown keys (no client-supplied role)', () => {
    expect(StaffLoginRequestSchema.parse({ email: '  Staff.A@Demo.Invalid ', password: 'x' }).email).toBe('staff.a@demo.invalid');
    expect(StaffLoginRequestSchema.safeParse({ email: 'a@b.c', password: 'x', role: 'technical_admin' }).success).toBe(false);
  });

  it('transition bodies are status-specific, strict and plain text only', () => {
    const ok = StaffBookingTransitionSchema.safeParse({ status: 'confirmed', visitDate: '2026-11-05', visitTime: '09:30', clinicNote: 'Side door.' });
    expect(ok.success).toBe(true);
    for (const bad of [
      { status: 'confirmed' },
      { status: 'confirmed', visitDate: '2026-02-30', visitTime: '09:30' },
      { status: 'confirmed', visitDate: '2026-11-05', visitTime: '9:30' },
      { status: 'confirmed', visitDate: '2026-11-05', visitTime: '09:30', clinicNote: '<b>x</b>' },
      { status: 'confirmed', visitDate: '2026-11-05', visitTime: '09:30', clinicNote: 'a\nb' },
      { status: 'confirmed', visitDate: '2026-11-05', visitTime: '09:30', visitInstructions: 'x'.repeat(501) },
      { status: 'alternative_offered', visitDate: '2026-11-05', visitTime: '09:30' },
      { status: 'cancelled', visitInstructions: 'x' },
      { status: 'pending' },
      { status: 'expired' },
    ]) {
      expect(StaffBookingTransitionSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
    expect(StaffBookingTransitionSchema.safeParse({ status: 'confirmed', visitDate: '2026-11-05', visitTime: '09:30', visitInstructions: 'One.\nTwo.' }).success).toBe(true);
  });

  it('list query has bounded paging defaults', () => {
    expect(StaffBookingListQuerySchema.parse({})).toEqual({ limit: 20, offset: 0 });
    expect(StaffBookingListQuerySchema.safeParse({ limit: '51' }).success).toBe(false);
    expect(StaffBookingListQuerySchema.parse({ status: 'pending', limit: '5', offset: '10' })).toEqual({ status: 'pending', limit: 5, offset: 10 });
  });
});
