import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  BookingLookupResponseSchema,
  StaffBookingDetailSchema,
  StaffBookingListSchema,
  type BookingStatus,
} from '@kalinga/shared';
import { expireStalePending } from './booking-queue.js';
import { isStalePending, planTransition, selectStalePending } from './decisions.js';
import { ADMIN_A, PROVINCIAL, STAFF_A, STAFF_B, TECH, createBooking, login, makeHarness, type Harness, type Session } from './test-support.js';

let h: Harness;
let app: ReturnType<Harness['build']>;
let A: Session;
let AdminA: Session;
let B: Session;
let T: Session;
let P: Session;

const CONFIRM = { status: 'confirmed', visitDate: '2026-11-05', visitTime: '10:00', visitInstructions: 'Please arrive 10 minutes early.' };
const ALT = { status: 'alternative_offered', alternativeDate: '2026-11-06', alternativeTime: '14:30' };
const CANCEL = { status: 'cancelled', clinicNote: 'The clinic cannot take this request.' };
const BODIES: Record<string, Record<string, unknown>> = { confirmed: CONFIRM, alternative_offered: ALT, cancelled: CANCEL };

const q = (clinic: string) => `/api/v1/staff/clinics/${clinic}/booking-requests`;
const get = (s: Session | null, path: string) => {
  const r = request(app).get(path);
  return s ? r.set('Cookie', s.cookie) : r;
};
const patch = (s: Session | null, clinic: string, id: string, version: number | string | null, body: unknown) => {
  let r = request(app).patch(`${q(clinic)}/${id}/status`).send(body as object);
  if (s) r = r.set('Cookie', s.cookie).set('X-CSRF-Token', s.csrf);
  if (version !== null) r = r.set('If-Match', `"${version}"`);
  return r;
};
const lookup = (reference: string, secret: string) => request(app).post('/api/v1/public/booking-requests/lookup').send({ reference, secret });
async function row(id: string): Promise<{ status: BookingStatus; version: number; clinic_note: string | null }> {
  const r = await h.db.query<{ status: BookingStatus; version: number; clinic_note: string | null }>('select status, version, clinic_note from booking_requests where id = $1', [id]);
  return r.rows[0] ?? { status: 'pending', version: 0, clinic_note: null };
}
async function setStatus(id: string, status: BookingStatus): Promise<void> {
  await h.db.query(`update booking_requests set status = $2::booking_status, version = 1 where id = $1`, [id, status]);
}

beforeAll(async () => {
  h = await makeHarness();
  app = h.build();
  [A, AdminA, B, T, P] = await Promise.all([login(app, STAFF_A), login(app, ADMIN_A), login(app, STAFF_B), login(app, TECH), login(app, PROVINCIAL)]);
});
afterAll(async () => {
  await h.db.close();
});
beforeEach(async () => {
  h.clock.now = new Date('2026-10-30T04:00:00Z');
  h.logs.length = 0;
  await h.db.exec('delete from lookup_attempts; delete from idempotency_keys; delete from booking_requests; truncate audit_events;');
});

