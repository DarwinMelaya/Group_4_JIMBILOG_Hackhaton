import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { DevOutboxResponseSchema, LOOKUP_MAX_FAILURES, ReminderPreferenceResponseSchema } from '@kalinga/shared';
import { loadEnv } from '../env.js';
import { STAFF_A, createBooking, login, makeHarness, type Harness, type Session } from '../staff/test-support.js';
import { DisabledTransport, MockTransport, selectTransport } from './mock-transport.js';
import { dispatchDueReminders, enqueueForConfirmedRequest, REMINDER_BACKOFF_BASE_MS } from './service.js';

let h: Harness;
let app: ReturnType<Harness['build']>;
let staff: Session;

const REMIND = '/api/v1/public/booking-requests/reminders';
const CONFIRM = { status: 'confirmed', visitDate: '2026-11-05', visitTime: '10:00' }; // 2026-11-05T02:00Z
const VISIT = new Date('2026-11-05T02:00:00Z');
const DUE = new Date('2026-11-04T02:00:00Z'); // 24 h before the visit
const T0 = new Date('2026-10-30T04:00:00Z');

const cr = (b: { reference: string; secret: string }): { reference: string; secret: string } => ({ reference: b.reference, secret: b.secret });
const optIn = (b: { reference: string; secret: string }, channel: 'mock_sms' | 'mock_email' = 'mock_sms', locale?: 'en' | 'fil') =>
  request(app).post(REMIND).send({ ...cr(b), optIn: true, channel, ...(locale ? { locale } : {}) });
const optOut = (b: { reference: string; secret: string }) => request(app).post(REMIND).send({ ...cr(b), optIn: false });

async function confirm(id: string): Promise<void> {
  const res = await request(app)
    .patch(`/api/v1/staff/clinics/demo-clinic-a/booking-requests/${id}/status`)
    .set('Cookie', staff.cookie)
    .set('X-CSRF-Token', staff.csrf)
    .set('If-Match', '"1"')
    .send(CONFIRM);
  expect(res.status).toBe(200);
}
async function outbox(): Promise<{ id: string; status: string; attempts: number; next_attempt_at: string | null; last_error_code: string | null; rendered_text: string; sent_at: string | null }[]> {
  const r = await h.db.query<{ id: string; status: string; attempts: number; next_attempt_at: string | null; last_error_code: string | null; rendered_text: string; sent_at: string | null }>(
    `select id, status, attempts, to_char(next_attempt_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as next_attempt_at, last_error_code, rendered_text, sent_at::text as sent_at from reminder_outbox order by created_at, id`,
  );
  return r.rows;
}
async function newConfirmed(): Promise<{ id: string; reference: string; secret: string }> {
  const b = await createBooking(app, h.db);
  await confirm(b.id);
  return b;
}

beforeAll(async () => {
  h = await makeHarness();
  app = h.build();
  staff = await login(app, STAFF_A);
});
afterAll(async () => {
  await h.db.close();
});
beforeEach(async () => {
  h.clock.now = T0;
  await h.db.exec('delete from reminder_outbox; delete from reminder_preferences; delete from lookup_attempts;');
});

