import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { StaffMeSchema } from '@kalinga/shared';
import { loadEnv } from '../env.js';
import { hashPassword, verifyPassword } from './password.js';
import { redactAuditMetadata, type AuditMetadata } from './audit.js';
import { DEMO_PW, ADMIN_A, createBooking, DISABLED, PROVINCIAL, STAFF_A, STAFF_B, TECH, login, makeHarness, type Harness } from './test-support.js';
import { SESSION_ABSOLUTE_MS, SESSION_IDLE_MS, sha256Hex } from './repository.js';

let h: Harness;
let app: ReturnType<Harness['build']>;

beforeAll(async () => {
  h = await makeHarness();
  app = h.build();
});
afterAll(async () => {
  await h.db.close();
});
beforeEach(async () => {
  h.clock.now = new Date('2026-10-30T04:00:00Z');
  h.logs.length = 0;
  await h.db.exec('truncate audit_events; delete from staff_sessions;');
  await h.db.exec('update staff_users set failed_login_count = 0, last_failed_login_at = null, locked_until = null, active = true;');
  await h.db.exec(`update staff_users set active = false where email = 'disabled@demo.invalid'`);
});

const post = (path: string, body: unknown) => request(app).post(`/api/v1/staff${path}`).send(body as object);
const failBody = (b: { error: { code: string; message: string } }) => ({ code: b.error.code, message: b.error.message });