describe('authentication and scope', () => {
  it('answers 401 to every staff booking route without a session', async () => {
    const b = await createBooking(app, h.db);
    expect((await get(null, q('demo-clinic-a'))).status).toBe(401);
    expect((await get(null, `${q('demo-clinic-a')}/${b.id}`)).status).toBe(401);
    expect((await patch(null, 'demo-clinic-a', b.id, 1, CONFIRM)).status).toBe(401);
    expect((await row(b.id)).status).toBe('pending');
  });

  it('every response is no-store', async () => {
    const b = await createBooking(app, h.db);
    for (const res of [await get(A, q('demo-clinic-a')), await get(A, `${q('demo-clinic-a')}/${b.id}`), await get(null, q('demo-clinic-a')), await get(B, q('demo-clinic-a'))]) {
      expect(res.headers['cache-control']).toBe('no-store');
    }
  });

  it('staff of clinic A cannot list, read or decide clinic B requests: always 404, nothing changes', async () => {
    const own = await createBooking(app, h.db, { clinicId: 'demo-clinic-a' });
    const theirs = await createBooking(app, h.db, { clinicId: 'demo-clinic-b', service: 'sti_testing' });
    const notFound = (r: { status: number; body: { error?: { code: string } } }) => {
      expect(r.status).toBe(404);
      expect(r.body.error?.code).toBe('not_found');
    };
    notFound(await get(A, q('demo-clinic-b')));
    notFound(await get(A, `${q('demo-clinic-b')}/${theirs.id}`));
    notFound(await get(A, `${q('demo-clinic-a')}/${theirs.id}`)); // B's id under A's own path
    notFound(await patch(A, 'demo-clinic-b', theirs.id, 1, CONFIRM));
    notFound(await patch(A, 'demo-clinic-a', theirs.id, 1, CONFIRM));
    // The reverse direction too.
    notFound(await get(B, `${q('demo-clinic-b')}/${own.id}`));
    notFound(await patch(B, 'demo-clinic-b', own.id, 1, CANCEL));
    expect(await row(theirs.id)).toMatchObject({ status: 'pending', version: 1 });
    expect(await row(own.id)).toMatchObject({ status: 'pending', version: 1 });
    expect((await h.db.query('select 1 from audit_events where action = $1', ['booking_request.status_changed'])).rows).toHaveLength(0);
  });

  it('a nonexistent clinic, a malformed clinic id and a foreign clinic are indistinguishable', async () => {
    const a = await get(A, q('demo-clinic-b'));
    const b = await get(A, q('00000000-0000-0000-0000-000000000000'));
    const c = await get(A, q('no-such-clinic'));
    const d = await get(A, q("a'%20or%201=1"));
    for (const r of [a, b, c, d]) expect(r.status).toBe(404);
    expect(b.body.error.message).toBe(a.body.error.message);
    expect(c.body.error.code).toBe(a.body.error.code);
  });

  it('resolves the clinic by uuid as well as by slug, and denies a foreign uuid', async () => {
    const own = (await h.db.query<{ id: string }>(`select id from clinics where slug = 'demo-clinic-a'`)).rows[0]?.id ?? '';
    const foreign = (await h.db.query<{ id: string }>(`select id from clinics where slug = 'demo-clinic-b'`)).rows[0]?.id ?? '';
    await get(A, q(own)).expect(200);
    await get(A, q(foreign)).expect(404);
  });

  it('technical and provincial admins are not booking readers; a malformed request id is 404', async () => {
    const b = await createBooking(app, h.db);
    expect((await get(T, `${q('demo-clinic-a')}/${b.id}`)).status).toBe(404);
    expect((await get(P, q('demo-clinic-a'))).status).toBe(404);
    expect((await patch(T, 'demo-clinic-a', b.id, 1, CONFIRM)).status).toBe(404);
    expect((await get(A, `${q('demo-clinic-a')}/not-a-uuid`)).status).toBe(404);
    expect((await get(A, `${q('demo-clinic-a')}/00000000-0000-0000-0000-000000000000`)).status).toBe(404);
  });

  it('records denied clinic access in the audit log without request content', async () => {
    await get(B, q('demo-clinic-a')).expect(404);
    const r = await h.db.query<{ action: string; metadata: unknown; clinic_id: string | null }>(`select action, metadata, clinic_id from audit_events`);
    expect(r.rows).toEqual([{ action: 'booking_request.access_denied', metadata: { outcome: 'denied' }, clinic_id: null }]);
  });
});