describe('opt-in default and idempotent preference', () => {
  it('is OFF by default: confirming a request queues nothing', async () => {
    await newConfirmed();
    expect(await outbox()).toHaveLength(0);
  });

  it('opt-in before confirmation queues nothing until the staff confirm, then exactly one item', async () => {
    const b = await createBooking(app, h.db);
    const res = await optIn(b);
    expect(res.status).toBe(200);
    expect(ReminderPreferenceResponseSchema.parse(res.body)).toMatchObject({ optedIn: true, channel: 'mock_sms', mock: true, queued: 0 });
    expect(await outbox()).toHaveLength(0);
    await confirm(b.id);
    const rows = await outbox();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('queued');
  });

  it('opt-in after confirmation queues once; repeating the call and the enqueue is idempotent', async () => {
    const b = await newConfirmed();
    const first = await optIn(b);
    expect(first.body.queued).toBe(1);
    const second = await optIn(b);
    expect(second.status).toBe(200);
    expect(second.body.queued).toBe(0);
    expect(await enqueueForConfirmedRequest(h.db, b.id, T0)).toBe(0);
    expect(await outbox()).toHaveLength(1);
    const prefs = await h.db.query<{ destination_token: string }>('select destination_token from reminder_preferences');
    expect(prefs.rows).toHaveLength(1);
    expect(prefs.rows[0]?.destination_token).toMatch(/^demo:[0-9a-f]{16}$/);
  });

  it('opt-out suppresses queued items, clears the destination, and is idempotent; opting in again re-queues', async () => {
    const b = await newConfirmed();
    await optIn(b);
    const out = await optOut(b);
    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({ optedIn: false, channel: null, suppressed: 1, mock: true });
    expect((await optOut(b)).body.suppressed).toBe(0);
    expect((await outbox()).map((r) => r.status)).toEqual(['suppressed']);
    const p = await h.db.query<{ opted_in: boolean; channel: string | null; destination_token: string | null }>('select opted_in, channel, destination_token from reminder_preferences');
    expect(p.rows[0]).toEqual({ opted_in: false, channel: null, destination_token: null });
    expect((await optIn(b)).body.queued).toBe(1);
    expect((await outbox()).map((r) => r.status)).toEqual(['queued']);
  });

  it('a request that is opted out is never sent even if an item is still queued (dispatcher re-checks consent)', async () => {
    const b = await newConfirmed();
    await optIn(b);
    await h.db.query('update reminder_preferences set opted_in = false, channel = null, destination_token = null');
    const t = new MockTransport();
    const s = await dispatchDueReminders(h.db, DUE, t);
    expect(s).toMatchObject({ sent: 0, suppressed: 1 });
    expect(t.calls).toBe(0);
    expect((await outbox())[0]?.last_error_code).toBe('opted_out');
  });

  it('a cancelled decision suppresses waiting reminders', async () => {
    const b = await newConfirmed();
    await optIn(b);
    await h.db.query(`update booking_requests set status = 'cancelled' where id = $1`, [b.id]);
    // Direct hook behaviour: any non-confirmed decision cancels what is waiting.
    const { syncRemindersForDecision } = await import('./service.js');
    await syncRemindersForDecision(h.db, b.id, 'cancelled', T0);
    expect((await outbox()).map((r) => r.status)).toEqual(['suppressed']);
  });

  it('rejects opt-in without a channel, unknown channels, and any attempt to supply a phone number or e-mail', async () => {
    const b = await createBooking(app, h.db);
    expect((await request(app).post(REMIND).send({ ...cr(b), optIn: true })).status).toBe(400);
    expect((await request(app).post(REMIND).send({ ...cr(b), optIn: true, channel: 'sms' })).status).toBe(400);
    expect((await request(app).post(REMIND).send({ ...cr(b), optIn: true, channel: 'mock_sms', phone: '+639171234567' })).status).toBe(400);
    expect((await request(app).post(REMIND).send({ ...cr(b), optIn: true, channel: 'mock_email', email: 'a@b.test' })).status).toBe(400);
    expect(await outbox()).toHaveLength(0);
  });

  it('responses are no-store and never repeat the reference or secret', async () => {
    const b = await newConfirmed();
    const res = await optIn(b);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(JSON.stringify(res.body)).not.toContain(b.reference);
    expect(JSON.stringify(res.body)).not.toContain(b.secret);
  });
});

