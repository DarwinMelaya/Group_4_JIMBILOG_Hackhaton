import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ADMIN, auditRows, call, clinicIdOf, loginAll, makeHarness, type App, type Harness, type Sessions } from '../governance/test-support.js';

let h: Harness;
let app: App;
let S: Sessions;
let clinicA: string;
let clinicB: string;
let seq = 0;

type Status = 'pending' | 'confirmed' | 'alternative_offered' | 'cancelled' | 'expired';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

async function add(clinic: string, status: Status, n: number, createdAt = '2026-10-15T03:00:00Z'): Promise<void> {
  for (let i = 0; i < n; i += 1) {
    seq += 1;
    const ref = `KAL-${seq.toString(6).replace(/\d/g, (d) => ALPHABET.charAt(Number(d))).padStart(10, 'Z')}`;
    await h.db.query(
      `insert into booking_requests (reference, secret_hash, clinic_id, status, preferred_date, preferred_window, age_band, is_demo, retention_expires_at, created_at)
       values ($1, $2, $3, $4::booking_status, '2026-11-03', 'morning', '18_plus', true, '2027-01-01T00:00:00Z', $5::timestamptz)`,
      [ref, 'a'.repeat(64), clinic, status, createdAt],
    );
  }
}

const SUMMARY = `${ADMIN}/reports/summary`;
const CSV = `${ADMIN}/reports/export.csv`;

beforeAll(async () => {
  h = await makeHarness('2026-10-30T04:00:00Z');
  app = h.build();
  S = await loginAll(app);
  clinicA = await clinicIdOf(h.db, 'demo-clinic-a');
  clinicB = await clinicIdOf(h.db, 'demo-clinic-b');
});
afterAll(async () => {
  await h.db.close();
});
beforeEach(async () => {
  await h.db.query('delete from booking_requests');
  await h.db.query(`update report_settings set bool_value = false`);
});

interface Summary {
  scope: string;
  periods: Array<Record<string, unknown>>;
  attendance?: unknown;
}

const first = async (s: Parameters<typeof call>[1], months = '1'): Promise<Record<string, unknown>> =>
  ((await call(app, s, 'get', SUMMARY).query({ months })).body as Summary).periods[0] as Record<string, unknown>;