describe('scrypt passwords', () => {
  it('uses a per-user random salt and verifies timing-safely', async () => {
    const a = await hashPassword('correct horse battery');
    const b = await hashPassword('correct horse battery');
    expect(a).toMatch(/^scrypt\$16384\$8\$1\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
    expect(a).not.toBe(b); // different salts
    expect(await verifyPassword('correct horse battery', a)).toBe(true);
    expect(await verifyPassword('correct horse batterz', a)).toBe(false);
    expect(await verifyPassword('', a)).toBe(false);
    expect(await verifyPassword('x', 'not-a-hash')).toBe(false);
    expect(await verifyPassword('x', 'scrypt$999999999$8$1$AAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAA')).toBe(false); // absurd cost refused
  });

  it('seeded DEMO accounts store hashes only, with distinct salts, on .invalid addresses', async () => {
    const r = await h.db.query<{ email: string; password_hash: string; is_demo: boolean }>('select email, password_hash, is_demo from staff_users');
    expect(r.rows.length).toBe(6);
    for (const u of r.rows) {
      expect(u.email).toMatch(/@demo\.invalid$/);
      expect(u.is_demo).toBe(true);
      expect(u.password_hash).toMatch(/^scrypt\$/);
      expect(u.password_hash).not.toContain(DEMO_PW);
    }
    expect(new Set(r.rows.map((u) => u.password_hash.split('$')[4])).size).toBe(6);
  });
});

describe('POST /staff/login', () => {
  it('signs in, returns identity + CSRF token, and sets a hardened httpOnly cookie', async () => {
    const res = await post('/login', { email: STAFF_A.toUpperCase(), password: DEMO_PW }).expect(200);
    const me = StaffMeSchema.parse(res.body);
    expect(me.user.role).toBe('clinic_staff');
    expect(me.memberships.map((m) => m.clinicSlug)).toEqual(['demo-clinic-a']);
    expect(JSON.stringify(res.body)).not.toMatch(/password|hash|scrypt/i);
    expect(res.headers['cache-control']).toBe('no-store');
    const cookie = (res.headers['set-cookie'] as unknown as string[])[0] ?? '';
    expect(cookie).toMatch(/^kalinga_staff_session=[A-Za-z0-9_-]{43};/);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Path=/api/v1;');
    expect(cookie).not.toContain('Secure'); // localhost development
    expect(cookie).toContain(`Max-Age=${SESSION_ABSOLUTE_MS / 1000}`);
    // The database holds only the hash of the token and of the CSRF token.
    const token = cookie.split(';')[0]?.split('=')[1] ?? '';
    const s = await h.db.query<{ token_hash: string; csrf_hash: string }>('select token_hash, csrf_hash from staff_sessions');
    expect(s.rows).toHaveLength(1);
    expect(s.rows[0]?.token_hash).toBe(sha256Hex(token));
    expect(s.rows[0]?.csrf_hash).toBe(sha256Hex(me.csrfToken));
    expect(JSON.stringify(s.rows)).not.toContain(token);
  });

  it('marks the cookie Secure on any non-localhost host', async () => {
    const res = await request(app).post('/api/v1/staff/login').set('Host', 'kalinga.example').send({ email: STAFF_A, password: DEMO_PW }).expect(200);
    expect((res.headers['set-cookie'] as unknown as string[])[0]).toContain('; Secure');
  });

  it('answers wrong password, unknown account, disabled account and malformed password identically', async () => {
    const bad = await post('/login', { email: STAFF_A, password: 'wrong-password-123' });
    const unknown = await post('/login', { email: 'nobody@demo.invalid', password: DEMO_PW });
    const disabled = await post('/login', { email: DISABLED, password: DEMO_PW });
    for (const r of [bad, unknown, disabled]) {
      expect(r.status).toBe(401);
      expect(r.headers['set-cookie']).toBeUndefined();
      expect(r.headers['cache-control']).toBe('no-store');
    }
    expect(failBody(unknown.body)).toEqual(failBody(bad.body));
    expect(failBody(disabled.body)).toEqual(failBody(bad.body));
    expect(bad.body.error.code).toBe('login_failed');
    expect((await post('/login', { email: STAFF_A })).status).toBe(400); // schema failure, no account signal
    expect((await post('/login', { email: STAFF_A, password: DEMO_PW, role: 'technical_admin' })).status).toBe(400); // no client-supplied role
  });

  it('locks an account after 5 failures (even for the right password) and recovers after the lock', async () => {
    for (let i = 0; i < 5; i += 1) expect((await post('/login', { email: STAFF_A, password: `wrong-password-${i}` })).status).toBe(401);
    const row = await h.db.query<{ failed_login_count: number; locked_until: string | null }>(
      `select failed_login_count, locked_until::text as locked_until from staff_users where email = $1`,
      [STAFF_A],
    );
    expect(row.rows[0]?.failed_login_count).toBe(5);
    expect(row.rows[0]?.locked_until).not.toBeNull();
    const locked = await post('/login', { email: STAFF_A, password: DEMO_PW });
    expect(locked.status).toBe(401); // same generic answer: no "locked" signal
    expect(locked.body.error.code).toBe('login_failed');
    h.clock.now = new Date(h.clock.now.getTime() + 15 * 60_000 + 1000);
    await post('/login', { email: STAFF_A, password: DEMO_PW }).expect(200);
    const after = await h.db.query<{ failed_login_count: number; locked_until: string | null }>(
      `select failed_login_count, locked_until::text as locked_until from staff_users where email = $1`,
      [STAFF_A],
    );
    expect(after.rows[0]).toEqual({ failed_login_count: 0, locked_until: null });
  });

  it('does not let failures older than the window accumulate', async () => {
    for (let i = 0; i < 4; i += 1) await post('/login', { email: STAFF_A, password: `wrong-password-${i}` });
    h.clock.now = new Date(h.clock.now.getTime() + 16 * 60_000);
    await post('/login', { email: STAFF_A, password: 'wrong-password-x' }).expect(401);
    await post('/login', { email: STAFF_A, password: DEMO_PW }).expect(200); // would be locked if the 5th counted
  });

  it('a lock on one account does not affect another', async () => {
    for (let i = 0; i < 5; i += 1) await post('/login', { email: STAFF_A, password: `wrong-password-${i}` });
    await post('/login', { email: STAFF_B, password: DEMO_PW }).expect(200);
  });

  it('throttles by client address regardless of the account (429 + Retry-After)', async () => {
    const limited = h.build({ staff: { now: () => h.clock.now, loginIpLimit: 3 } });
    for (let i = 0; i < 3; i += 1) await request(limited).post('/api/v1/staff/login').send({ email: 'nobody@demo.invalid', password: 'x'.repeat(12) }).expect(401);
    const res = await request(limited).post('/api/v1/staff/login').send({ email: STAFF_A, password: DEMO_PW });
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('login_throttled');
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('refuses DEMO accounts when DEMO_MODE is off', async () => {
    const prod = h.build({}, loadEnv({ DEMO_MODE: 'false', NODE_ENV: 'test', BOOKING_SECRET_KEY: 'x'.repeat(40) }));
    await request(prod).post('/api/v1/staff/login').send({ email: STAFF_A, password: DEMO_PW }).expect(401);
  });
});

describe('sessions', () => {
  it('GET /staff/me needs a valid session and returns the same CSRF token as login', async () => {
    await request(app).get('/api/v1/staff/me').expect(401);
    await request(app).get('/api/v1/staff/me').set('Cookie', 'kalinga_staff_session=not-a-real-token').expect(401);
    const s = await login(app, ADMIN_A);
    const me = await request(app).get('/api/v1/staff/me').set('Cookie', s.cookie).expect(200);
    expect(StaffMeSchema.parse(me.body).csrfToken).toBe(s.csrf);
    expect(me.body.user.role).toBe('clinic_admin');
    expect(me.headers['cache-control']).toBe('no-store');
    expect(me.headers.vary).toMatch(/Cookie/);
  });

  it('expires absolutely after 8 hours', async () => {
    const s = await login(app, STAFF_A);
    // Stay active so the idle rule never fires; only the absolute limit can.
    for (let i = 0; i < 20; i += 1) {
      h.clock.now = new Date(h.clock.now.getTime() + 29 * 60_000);
      if (h.clock.now.getTime() - new Date('2026-10-30T04:00:00Z').getTime() >= SESSION_ABSOLUTE_MS) break;
      await request(app).get('/api/v1/staff/me').set('Cookie', s.cookie).expect(200);
    }
    await request(app).get('/api/v1/staff/me').set('Cookie', s.cookie).expect(401);
  });

  it('expires after 30 idle minutes but activity keeps it alive', async () => {
    const s = await login(app, STAFF_A);
    h.clock.now = new Date(h.clock.now.getTime() + 20 * 60_000);
    await request(app).get('/api/v1/staff/me').set('Cookie', s.cookie).expect(200);
    h.clock.now = new Date(h.clock.now.getTime() + 20 * 60_000); // 40 min since login, 20 since last use
    await request(app).get('/api/v1/staff/me').set('Cookie', s.cookie).expect(200);
    h.clock.now = new Date(h.clock.now.getTime() + SESSION_IDLE_MS + 1000);
    await request(app).get('/api/v1/staff/me').set('Cookie', s.cookie).expect(401);
  });

  it('logout revokes the session server-side and clears the cookie; the old cookie is dead', async () => {
    const s = await login(app, STAFF_A);
    const out = await request(app).post('/api/v1/staff/logout').set('Cookie', s.cookie).set('X-CSRF-Token', s.csrf).expect(204);
    expect((out.headers['set-cookie'] as unknown as string[])[0]).toMatch(/Max-Age=0/);
    await request(app).get('/api/v1/staff/me').set('Cookie', s.cookie).expect(401);
    const row = await h.db.query<{ revoked_at: string | null }>('select revoked_at::text as revoked_at from staff_sessions');
    expect(row.rows[0]?.revoked_at).not.toBeNull();
  });

  it('deactivating the account ends access immediately, and a fresh login yields a new session', async () => {
    const s = await login(app, STAFF_A);
    await h.db.query(`update staff_users set active = false where email = $1`, [STAFF_A]);
    await request(app).get('/api/v1/staff/me').set('Cookie', s.cookie).expect(401);
    await post('/login', { email: STAFF_A, password: DEMO_PW }).expect(401);
  });

  it('each login makes a new unrelated token', async () => {
    const a = await login(app, STAFF_A);
    const b = await login(app, STAFF_A);
    expect(a.cookie).not.toBe(b.cookie);
    expect(a.csrf).not.toBe(b.csrf);
  });
});

describe('CSRF protection on state-changing staff routes', () => {
  it('rejects logout without or with a wrong token, and accepts the right one', async () => {
    const s = await login(app, STAFF_A);
    expect((await request(app).post('/api/v1/staff/logout').set('Cookie', s.cookie)).status).toBe(403);
    const wrong = await request(app).post('/api/v1/staff/logout').set('Cookie', s.cookie).set('X-CSRF-Token', `${s.csrf.slice(0, -2)}xx`);
    expect(wrong.status).toBe(403);
    expect(wrong.body.error.code).toBe('csrf_rejected');
    // Another session's token is useless.
    const other = await login(app, STAFF_B);
    expect((await request(app).post('/api/v1/staff/logout').set('Cookie', s.cookie).set('X-CSRF-Token', other.csrf)).status).toBe(403);
    await request(app).get('/api/v1/staff/me').set('Cookie', s.cookie).expect(200); // still signed in
    await request(app).post('/api/v1/staff/logout').set('Cookie', s.cookie).set('X-CSRF-Token', s.csrf).expect(204);
  });

  it('applies an Origin check: foreign and opaque origins are rejected, the own origin passes', async () => {
    const s = await login(app, STAFF_A);
    const send = (origin: string) =>
      request(app).post('/api/v1/staff/logout').set('Host', 'kalinga.test').set('Origin', origin).set('Cookie', s.cookie).set('X-CSRF-Token', s.csrf);
    expect((await send('https://evil.example')).status).toBe(403);
    expect((await send('null')).status).toBe(403);
    await send('https://kalinga.test').expect(204);
  });

  it('login also refuses a cross-site Origin (login CSRF) and allows the configured dev origin', async () => {
    const evil = await request(app).post('/api/v1/staff/login').set('Origin', 'https://evil.example').send({ email: STAFF_A, password: DEMO_PW });
    expect(evil.status).toBe(403);
    await request(app).post('/api/v1/staff/login').set('Origin', 'http://localhost:5173').send({ email: STAFF_A, password: DEMO_PW }).expect(200);
  });

  it('unauthenticated state-changing request is 401 (not a CSRF oracle)', async () => {
    expect((await request(app).post('/api/v1/staff/logout')).status).toBe(401);
  });
});

describe('roles and memberships', () => {
  it('provincial and technical admins can sign in but hold no clinic booking access', async () => {
    for (const email of [PROVINCIAL, TECH]) {
      const s = await login(app, email);
      expect((s.body as { memberships: unknown[] }).memberships).toEqual([]);
      const r = await request(app).get('/api/v1/staff/clinics/demo-clinic-a/booking-requests').set('Cookie', s.cookie);
      expect(r.status).toBe(404);
    }
  });

  it('a removed or inactive membership is honoured on the very next request (no cached scope)', async () => {
    const s = await login(app, STAFF_A);
    await request(app).get('/api/v1/staff/clinics/demo-clinic-a/booking-requests').set('Cookie', s.cookie).expect(200);
    await h.db.query(`update clinic_memberships set active = false where user_id = (select id from staff_users where email = $1)`, [STAFF_A]);
    await request(app).get('/api/v1/staff/clinics/demo-clinic-a/booking-requests').set('Cookie', s.cookie).expect(404);
    await h.db.query(`update clinic_memberships set active = true where user_id = (select id from staff_users where email = $1)`, [STAFF_A]);
  });

  it('a user whose role was downgraded to an admin role loses clinic booking access at once', async () => {
    const s = await login(app, STAFF_A);
    await h.db.query(`update staff_users set role = 'technical_admin' where email = $1`, [STAFF_A]);
    try {
      await request(app).get('/api/v1/staff/clinics/demo-clinic-a/booking-requests').set('Cookie', s.cookie).expect(404);
    } finally {
      await h.db.query(`update staff_users set role = 'clinic_staff' where email = $1`, [STAFF_A]);
    }
  });
});

describe('audit trail for authentication', () => {
  it('records login success/failure/logout without e-mail addresses, passwords or tokens', async () => {
    await post('/login', { email: STAFF_A, password: 'wrong-password-zzz' });
    await post('/login', { email: 'ghost@demo.invalid', password: 'wrong-password-zzz' });
    const s = await login(app, STAFF_A);
    await request(app).post('/api/v1/staff/logout').set('Cookie', s.cookie).set('X-CSRF-Token', s.csrf).expect(204);
    const rows = await h.db.query<Record<string, unknown>>('select * from audit_events order by created_at, action');
    expect(rows.rows.map((r) => r.action).sort()).toEqual(['staff.login_failed', 'staff.login_failed', 'staff.login_succeeded', 'staff.logout']);
    const text = JSON.stringify(rows.rows);
    for (const forbidden of [STAFF_A, 'ghost@demo', 'wrong-password-zzz', DEMO_PW, s.csrf, s.cookie.split('=')[1] ?? 'x', 'scrypt']) {
      expect(text).not.toContain(forbidden);
    }
    expect(h.logs.join('\n')).not.toMatch(/wrong-password-zzz|demo\.invalid|kalinga_staff_session/);
  });

  it('metadata allow-list drops unknown keys and unsafe values', () => {
    const dirty = {
      from_status: 'pending',
      to_status: 'confirmed',
      version_before: 1,
      email: 'a@b.c',
      clinic_note: 'free text',
      outcome: 'Has Spaces And Caps',
    } as unknown as AuditMetadata;
    expect(redactAuditMetadata(dirty)).toEqual({ from_status: 'pending', to_status: 'confirmed', version_before: 1 });
  });
});

describe('schema, constraints and RLS (migration 0005)', () => {
  it('has RLS enabled on every new table and denies kalinga_public everything', async () => {
    const r = await h.db.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class where relname in ('staff_users','clinic_memberships','staff_sessions','audit_events')`,
    );
    expect(r.rows).toHaveLength(4);
    expect(r.rows.every((x) => x.relrowsecurity)).toBe(true);
    await h.db.exec('set role kalinga_public');
    try {
      for (const t of ['staff_users', 'clinic_memberships', 'staff_sessions', 'audit_events']) {
        await expect(h.db.query(`select * from ${t}`)).rejects.toThrow(/permission denied/);
      }
    } finally {
      await h.db.exec('reset role');
    }
  });

  it('enforces case-insensitive unique e-mail, .invalid for DEMO accounts, lower-case storage and hash format', async () => {
    const ins = (email: string, isDemo = false, hash = 'scrypt$16384$8$1$AAAAAAAAAAAAAAAA$BBBBBBBBBBBBBBBBBBBBBBBB') =>
      h.db.query(`insert into staff_users (email, display_name, password_hash, role, is_demo) values ($1, 'x', $2, 'clinic_staff', $3)`, [email, hash, isDemo]);
    await expect(ins('Staff.A@demo.invalid')).rejects.toThrow(/check|violates/); // upper-case rejected by check
    await expect(h.db.query(`insert into staff_users (email, display_name, password_hash, role) values ('STAFF.A@DEMO.INVALID', 'x', 'scrypt$1$1$1$AAAAAAAA$BBBBBBBB', 'clinic_staff')`)).rejects.toThrow();
    await expect(ins('staff.a@demo.invalid', true)).rejects.toThrow(/unique|duplicate/);
    await expect(ins('real.person@example.org', true)).rejects.toThrow(/staff_users_demo_email/);
    await expect(ins('new@example.org', false, 'plaintext-password')).rejects.toThrow(/check/);
  });

  it('forbids non-clinic roles on a membership and duplicate memberships', async () => {
    const u = await h.db.query<{ id: string }>(`select id from staff_users where email = $1`, [TECH]);
    const c = await h.db.query<{ id: string }>(`select id from clinics where slug = 'demo-clinic-a'`);
    await expect(
      h.db.query(`insert into clinic_memberships (user_id, clinic_id, role) values ($1, $2, 'technical_admin')`, [u.rows[0]?.id, c.rows[0]?.id]),
    ).rejects.toThrow(/check/);
    const a = await h.db.query<{ id: string }>(`select id from staff_users where email = $1`, [STAFF_A]);
    await expect(
      h.db.query(`insert into clinic_memberships (user_id, clinic_id, role) values ($1, $2, 'clinic_staff')`, [a.rows[0]?.id, c.rows[0]?.id]),
    ).rejects.toThrow(/unique|duplicate/);
  });

  it('audit_events is append-only and refuses secret-looking metadata', async () => {
    const add = (meta: string) => h.db.query(`insert into audit_events (actor_kind, action, target_type, metadata) values ('system', 'x.y', 'booking_request', $1::jsonb)`, [meta]);
    await add('{"from_status":"pending"}');
    await expect(add('{"email":"a@b.c"}')).rejects.toThrow(/audit_events_metadata_redacted/);
    await expect(add('{"note":"hello"}')).rejects.toThrow(/audit_events_metadata_redacted/);
    await expect(add('{"x":"secret-value"}')).rejects.toThrow(/audit_events_metadata_redacted/);
    await expect(add('[]')).rejects.toThrow(/check/);
    await expect(h.db.query(`update audit_events set action = 'a.b'`)).rejects.toThrow(/append-only/);
    await expect(h.db.query(`delete from audit_events`)).rejects.toThrow(/append-only/);
  });

  it('kalinga_staff RLS: own clinic rows only, no secret column, no cross-clinic update, no session/audit reads', async () => {
    const mine = await h.db.query<{ id: string }>(`select id from staff_users where email = $1`, [STAFF_A]);
    const other = await h.db.query<{ id: string }>(`select id from staff_users where email = $1`, [STAFF_B]);
    await createBooking(app, h.db, { clinicId: 'demo-clinic-a' });
    await createBooking(app, h.db, { clinicId: 'demo-clinic-b', service: 'sti_testing' });
    const asStaff = async (userId: string, fn: () => Promise<void>) => {
      await h.db.exec(`select set_config('kalinga.staff_user_id', '${userId}', false)`);
      await h.db.exec('set role kalinga_staff');
      try {
        await fn();
      } finally {
        await h.db.exec('reset role');
        await h.db.exec(`select set_config('kalinga.staff_user_id', '', false)`);
      }
    };
    await asStaff(mine.rows[0]?.id ?? '', async () => {
      const r = await h.db.query<{ clinic_id: string }>('select clinic_id from booking_requests');
      expect(r.rows).toHaveLength(1);
      await expect(h.db.query('select secret_hash from booking_requests')).rejects.toThrow(/permission denied/);
      await expect(h.db.query('select * from booking_requests')).rejects.toThrow(/permission denied/); // * includes secret_hash
      const upd = await h.db.query(`update booking_requests set clinic_note = 'x' where clinic_id <> $1`, [r.rows[0]?.clinic_id]);
      expect(upd.affectedRows).toBe(0); // other clinic's row is invisible to update
      await expect(h.db.query(`update booking_requests set preferred_date = '2026-12-01'`)).rejects.toThrow(/permission denied/);
      await expect(h.db.query('select * from staff_sessions')).rejects.toThrow(/permission denied/);
      await expect(h.db.query('select * from audit_events')).rejects.toThrow(/permission denied/);
      await expect(h.db.query('select password_hash from staff_users')).rejects.toThrow(/permission denied/);
      const self = await h.db.query('select id, email from staff_users');
      expect(self.rows).toHaveLength(1);
    });
    await asStaff(other.rows[0]?.id ?? '', async () => {
      const r = await h.db.query<{ clinic_id: string }>('select clinic_id from booking_requests');
      expect(r.rows).toHaveLength(1);
    });
    await asStaff('00000000-0000-0000-0000-000000000000', async () => {
      expect((await h.db.query('select clinic_id from booking_requests')).rows).toHaveLength(0);
    });
    await h.db.exec('delete from booking_requests');
  });
});