describe('dispatcher: sent, disabled, failed, retry, idempotency', () => {
  it('does nothing before the item is due, sends once when due, and never double-sends', async () => {
    const b = await newConfirmed();
    await optIn(b);
    const t = new MockTransport();
    expect(await dispatchDueReminders(h.db, T0, t)).toMatchObject({ sent: 0 });
    expect(t.calls).toBe(0);
    expect(await dispatchDueReminders(h.db, DUE, t)).toMatchObject({ sent: 1 });
    expect(await dispatchDueReminders(h.db, new Date(DUE.getTime() + 60_000), t)).toMatchObject({ sent: 0 });
    expect(t.calls).toBe(1);
    const rows = await outbox();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'sent', attempts: 1 });
    expect(rows[0]?.sent_at).not.toBeNull();
  });

  it('a second concurrent-looking dispatch for the same due item stays at one send (mock status guard)', async () => {
    const b = await newConfirmed();
    await optIn(b);
    const t = new MockTransport();
    const [a, c] = await Promise.all([dispatchDueReminders(h.db, DUE, t), dispatchDueReminders(h.db, DUE, t)]);
    expect(a.sent + c.sent).toBe(1);
    expect((await outbox()).filter((r) => r.status === 'sent')).toHaveLength(1);
  });

  it('disabled transport leaves items queued and spends no attempt', async () => {
    const b = await newConfirmed();
    await optIn(b);
    const s = await dispatchDueReminders(h.db, DUE, new DisabledTransport());
    expect(s).toMatchObject({ sent: 0, deferred: 1 });
    expect(await outbox()).toMatchObject([{ status: 'queued', attempts: 0 }]);
  });

  it('retryable failures back off (60 s, 120 s) and then succeed; attempts are recorded', async () => {
    const b = await newConfirmed();
    await optIn(b);
    const t = new MockTransport({ code: 'mock_temporary_failure', retryable: true, times: 2 });
    const s1 = await dispatchDueReminders(h.db, DUE, t);
    expect(s1).toMatchObject({ retryScheduled: 1, sent: 0 });
    let r = (await outbox())[0];
    expect(r).toMatchObject({ status: 'queued', attempts: 1, last_error_code: 'mock_temporary_failure' });
    expect(new Date(r?.next_attempt_at ?? '').getTime()).toBe(DUE.getTime() + REMINDER_BACKOFF_BASE_MS);
    // Not before the backoff has elapsed.
    expect(await dispatchDueReminders(h.db, new Date(DUE.getTime() + 30_000), t)).toMatchObject({ retryScheduled: 0, sent: 0 });
    const t2 = new Date(DUE.getTime() + REMINDER_BACKOFF_BASE_MS);
    expect(await dispatchDueReminders(h.db, t2, t)).toMatchObject({ retryScheduled: 1 });
    r = (await outbox())[0];
    expect(r?.attempts).toBe(2);
    const t3 = new Date(t2.getTime() + 2 * REMINDER_BACKOFF_BASE_MS);
    expect(await dispatchDueReminders(h.db, t3, t)).toMatchObject({ sent: 1 });
    expect(await outbox()).toMatchObject([{ status: 'sent', attempts: 3, last_error_code: null }]);
  });

  it('becomes failed after the maximum of 3 attempts and is then left alone', async () => {
    const b = await newConfirmed();
    await optIn(b);
    const t = new MockTransport({ code: 'mock_temporary_failure', retryable: true, times: Infinity });
    let now = DUE;
    const totals = { retry: 0, failed: 0 };
    for (let i = 0; i < 5; i += 1) {
      const s = await dispatchDueReminders(h.db, now, t);
      totals.retry += s.retryScheduled;
      totals.failed += s.failed;
      now = new Date(now.getTime() + 10 * 60_000);
    }
    expect(totals).toEqual({ retry: 2, failed: 1 });
    expect(t.calls).toBe(3);
    expect(await outbox()).toMatchObject([{ status: 'failed', attempts: 3, last_error_code: 'mock_temporary_failure', next_attempt_at: null }]);
  });

  it('a non-retryable failure fails immediately', async () => {
    const b = await newConfirmed();
    await optIn(b);
    const t = new MockTransport({ code: 'mock_rejected', retryable: false, times: 1 });
    expect(await dispatchDueReminders(h.db, DUE, t)).toMatchObject({ failed: 1 });
    expect(await outbox()).toMatchObject([{ status: 'failed', attempts: 1 }]);
  });

  it('nothing is sent after the visit time (item expires as suppressed)', async () => {
    const b = await newConfirmed();
    await optIn(b);
    const t = new MockTransport();
    expect(await dispatchDueReminders(h.db, new Date(VISIT.getTime() + 1000), t)).toMatchObject({ sent: 0, suppressed: 1 });
    expect(t.calls).toBe(0);
    // S9-3: labelled by the real reason (the visit time passed), not as an opt-out.
    expect((await outbox())[0]?.last_error_code).toBe('expired');
  });
});