describe('GET queue and detail', () => {
  it('lists only this clinic, filters by status, paginates, and never exposes the secret verifier', async () => {
    const dates = ['2026-11-05', '2026-11-03', '2026-11-04', '2026-11-06', '2026-11-07'];
    const made = [];
    for (const d of dates) made.push(await createBooking(app, h.db, { clinicId: 'demo-clinic-a', preferredDate: d, notes: 'REQUESTER-FREE-TEXT-NOTE' }));
    await createBooking(app, h.db, { clinicId: 'demo-clinic-b', service: 'sti_testing' });

    const all = await get(A, q('demo-clinic-a')).expect(200);
    const list = StaffBookingListSchema.parse(all.body);
    expect(list.total).toBe(5);
    expect(list.items.map((i) => i.preferredDate)).toEqual([...dates].sort()); // soonest first
    const text = JSON.stringify(all.body);
    expect(text).not.toContain('REQUESTER-FREE-TEXT-NOTE'); // queue is minimal metadata
    for (const m of made) expect(text).not.toContain(m.secret);
    expect(text).not.toMatch(/secret|hash/i);
    for (const r of (await h.db.query<{ secret_hash: string }>('select secret_hash from booking_requests')).rows) expect(text).not.toContain(r.secret_hash);

    const page = StaffBookingListSchema.parse((await get(A, `${q('demo-clinic-a')}?limit=2&offset=2`).expect(200)).body);
    expect(page.items.map((i) => i.preferredDate)).toEqual(['2026-11-05', '2026-11-06']);
    expect(page).toMatchObject({ total: 5, limit: 2, offset: 2 });

    const first = made[1];
    if (!first) throw new Error('setup');
    await patch(A, 'demo-clinic-a', first.id, 1, CONFIRM).expect(200);
    const pending = StaffBookingListSchema.parse((await get(A, `${q('demo-clinic-a')}?status=pending`)).body);
    const confirmed = StaffBookingListSchema.parse((await get(A, `${q('demo-clinic-a')}?status=confirmed`)).body);
    expect([pending.total, confirmed.total]).toEqual([4, 1]);
    expect(confirmed.items[0]?.id).toBe(first.id);
    // Clinic B sees only its own one.
    expect(StaffBookingListSchema.parse((await get(B, q('demo-clinic-b'))).body).total).toBe(1);
  });

  it('rejects bad queries (400) rather than ignoring them', async () => {
    for (const qs of ['limit=0', 'limit=500', 'offset=-1', 'status=hacked', 'sort=notes', 'limit=abc']) {
      expect((await get(A, `${q('demo-clinic-a')}?${qs}`)).status).toBe(400);
    }
  });

  it('detail shows the requester preferences, the clinic fields, an ETag and the allowed next states', async () => {
    const b = await createBooking(app, h.db, { notes: 'Prefer a quiet time.', contactPreference: 'sms' });
    const res = await get(A, `${q('demo-clinic-a')}/${b.id}`).expect(200);
    const d = StaffBookingDetailSchema.parse(res.body);
    expect(res.headers.etag).toBe('"1"');
    expect(d).toMatchObject({ id: b.id, reference: b.reference, status: 'pending', version: 1, notes: 'Prefer a quiet time.', contactPreference: 'sms', clinicNote: null, visitInstructions: null });
    expect(d.allowedTransitions).toEqual(['confirmed', 'alternative_offered', 'cancelled']);
    expect(d.clinic.slug).toBe('demo-clinic-a');
    expect(JSON.stringify(res.body)).not.toContain(b.secret);
    expect(JSON.stringify(res.body)).not.toMatch(/secret_hash|secretHash|"secret"/);
  });
});