describe('GET /admin/reports/summary', () => {
  it('returns a window of months, newest last, all suppressed when empty', async () => {
    const res = await call(app, S.prov, 'get', SUMMARY).query({ months: '3' });
    expect(res.status).toBe(200);
    const b = res.body as Summary;
    expect(b.periods.map((p) => p.period)).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(b.periods[2]).toMatchObject({ received: '<5', awaiting: '<5', confirmed: '<5', alternative: '<5', cancelled: '<5', expired: '<5' });
  });

  it('is no-store and omits attendance by default; reports a flag-only field when approved', async () => {
    const res = await call(app, S.prov, 'get', SUMMARY);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).not.toHaveProperty('attendance');
    await h.db.query(`update report_settings set bool_value = true where key = 'attendance_reporting_approved'`);
    const on = await call(app, S.prov, 'get', SUMMARY);
    expect((on.body as Summary).attendance).toEqual({ status: 'not_collected' });
  });

  it('suppresses 0 and 1..4, and publishes exactly 5', async () => {
    await add(clinicA, 'confirmed', 5);
    await add(clinicA, 'cancelled', 8);
    await add(clinicA, 'expired', 3);
    await add(clinicA, 'alternative_offered', 6);
    await add(clinicA, 'pending', 2); // S9-3: hidden cells must sum to >= 5 (3 + 2) or the 5 is hidden as well
    const p = await first(S.prov);
    expect(p).toMatchObject({ received: 24, confirmed: 5, cancelled: 8, alternative: 6, expired: '<5', awaiting: '<5' });
  });

  it('a single suppressed cell also hides the next smallest cell (complementary)', async () => {
    await add(clinicA, 'pending', 6);
    await add(clinicA, 'confirmed', 7);
    await add(clinicA, 'alternative_offered', 8);
    await add(clinicA, 'cancelled', 9);
    await add(clinicA, 'expired', 2);
    const p = await first(S.prov);
    expect(p).toMatchObject({ received: 32, expired: '<5', awaiting: '<5', confirmed: 7, alternative: 8, cancelled: 9 });
  });

  it('buckets by Asia/Manila calendar month', async () => {
    await add(clinicA, 'confirmed', 5, '2026-09-30T17:00:00Z'); // 01:00 on 1 Oct in Manila
    await add(clinicA, 'confirmed', 5, '2026-09-30T15:59:00Z'); // 23:59 on 30 Sep in Manila
    const ps = ((await call(app, S.prov, 'get', SUMMARY).query({ months: '2' })).body as Summary).periods;
    // S9-3: the zero cells sum to 0 (< 5), so the lone confirmed cell is hidden too; the published total shows the bucket.
    expect(ps.find((p) => p.period === '2026-10')?.received).toBe(5);
    expect(ps.find((p) => p.period === '2026-09')?.received).toBe(5);
  });

  it('clinic_admin sees only their own clinic; provincial and technical see all', async () => {
    await add(clinicA, 'confirmed', 6);
    await add(clinicB, 'confirmed', 9);
    const mine = (await call(app, S.adminA, 'get', SUMMARY).query({ months: '1' })).body as Summary;
    expect(mine.scope).toBe('clinic');
    expect(mine.periods[0]).toMatchObject({ received: 6, confirmed: '<5' });
    for (const s of [S.prov, S.tech]) {
      const all = (await call(app, s, 'get', SUMMARY).query({ months: '1' })).body as Summary;
      expect(all.scope).toBe('all');
      expect(all.periods[0]).toMatchObject({ received: 15, confirmed: '<5' });
    }
  });

  it('clinic_staff is forbidden; a client cannot choose another clinic', async () => {
    expect((await call(app, S.staffA, 'get', SUMMARY)).status).toBe(403);
    await add(clinicB, 'confirmed', 9);
    const p = await call(app, S.adminA, 'get', SUMMARY).query({ months: '1', clinicId: clinicB });
    expect((p.body as Summary).periods[0]).toMatchObject({ received: '<5' });
  });

  it('rejects an invalid months value', async () => {
    for (const m of ['0', '13', 'x', '-1', '1.5']) expect((await call(app, S.prov, 'get', SUMMARY).query({ months: m })).status).toBe(400);
  });

  it('contains no per-record, contact or credential fields', async () => {
    await add(clinicA, 'confirmed', 6);
    const text = JSON.stringify((await call(app, S.prov, 'get', SUMMARY)).body).toLowerCase();
    for (const bad of ['kal-', 'reference', 'secret', 'contact', 'phone', 'email', 'notes', 'ageband', 'clinicid', 'preferred', 'hash', 'password']) {
      expect(text.includes(bad), `response must not mention ${bad}`).toBe(false);
    }
  });
});

describe('GET /admin/reports/export.csv', () => {
  it('returns redacted aggregates as no-store CSV and records one audit event per export', async () => {
    await add(clinicA, 'confirmed', 6);
    await add(clinicA, 'cancelled', 2);
    await add(clinicA, 'expired', 3); // S9-3: hidden cells sum to 5 so confirmed 6 can stay published
    const before = (await auditRows(h.db, 'governance.report_exported')).length;
    const res = await call(app, S.adminA, 'get', CSV).query({ months: '1' });
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['content-type']).toMatch(/^text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/^attachment;/);
    const lines = res.text.trim().split(/\r?\n/);
    expect(lines[0]).toBe('period,metric,count');
    expect(lines).toContain('2026-10,received,11');
    expect(lines).toContain('2026-10,confirmed,6');
    expect(lines).toContain('2026-10,cancelled,<5');
    for (const l of lines.slice(1)) expect(l).toMatch(/^\d{4}-\d{2},[a-z]+,(\d+|<5)$/);
    expect(res.text.toLowerCase()).not.toMatch(/kal-|secret|reference|contact/);
    const rows = await auditRows(h.db, 'governance.report_exported');
    expect(rows.length).toBe(before + 1);
    const last = rows[rows.length - 1];
    expect(last?.target_type).toBe('report');
    expect(last?.metadata).toMatchObject({ outcome: 'exported', role: 'clinic_admin' });
  });

  it('is limited to the same clinic scope as the summary', async () => {
    await add(clinicB, 'confirmed', 20);
    const res = await call(app, S.adminA, 'get', CSV).query({ months: '1' });
    expect(res.text).not.toMatch(/,20\r?$/m);
    expect(res.text).toContain('2026-10,received,<5');
  });

  it('401 without a session and 403 for clinic_staff, with no audit event', async () => {
    const before = (await auditRows(h.db, 'governance.report_exported')).length;
    expect((await call(app, null, 'get', CSV)).status).toBe(401);
    expect((await call(app, S.staffA, 'get', CSV)).status).toBe(403);
    expect((await auditRows(h.db, 'governance.report_exported')).length).toBe(before);
  });
});