describe('dev outbox endpoint gating', () => {
  it('is available in DEMO + test and returns schema-valid mock records', async () => {
    const b = await newConfirmed();
    await optIn(b);
    const res = await request(app).get('/api/v1/dev/outbox');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const parsed = DevOutboxResponseSchema.parse(res.body);
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]?.demoDestination).toMatch(/^demo:[0-9a-f]{16}$/);
    expect(parsed.notice).toMatch(/nothing was delivered/i);
  });

  it('dev dispatch records a mock send', async () => {
    const b = await newConfirmed();
    await optIn(b);
    h.clock.now = DUE;
    const res = await request(app).post('/api/v1/dev/outbox/dispatch');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ mock: true, sent: 1 });
  });

  it.each([
    ['production', { NODE_ENV: 'production', DEMO_MODE: 'false', BOOKING_SECRET_KEY: 'x'.repeat(40) }],
    ['staging', { NODE_ENV: 'staging', DEMO_MODE: 'false', BOOKING_SECRET_KEY: 'x'.repeat(40) }],
    ['non-demo in test', { NODE_ENV: 'test', DEMO_MODE: 'false', BOOKING_SECRET_KEY: 'x'.repeat(40) }],
  ])('is 404 in %s', async (_name, src) => {
    const other = h.build({}, loadEnv(src));
    expect((await request(other).get('/api/v1/dev/outbox')).status).toBe(404);
    expect((await request(other).post('/api/v1/dev/outbox/dispatch')).status).toBe(404);
  });
});

describe('real transport cannot be selected', () => {
  it('the environment validator refuses real notifications or any other transport', () => {
    expect(() => loadEnv({ REAL_NOTIFICATIONS_ENABLED: 'true' })).toThrow();
    expect(() => loadEnv({ NOTIFICATION_TRANSPORT: 'twilio' })).toThrow();
    expect(() => loadEnv({ NOTIFICATION_TRANSPORT: 'smtp' })).toThrow();
  });
  it('selectTransport only ever returns the mock and throws for anything else', () => {
    expect(selectTransport({ NOTIFICATION_TRANSPORT: 'mock', REAL_NOTIFICATIONS_ENABLED: false }).kind).toBe('mock');
    expect(() => selectTransport({ NOTIFICATION_TRANSPORT: 'twilio', REAL_NOTIFICATIONS_ENABLED: false })).toThrow();
    expect(() => selectTransport({ NOTIFICATION_TRANSPORT: 'mock', REAL_NOTIFICATIONS_ENABLED: true })).toThrow();
  });
});