describe('guarded transitions', () => {
  const LEGAL: Record<string, string[]> = {
    pending: ['confirmed', 'alternative_offered', 'cancelled'],
    alternative_offered: ['confirmed', 'cancelled'],
    confirmed: [],
    cancelled: [],
    expired: [],
  };

  for (const from of Object.keys(LEGAL)) {
    for (const to of ['confirmed', 'alternative_offered', 'cancelled']) {
      const legal = LEGAL[from]?.includes(to) ?? false;
      it(`${from} -> ${to} is ${legal ? 'allowed' : 'rejected with 409 illegal_transition'}`, async () => {
        const b = await createBooking(app, h.db);
        await setStatus(b.id, from as BookingStatus);
        const res = await patch(A, 'demo-clinic-a', b.id, 1, BODIES[to]);
        if (legal) {
          expect(res.status).toBe(200);
          const d = StaffBookingDetailSchema.parse(res.body);
          expect(d.status).toBe(to);
          expect(d.version).toBe(2);
          expect(d.decidedAt).not.toBeNull();
          expect(await row(b.id)).toMatchObject({ status: to, version: 2 });
        } else {
          expect(res.status).toBe(409);
          expect(res.body.error.code).toBe('illegal_transition');
          expect(await row(b.id)).toMatchObject({ status: from, version: 1 });
        }
      });
    }
  }

  it('cannot move back to pending or to expired through the API (schema rejects), nor skip validation', async () => {
    const b = await createBooking(app, h.db);
    expect((await patch(A, 'demo-clinic-a', b.id, 1, { status: 'pending' })).status).toBe(400);
    expect((await patch(A, 'demo-clinic-a', b.id, 1, { status: 'expired' })).status).toBe(400);
    expect((await patch(A, 'demo-clinic-a', b.id, 1, {})).status).toBe(400);
    expect((await row(b.id)).status).toBe('pending');
  });

  it('confirm requires a visit time; alternative requires its own time; cancel takes no times', async () => {
    const b = await createBooking(app, h.db);
    expect((await patch(A, 'demo-clinic-a', b.id, 1, { status: 'confirmed' })).status).toBe(400);
    expect((await patch(A, 'demo-clinic-a', b.id, 1, { status: 'confirmed', visitDate: '2026-11-05' })).status).toBe(400);
    expect((await patch(A, 'demo-clinic-a', b.id, 1, { status: 'alternative_offered', visitDate: '2026-11-05', visitTime: '10:00' })).status).toBe(400);
    expect((await patch(A, 'demo-clinic-a', b.id, 1, { status: 'cancelled', visitDate: '2026-11-05' })).status).toBe(400);
    expect((await patch(A, 'demo-clinic-a', b.id, 1, { ...CONFIRM, visitTime: '25:00' })).status).toBe(400);
    expect((await patch(A, 'demo-clinic-a', b.id, 1, { ...CONFIRM, visitDate: '2026-02-30' })).status).toBe(400);
    expect((await row(b.id)).version).toBe(1);
  });

  it('rejects past and too-distant visit times (Asia/Manila)', async () => {
    const b = await createBooking(app, h.db);
    // Clock is 2026-10-30 12:00 Manila.
    const past = await patch(A, 'demo-clinic-a', b.id, 1, { ...CONFIRM, visitDate: '2026-10-30', visitTime: '11:59' });
    expect(past.status).toBe(400);
    expect(past.body.error.code).toBe('visit_time_invalid');
    expect((await patch(A, 'demo-clinic-a', b.id, 1, { ...CONFIRM, visitDate: '2027-06-01' })).status).toBe(400);
    await patch(A, 'demo-clinic-a', b.id, 1, { ...CONFIRM, visitDate: '2026-10-30', visitTime: '12:01' }).expect(200);
  });

  it('accepts only plain, length-capped text', async () => {
    const b = await createBooking(app, h.db);
    const bad = async (extra: Record<string, unknown>) => expect((await patch(A, 'demo-clinic-a', b.id, 1, { ...CONFIRM, ...extra })).status).toBe(400);
    await bad({ clinicNote: '<b>bold</b>' });
    await bad({ clinicNote: '<script>alert(1)</script>' });
    await bad({ visitInstructions: 'see <img src=x onerror=alert(1)>' });
    await bad({ clinicNote: 'x'.repeat(201) });
    await bad({ visitInstructions: 'x'.repeat(501) });
    await bad({ clinicNote: 'line one\nline two' }); // note is a single line
    await bad({ clinicNote: 'bell\u0007char' });
    await bad({ clinicNote: '   ' });
    await bad({ unexpected: 'field' });
    await bad({ clinicNote: 123 });
    expect((await row(b.id)).version).toBe(1);
    // Ampersands and quotes are plain text and stored verbatim (the UI escapes on render).
    const ok = await patch(A, 'demo-clinic-a', b.id, 1, { ...CONFIRM, clinicNote: `Tom & Jerry's "room"`, visitInstructions: 'Line one.\nLine two.' }).expect(200);
    expect(ok.body.clinicNote).toContain(`Tom & Jerry's "room"`);
    expect(ok.body.visitInstructions).toBe('Line one.\nLine two.');
    expect(ok.body.clinicNote.length).toBeLessThanOrEqual(300);
  });

  it('the longest allowed alternative note still fits the 300-character public column', async () => {
    const b = await createBooking(app, h.db);
    const res = await patch(A, 'demo-clinic-a', b.id, 1, { ...ALT, clinicNote: 'n'.repeat(200), visitInstructions: 'i'.repeat(500) }).expect(200);
    expect(res.body.clinicNote.length).toBeLessThanOrEqual(300);
  });

  it('requires If-Match: 428 when missing, 400 when malformed, 409 version_conflict when stale', async () => {
    const b = await createBooking(app, h.db);
    const missing = await patch(A, 'demo-clinic-a', b.id, null, CONFIRM);
    expect(missing.status).toBe(428);
    expect(missing.body.error.code).toBe('precondition_required');
    expect((await patch(A, 'demo-clinic-a', b.id, 'abc', CONFIRM)).status).toBe(400);
    const stale = await patch(A, 'demo-clinic-a', b.id, 7, CONFIRM);
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('version_conflict');
    expect((await row(b.id)).version).toBe(1);
    await request(app).patch(`${q('demo-clinic-a')}/${b.id}/status`).set('Cookie', A.cookie).set('X-CSRF-Token', A.csrf).set('If-Match', '1').send(CONFIRM).expect(200); // unquoted form
  });

  it('two staff confirming at once: exactly one wins, the loser gets 409 and nothing is applied twice', async () => {
    const b = await createBooking(app, h.db);
    const [r1, r2] = await Promise.all([
      patch(A, 'demo-clinic-a', b.id, 1, { ...CONFIRM, visitTime: '09:00' }),
      patch(AdminA, 'demo-clinic-a', b.id, 1, { ...CONFIRM, visitTime: '15:00' }),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([200, 409]);
    const loser = r1.status === 409 ? r1 : r2;
    expect(loser.body.error.code).toBe('version_conflict');
    const winner = r1.status === 200 ? r1 : r2;
    const final = await row(b.id);
    expect(final).toMatchObject({ status: 'confirmed', version: 2 });
    expect(final.clinic_note).toContain(winner === r1 ? '09:00' : '15:00');
    const audits = await h.db.query('select 1 from audit_events where action = $1', ['booking_request.status_changed']);
    expect(audits.rows).toHaveLength(1);
  });

  it('an optimistic retry after a conflict with the fresh version is then judged by the state machine', async () => {
    const b = await createBooking(app, h.db);
    await patch(A, 'demo-clinic-a', b.id, 1, CANCEL).expect(200);
    const retry = await patch(AdminA, 'demo-clinic-a', b.id, 2, CONFIRM); // fresh version, illegal move
    expect(retry.status).toBe(409);
    expect(retry.body.error.code).toBe('illegal_transition');
  });

  it('CSRF is enforced on the decision route', async () => {
    const b = await createBooking(app, h.db);
    const noToken = await request(app).patch(`${q('demo-clinic-a')}/${b.id}/status`).set('Cookie', A.cookie).set('If-Match', '"1"').send(CONFIRM);
    expect(noToken.status).toBe(403);
    expect(noToken.body.error.code).toBe('csrf_rejected');
    const wrong = await request(app).patch(`${q('demo-clinic-a')}/${b.id}/status`).set('Cookie', A.cookie).set('X-CSRF-Token', B.csrf).set('If-Match', '"1"').send(CONFIRM);
    expect(wrong.status).toBe(403);
    const foreign = await request(app)
      .patch(`${q('demo-clinic-a')}/${b.id}/status`)
      .set('Origin', 'https://evil.example')
      .set('Cookie', A.cookie)
      .set('X-CSRF-Token', A.csrf)
      .set('If-Match', '"1"')
      .send(CONFIRM);
    expect(foreign.status).toBe(403);
    expect((await row(b.id)).status).toBe('pending');
  });

  it('writes the exact columns the public lookup reads, plus structured times and the decision stamp', async () => {
    const b = await createBooking(app, h.db);
    await patch(A, 'demo-clinic-a', b.id, 1, { ...CONFIRM, clinicNote: 'Use the side entrance.' }).expect(200);
    const r = await h.db.query<{ clinic_note: string; visit_instructions: string; visit_starts_at: string; decided_by: string; alternative_starts_at: string | null }>(
      `select clinic_note, visit_instructions, visit_starts_at::text as visit_starts_at, decided_by, alternative_starts_at::text as alternative_starts_at from booking_requests where id = $1`,
      [b.id],
    );
    expect(r.rows[0]?.clinic_note).toBe('Visit time (Asia/Manila): 2026-11-05 10:00. Use the side entrance.');
    expect(r.rows[0]?.visit_instructions).toBe('Please arrive 10 minutes early.');
    expect(new Date(r.rows[0]?.visit_starts_at ?? '').toISOString()).toBe('2026-11-05T02:00:00.000Z'); // 10:00 +08:00
    expect(r.rows[0]?.decided_by).toBe((A.body as { user: { id: string } }).user.id);
    expect(r.rows[0]?.alternative_starts_at).toBeNull();
  });
});

describe('public status lookup reflects the staff decision', () => {
  it('pending -> alternative -> confirmed -> visible to the requester; terminal afterwards', async () => {
    const b = await createBooking(app, h.db);
    const initial = BookingLookupResponseSchema.parse((await lookup(b.reference, b.secret).expect(200)).body);
    expect(initial).toMatchObject({ status: 'pending', clinicNote: null, visitInstructions: null });

    h.clock.now = new Date('2026-10-30T04:05:00Z');
    await patch(A, 'demo-clinic-a', b.id, 1, { ...ALT, visitInstructions: 'Bring this reference.' }).expect(200);
    const alt = BookingLookupResponseSchema.parse((await lookup(b.reference, b.secret).expect(200)).body);
    expect(alt.status).toBe('alternative_offered');
    expect(alt.clinicNote).toBe('Clinic proposes another time (Asia/Manila): 2026-11-06 14:30. Not yet confirmed.');
    expect(alt.visitInstructions).toBe('Bring this reference.');

    await patch(AdminA, 'demo-clinic-a', b.id, 2, CONFIRM).expect(200);
    const done = BookingLookupResponseSchema.parse((await lookup(b.reference, b.secret).expect(200)).body);
    expect(done.status).toBe('confirmed');
    expect(done.clinicNote).toBe('Visit time (Asia/Manila): 2026-11-05 10:00.');
    expect(done.visitInstructions).toBe('Please arrive 10 minutes early.');
    expect(done.updatedAt).not.toBe(initial.updatedAt);
    expect(done.requestOnly).toBe(true);
    expect(Object.keys(done).sort()).toEqual(['clinic', 'clinicNote', 'demo', 'reference', 'requestOnly', 'status', 'updatedAt', 'visitInstructions']);

    expect((await patch(A, 'demo-clinic-a', b.id, 3, CANCEL)).status).toBe(409); // confirmed is terminal
  });

  it('a cancellation by the clinic is shown, with only the clinic note', async () => {
    const b = await createBooking(app, h.db);
    await patch(A, 'demo-clinic-a', b.id, 1, CANCEL).expect(200);
    const res = BookingLookupResponseSchema.parse((await lookup(b.reference, b.secret).expect(200)).body);
    expect(res).toMatchObject({ status: 'cancelled', clinicNote: 'The clinic cannot take this request.', visitInstructions: null });
  });
});

describe('audit log redaction', () => {
  it('writes one redacted event per transition and never stores secrets, references, contacts or free text', async () => {
    const b = await createBooking(app, h.db, { notes: 'REQUESTER-FREE-TEXT-NOTE', contactPreference: 'email' });
    await patch(A, 'demo-clinic-a', b.id, 1, { ...ALT, clinicNote: 'STAFF-FREE-TEXT-NOTE', visitInstructions: 'STAFF-INSTRUCTION-TEXT' }).expect(200);
    await patch(AdminA, 'demo-clinic-a', b.id, 2, CONFIRM).expect(200);
    const rows = await h.db.query<{ action: string; actor_user_id: string | null; target_id: string; clinic_id: string; metadata: Record<string, unknown> }>(
      `select action, actor_user_id, target_id, clinic_id, metadata from audit_events where action = 'booking_request.status_changed' order by created_at, (metadata->>'version_before')`,
    );
    expect(rows.rows).toHaveLength(2);
    expect(rows.rows.map((r) => r.metadata)).toEqual([
      { from_status: 'pending', to_status: 'alternative_offered', version_before: 1, version_after: 2, visit_time_set: true, text_added: true },
      { from_status: 'alternative_offered', to_status: 'confirmed', version_before: 2, version_after: 3, visit_time_set: true, text_added: true },
    ]);
    expect(rows.rows[0]?.target_id).toBe(b.id);
    expect(rows.rows[0]?.actor_user_id).toBe((A.body as { user: { id: string } }).user.id);
    expect(rows.rows[1]?.actor_user_id).toBe((AdminA.body as { user: { id: string } }).user.id);

    const everything = JSON.stringify((await h.db.query('select * from audit_events')).rows);
    const hash = (await h.db.query<{ secret_hash: string }>('select secret_hash from booking_requests')).rows[0]?.secret_hash ?? 'none';
    for (const forbidden of [b.secret, b.reference, hash, 'REQUESTER-FREE-TEXT-NOTE', 'STAFF-FREE-TEXT-NOTE', 'STAFF-INSTRUCTION-TEXT', 'demo.invalid', 'email', 'password', 'Please arrive']) {
      expect(everything).not.toContain(forbidden);
    }
    expect(h.logs.join('\n')).not.toMatch(new RegExp(`${b.secret}|${b.reference}|STAFF-FREE-TEXT|REQUESTER-FREE`));
  });

  it('a failed transition (conflict, illegal, forbidden) leaves no status-change audit row', async () => {
    const b = await createBooking(app, h.db);
    await patch(A, 'demo-clinic-a', b.id, 9, CONFIRM);
    await patch(B, 'demo-clinic-a', b.id, 1, CONFIRM);
    await patch(A, 'demo-clinic-a', b.id, 1, { ...CONFIRM, visitDate: '2020-01-01' });
    expect((await h.db.query(`select 1 from audit_events where action = 'booking_request.status_changed'`)).rows).toHaveLength(0);
  });
});

describe('stale pending expiry helper', () => {
  const now = new Date('2026-10-30T04:00:00Z');
  const c = (over: Partial<Parameters<typeof isStalePending>[0]> = {}) => ({ id: 'x', status: 'pending' as const, createdAt: new Date('2026-10-29T00:00:00Z'), preferredDate: '2026-11-03', ...over });

  it('is a pure rule: only pending, and only when old enough or the preferred date has passed (Manila)', () => {
    expect(isStalePending(c(), now)).toBe(false);
    expect(isStalePending(c({ createdAt: new Date('2026-10-16T04:00:00Z') }), now)).toBe(true); // exactly 14 days
    expect(isStalePending(c({ createdAt: new Date('2026-10-16T04:00:01Z') }), now)).toBe(false);
    expect(isStalePending(c({ preferredDate: '2026-10-29' }), now)).toBe(true);
    expect(isStalePending(c({ preferredDate: '2026-10-30' }), now)).toBe(false); // today in Manila
    expect(isStalePending(c({ preferredDate: '2026-10-30' }), new Date('2026-10-30T16:30:00Z'))).toBe(true); // already 31 Oct 00:30 in Manila
    for (const status of ['confirmed', 'alternative_offered', 'cancelled', 'expired'] as const) {
      expect(isStalePending(c({ status, preferredDate: '2020-01-01' }), now)).toBe(false);
    }
    expect(selectStalePending([c({ id: 'a' }), c({ id: 'b', preferredDate: '2020-01-01' })], now)).toEqual(['b']);
    expect(isStalePending(c({ createdAt: new Date('2026-10-27T00:00:00Z') }), now, 3)).toBe(true);
  });

  it('expires stale pending rows in the database, audits each as a system event and the requester sees "expired"', async () => {
    const stale = await createBooking(app, h.db, { preferredDate: '2026-11-03' });
    const fresh = await createBooking(app, h.db, { preferredDate: '2026-11-03' });
    const decided = await createBooking(app, h.db, { preferredDate: '2026-11-03' });
    await patch(A, 'demo-clinic-a', decided.id, 1, ALT).expect(200);
    await h.db.query(`update booking_requests set created_at = $2::timestamptz where id = $1`, [stale.id, '2026-10-10T00:00:00Z']);

    expect(await expireStalePending(h.db, h.clock.now)).toBe(1);
    expect(await row(stale.id)).toMatchObject({ status: 'expired', version: 2 });
    expect((await row(fresh.id)).status).toBe('pending');
    expect((await row(decided.id)).status).toBe('alternative_offered');
    expect(await expireStalePending(h.db, h.clock.now)).toBe(0); // idempotent

    const audit = await h.db.query<{ actor_kind: string; actor_user_id: string | null; metadata: unknown }>(`select actor_kind, actor_user_id, metadata from audit_events where action = 'booking_request.expired'`);
    expect(audit.rows).toEqual([{ actor_kind: 'system', actor_user_id: null, metadata: { from_status: 'pending', to_status: 'expired', version_before: 1, version_after: 2 } }]);
    expect(BookingLookupResponseSchema.parse((await lookup(stale.reference, stale.secret).expect(200)).body).status).toBe('expired');
    expect((await patch(A, 'demo-clinic-a', stale.id, 2, CONFIRM)).status).toBe(409); // expired is terminal
  });
});

describe('planTransition (pure)', () => {
  const now = new Date('2026-10-30T04:00:00Z');
  it('computes columns without touching the database and refuses illegal moves', () => {
    const plan = planTransition('pending', { status: 'confirmed', visitDate: '2026-11-05', visitTime: '10:00' }, now);
    expect(plan).toMatchObject({ status: 'confirmed', alternativeStartsAt: null, visitInstructions: null });
    expect(plan.visitStartsAt?.toISOString()).toBe('2026-11-05T02:00:00.000Z');
    expect(() => planTransition('confirmed', { status: 'cancelled' }, now)).toThrow();
    expect(() => planTransition('cancelled', { status: 'confirmed', visitDate: '2026-11-05', visitTime: '10:00' }, now)).toThrow();
    expect(planTransition('alternative_offered', { status: 'cancelled' }, now)).toMatchObject({ status: 'cancelled', clinicNote: null });
  });
});