describe('throttling and failure shared with the status lookup', () => {
  it('failures are indistinguishable from the lookup (404 lookup_failed) for unknown reference and wrong secret', async () => {
    const b = await createBooking(app, h.db);
    const unknown = await request(app).post(REMIND).send({ reference: 'KAL-ZZZZZZZZZZ', secret: 'nope', optIn: false });
    const wrong = await request(app).post(REMIND).send({ reference: b.reference, secret: 'wrong-secret', optIn: false });
    expect(unknown.status).toBe(404);
    expect(wrong.status).toBe(404);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
    expect(wrong.body.error.code).toBe('lookup_failed');
  });

  it('wrong secrets on the reminder endpoint lock the reference for the lookup too, and vice versa', async () => {
    const b = await createBooking(app, h.db);
    for (let i = 0; i < LOOKUP_MAX_FAILURES; i += 1) await request(app).post(REMIND).send({ reference: b.reference, secret: `bad-${i}`, optIn: false });
    const lookup = await request(app).post('/api/v1/public/booking-requests/lookup').send(cr(b));
    expect(lookup.status).toBe(429);
    expect(lookup.headers['retry-after']).toBeDefined();
    expect((await optIn(b)).status).toBe(429);

    const c = await createBooking(app, h.db);
    for (let i = 0; i < LOOKUP_MAX_FAILURES; i += 1) await request(app).post('/api/v1/public/booking-requests/lookup').send({ reference: c.reference, secret: `bad-${i}` });
    expect((await optIn(c)).status).toBe(429);
    expect(await outbox()).toHaveLength(0);
  });

  it('the per-IP budget is one shared limiter for lookup and reminders', async () => {
    const limited = h.build({ booking: { now: () => h.clock.now, createIpLimit: 10_000, lookupIpLimit: 3 } });
    const b = await createBooking(limited, h.db);
    expect((await request(limited).post('/api/v1/public/booking-requests/lookup').send(cr(b))).status).toBe(200);
    expect((await request(limited).post(REMIND).send({ ...cr(b), optIn: false })).status).toBe(200);
    expect((await request(limited).post('/api/v1/public/booking-requests/lookup').send(cr(b))).status).toBe(200);
    const blocked = await request(limited).post(REMIND).send({ ...cr(b), optIn: false });
    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();
  });
});

describe('S9-3 reminder hardening', () => {
  it('re-saving the preference on a queued row updates its locale and rendered text in place', async () => {
    const b = await newConfirmed();
    await optIn(b, 'mock_sms', 'en');
    const [en] = await outbox();
    expect(en?.status).toBe('queued');
    const res = await optIn(b, 'mock_sms', 'fil');
    expect(res.status).toBe(200);
    const rows = await outbox();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(en?.id);
    expect(rows[0]?.status).toBe('queued');
    expect(rows[0]?.rendered_text).not.toBe(en?.rendered_text);
    const loc = await h.db.query<{ locale: string }>('select locale from reminder_outbox');
    expect(loc.rows[0]?.locale).toBe('fil');
  });

  it('commits per item: a throw on one item never re-sends items already sent in the same run', async () => {
    const a = await newConfirmed();
    const c = await newConfirmed();
    await optIn(a);
    await optIn(c);
    const inner = new MockTransport();
    let n = 0;
    const flaky: typeof inner = Object.assign(Object.create(inner) as typeof inner, {
      send: async (...args: Parameters<typeof inner.send>) => {
        n += 1;
        if (n === 2) throw new Error('boom');
        return inner.send(...args);
      },
    });
    const s1 = await dispatchDueReminders(h.db, DUE, flaky);
    expect(s1).toMatchObject({ sent: 1, retryScheduled: 1, failed: 0 });
    expect((await outbox()).map((r) => r.status).sort()).toEqual(['queued', 'sent']);
    const failed = (await outbox()).find((r) => r.status === 'queued');
    expect(failed).toMatchObject({ attempts: 1, last_error_code: 'transport_error' });
    const healthy = new MockTransport();
    const s2 = await dispatchDueReminders(h.db, new Date(DUE.getTime() + 2 * REMINDER_BACKOFF_BASE_MS), healthy);
    expect(s2).toMatchObject({ sent: 1 });
    expect(healthy.calls).toBe(1); // only the item that had not been sent
    expect((await outbox()).map((r) => r.status)).toEqual(['sent', 'sent']);
  });
});
