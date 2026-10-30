import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { InviteCreatedSchema, StaffAdminListSchema, type StaffAdminUser } from '@kalinga/shared';
import { createInvite } from './staff-admin.js';
import { ADMIN, auditRows, call, clinicIdOf, login, loginAll, makeHarness, type App, type Harness, type Session, type Sessions } from './test-support.js';

const T0 = '2026-10-30T04:00:00Z';
const REDEEM = '/api/v1/staff/invites/redeem';
const NEW_PW = 'a-brand-new-password-1';
const STAFF_EMAIL = 'staff.a@demo.invalid';

interface Ctx {
  h: Harness;
  app: App;
  S: Sessions;
  clinicA: string;
  clinicB: string;
  codes: string[];
}

async function setup(): Promise<Ctx> {
  const h = await makeHarness();
  const app = h.build();
  return { h, app, S: await loginAll(app), clinicA: await clinicIdOf(h.db, 'demo-clinic-a'), clinicB: await clinicIdOf(h.db, 'demo-clinic-b'), codes: [] };
}

let n = 0;
/** Invite (as `by`) and redeem a fresh account; returns its e-mail and a signed-in session. */
async function makeUser(c: Ctx, by: Session, role: string, clinicId?: string): Promise<{ email: string; id: string; session: Session }> {
  n += 1;
  const email = `new.user.${n}@example.test`;
  const inv = await call(c.app, by, 'post', `${ADMIN}/staff/invites`, { email, role, ...(clinicId ? { clinicId } : {}) });
  if (inv.status !== 201) throw new Error(`invite failed ${inv.status} ${JSON.stringify(inv.body)}`);
  const { inviteCode } = InviteCreatedSchema.parse(inv.body);
  c.codes.push(inviteCode);
  const red = await request(c.app).post(REDEEM).send({ code: inviteCode, email, displayName: `New User ${n}`, password: NEW_PW });
  if (red.status !== 201) throw new Error(`redeem failed ${red.status}`);
  const session = await login(c.app, email, NEW_PW);
  const row = await c.h.db.query<{ id: string }>('select id from staff_users where email = $1', [email]);
  return { email, id: row.rows[0]?.id ?? '', session };
}

async function staffList(c: Ctx, s: Session): Promise<StaffAdminUser[]> {
  const res = await call(c.app, s, 'get', `${ADMIN}/staff`);
  expect(res.status).toBe(200);
  return StaffAdminListSchema.parse(res.body).items;
}
const userId = async (c: Ctx, email: string) => (await c.h.db.query<{ id: string }>('select id from staff_users where email = $1', [email])).rows[0]?.id ?? '';

describe('staff invites', () => {
  let c: Ctx;
  beforeAll(async () => {
    c = await setup();
  });
  afterAll(async () => {
    await c.h.db.close();
  });
  beforeEach(() => {
    c.h.clock.now = new Date(T0);
    c.h.logs.length = 0;
  });

  it('creates an invite, returns the code once and stores only its hash', async () => {
    const res = await call(c.app, c.S.prov, 'post', `${ADMIN}/staff/invites`, { email: 'Invitee.One@Example.test', role: 'clinic_staff', clinicId: c.clinicA });
    expect(res.status).toBe(201);
    expect(res.headers['cache-control']).toBe('no-store');
    const inv = InviteCreatedSchema.parse(res.body);
    c.codes.push(inv.inviteCode);
    expect(inv).toMatchObject({ email: 'invitee.one@example.test', role: 'clinic_staff', clinicId: c.clinicA, expiresAt: new Date(new Date(T0).getTime() + 72 * 3_600_000).toISOString() });
    const row = await c.h.db.query<Record<string, unknown>>('select * from staff_invites where id = $1', [inv.id]);
    expect(JSON.stringify(row.rows[0])).not.toContain(inv.inviteCode);
    expect(row.rows[0]?.code_hash).toMatch(/^[0-9a-f]{64}$/);
    // The list never shows the code.
    const list = await call(c.app, c.S.prov, 'get', `${ADMIN}/staff/invites`);
    expect(JSON.stringify(list.body)).not.toContain(inv.inviteCode);
    expect((list.body as { items: { id: string; state: string }[] }).items.find((i) => i.id === inv.id)?.state).toBe('pending');
    expect(c.h.logs.join('\n')).not.toContain(inv.inviteCode);
  });

  it('validates the invite shape: clinic roles need a clinic, admin roles must not have one, unknown fields rejected', async () => {
    const post = (b: Record<string, unknown>) => call(c.app, c.S.prov, 'post', `${ADMIN}/staff/invites`, b);
    expect((await post({ email: 'a@example.test', role: 'clinic_staff' })).status).toBe(400);
    expect((await post({ email: 'a@example.test', role: 'provincial_admin', clinicId: c.clinicA })).status).toBe(400);
    expect((await post({ email: 'not-an-email', role: 'clinic_staff', clinicId: c.clinicA })).status).toBe(400);
    expect((await post({ email: 'a@example.test', role: 'clinic_staff', clinicId: c.clinicA, extra: 1 })).status).toBe(400);
    expect((await post({ email: 'a@example.test', role: 'root', clinicId: c.clinicA })).status).toBe(400);
    expect((await post({ email: 'a@example.test', role: 'clinic_staff', clinicId: '00000000-0000-4000-8000-000000000000' })).status).toBe(404);
    expect((await post({ email: STAFF_EMAIL, role: 'clinic_staff', clinicId: c.clinicA })).body).toMatchObject({ error: { code: 'account_exists' } });
  });

  it('is single use: the account is created once, the second redemption fails generically', async () => {
    const email = 'single.use@example.test';
    const inv = InviteCreatedSchema.parse((await call(c.app, c.S.prov, 'post', `${ADMIN}/staff/invites`, { email, role: 'clinic_staff', clinicId: c.clinicA })).body);
    c.codes.push(inv.inviteCode);
    const body = { code: inv.inviteCode, email, displayName: 'Single Use', password: NEW_PW };
    const first = await request(c.app).post(REDEEM).send(body);
    expect(first.status).toBe(201);
    expect(first.headers['set-cookie']).toBeUndefined(); // redeeming does not sign in
    const second = await request(c.app).post(REDEEM).send(body);
    expect(second.status).toBe(400);
    expect(second.body).toMatchObject({ error: { code: 'invite_invalid' } });
    // The new account works, holds exactly the invited membership, and is not a demo account.
    const s = await login(c.app, email, NEW_PW);
    expect(s.body).toMatchObject({ user: { role: 'clinic_staff', isDemo: false }, memberships: [{ clinicId: c.clinicA, role: 'clinic_staff' }] });
    const used = (await call(c.app, c.S.prov, 'get', `${ADMIN}/staff/invites`)).body as { items: { id: string; state: string }[] };
    expect(used.items.find((i) => i.id === inv.id)?.state).toBe('used');
  });

  it('lets only one of two parallel redemptions succeed', async () => {
    const email = 'race@example.test';
    const inv = InviteCreatedSchema.parse((await call(c.app, c.S.prov, 'post', `${ADMIN}/staff/invites`, { email, role: 'clinic_staff', clinicId: c.clinicA })).body);
    c.codes.push(inv.inviteCode);
    const body = { code: inv.inviteCode, email, displayName: 'Race', password: NEW_PW };
    const results = await Promise.all([request(c.app).post(REDEEM).send(body), request(c.app).post(REDEEM).send(body)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
    const users = await c.h.db.query('select 1 from staff_users where email = $1', [email]);
    expect(users.rows).toHaveLength(1);
  });

  it('expires after 72 hours, can be revoked, and fails generically for wrong code or e-mail', async () => {
    const make = async (email: string) => {
      const inv = InviteCreatedSchema.parse((await call(c.app, c.S.prov, 'post', `${ADMIN}/staff/invites`, { email, role: 'clinic_staff', clinicId: c.clinicA })).body);
      c.codes.push(inv.inviteCode);
      return inv;
    };
    const redeem = (code: string, email: string) => request(c.app).post(REDEEM).send({ code, email, displayName: 'X', password: NEW_PW });

    const old = await make('late@example.test');
    c.h.clock.now = new Date(new Date(T0).getTime() + 72 * 3_600_000 + 1000);
    expect((await redeem(old.inviteCode, 'late@example.test')).body).toMatchObject({ error: { code: 'invite_invalid' } });
    c.h.clock.now = new Date(T0);

    const rev = await make('revoked@example.test');
    expect((await call(c.app, c.S.prov, 'post', `${ADMIN}/staff/invites/${rev.id}/revoke`)).status).toBe(204);
    expect((await redeem(rev.inviteCode, 'revoked@example.test')).status).toBe(400);
    expect((await call(c.app, c.S.prov, 'post', `${ADMIN}/staff/invites/${rev.id}/revoke`)).status).toBe(409);

    const ok = await make('mismatch@example.test');
    expect((await redeem(ok.inviteCode, 'someone.else@example.test')).status).toBe(400);
    expect((await redeem('A'.repeat(43), 'mismatch@example.test')).status).toBe(400);
    expect((await request(c.app).post(REDEEM).send({ code: ok.inviteCode, email: 'mismatch@example.test', displayName: 'X', password: 'short' })).status).toBe(400);
    // Still redeemable after those failures.
    expect((await redeem(ok.inviteCode, 'mismatch@example.test')).status).toBe(201);
  });

  it('rate limits redemption attempts per client', async () => {
    const limited = c.h.build({ staff: { now: () => c.h.clock.now, loginIpLimit: 3 } });
    const codes: number[] = [];
    for (let i = 0; i < 5; i += 1) codes.push((await request(limited).post(REDEEM).send({})).status);
    expect(codes).toEqual([400, 400, 400, 429, 429]);
  });

  it('refuses to create invites when delivery is not possible (outside DEMO/dev)', async () => {
    await expect(
      createInvite(c.h.db, { id: '00000000-0000-4000-8000-000000000001', role: 'technical_admin' }, { email: 'x@example.test', role: 'clinic_staff', clinicId: c.clinicA }, false, new Date(T0)),
    ).rejects.toMatchObject({ status: 501, code: 'invite_delivery_not_configured' });
  });

  it('never writes an invite code, password or e-mail into the audit log or the access log', async () => {
    const audit = JSON.stringify(await auditRows(c.h.db));
    for (const code of c.codes) expect(audit).not.toContain(code);
    expect(audit).not.toMatch(/example\.test|password|a-brand-new/i);
    const actions = (await auditRows(c.h.db)).map((r) => r.action);
    expect(actions).toContain('governance.staff_invite_created');
    expect(actions).toContain('governance.staff_invite_redeemed');
    expect(c.h.logs.join('\n')).not.toMatch(/a-brand-new|example\.test/);
  });
});

describe('role scope and privilege escalation', () => {
  let c: Ctx;
  beforeAll(async () => {
    c = await setup();
  });
  afterAll(async () => {
    await c.h.db.close();
  });
  beforeEach(() => {
    c.h.clock.now = new Date(T0);
  });

  it('denies invites to the wrong role (401 / 403) and requires CSRF', async () => {
    const body = { email: 'x1@example.test', role: 'clinic_staff', clinicId: c.clinicA };
    expect((await call(c.app, null, 'post', `${ADMIN}/staff/invites`, body)).status).toBe(401);
    expect((await call(c.app, c.S.staffA, 'post', `${ADMIN}/staff/invites`, body)).status).toBe(403);
    expect((await call(c.app, c.S.staffA, 'get', `${ADMIN}/staff`)).status).toBe(403);
    expect((await call(c.app, c.S.prov, 'post', `${ADMIN}/staff/invites`, body, false)).body).toMatchObject({ error: { code: 'csrf_rejected' } });
  });

  it('never lets anyone grant a role above their own', async () => {
    const inv = (s: Session, b: Record<string, unknown>) => call(c.app, s, 'post', `${ADMIN}/staff/invites`, b);
    // clinic_admin: only clinic_staff, only in their own clinic.
    expect((await inv(c.S.adminA, { email: 'e1@example.test', role: 'clinic_admin', clinicId: c.clinicA })).body).toMatchObject({ error: { code: 'role_not_grantable' } });
    expect((await inv(c.S.adminA, { email: 'e2@example.test', role: 'provincial_admin' })).status).toBe(403);
    expect((await inv(c.S.adminA, { email: 'e3@example.test', role: 'technical_admin' })).status).toBe(403);
    expect((await inv(c.S.adminA, { email: 'e4@example.test', role: 'clinic_staff', clinicId: c.clinicB })).status).toBe(404);
    expect((await inv(c.S.adminA, { email: 'e5@example.test', role: 'clinic_staff', clinicId: c.clinicA })).status).toBe(201);
    // provincial_admin cannot create a technical_admin; technical_admin can.
    expect((await inv(c.S.prov, { email: 'e6@example.test', role: 'technical_admin' })).body).toMatchObject({ error: { code: 'role_not_grantable' } });
    expect((await inv(c.S.prov, { email: 'e7@example.test', role: 'provincial_admin' })).status).toBe(201);
    expect((await inv(c.S.tech, { email: 'e8@example.test', role: 'technical_admin' })).status).toBe(201);
    const none = await c.h.db.query(`select 1 from staff_invites where email in ('e1@example.test','e2@example.test','e3@example.test','e4@example.test','e6@example.test')`);
    expect(none.rows).toHaveLength(0);
  });

  it('gives a clinic admin a view limited to their own clinic and its people', async () => {
    const list = await staffList(c, c.S.adminA);
    const emails = list.map((u) => u.email);
    expect(emails).toContain(STAFF_EMAIL);
    expect(emails).not.toContain('staff.b@demo.invalid');
    expect(emails).not.toContain('provincial@demo.invalid');
    expect(emails).not.toContain('tech@demo.invalid');
    expect(list.every((u) => u.memberships.every((m) => m.clinicId === c.clinicA))).toBe(true);
    const all = await staffList(c, c.S.tech);
    expect(all.map((u) => u.email)).toEqual(expect.arrayContaining(['staff.b@demo.invalid', 'provincial@demo.invalid', 'tech@demo.invalid']));
    // The password hash never leaves the server.
    expect(JSON.stringify(all)).not.toMatch(/scrypt|password/i);
    // A clinic admin only sees their clinic's invites.
    await call(c.app, c.S.prov, 'post', `${ADMIN}/staff/invites`, { email: 'only.b@example.test', role: 'clinic_staff', clinicId: c.clinicB });
    const inv = (await call(c.app, c.S.adminA, 'get', `${ADMIN}/staff/invites`)).body as { items: { email: string; clinicId: string }[] };
    expect(inv.items.every((i) => i.clinicId === c.clinicA)).toBe(true);
  });

  it('keeps clinic admins inside their clinic when managing memberships', async () => {
    const bId = await userId(c, 'staff.b@demo.invalid');
    const aId = await userId(c, STAFF_EMAIL);
    const provId = await userId(c, 'provincial@demo.invalid');
    const adminAId = await userId(c, 'admin.a@demo.invalid');
    const post = (s: Session, uid: string, b: Record<string, unknown>) => call(c.app, s, 'post', `${ADMIN}/staff/${uid}/memberships`, b);

    // No poaching of another clinic's staff by user id, and no probing of admins.
    expect((await post(c.S.adminA, bId, { clinicId: c.clinicA, role: 'clinic_staff' })).status).toBe(404);
    expect((await post(c.S.adminA, provId, { clinicId: c.clinicA, role: 'clinic_staff' })).status).toBe(404);
    // Cannot touch another clinic, cannot promote to an equal role, cannot touch themselves.
    expect((await post(c.S.adminA, aId, { clinicId: c.clinicB, role: 'clinic_staff' })).status).toBe(404);
    expect((await post(c.S.adminA, aId, { clinicId: c.clinicA, role: 'clinic_admin' })).body).toMatchObject({ error: { code: 'role_not_grantable' } });
    expect((await post(c.S.adminA, adminAId, { clinicId: c.clinicA, role: 'clinic_staff' })).body).toMatchObject({ error: { code: 'cannot_modify_self' } });
    expect((await call(c.app, c.S.adminA, 'delete', `${ADMIN}/staff/${adminAId}/memberships/${c.clinicA}`)).status).toBe(409);
    // Bad role values are rejected by the schema, not coerced.
    expect((await post(c.S.prov, aId, { clinicId: c.clinicA, role: 'provincial_admin' })).status).toBe(400);
    // Admin accounts do not hold clinic memberships (separation of duty).
    const techId = await userId(c, 'tech@demo.invalid');
    expect((await post(c.S.prov, techId, { clinicId: c.clinicA, role: 'clinic_staff' })).body).toMatchObject({ error: { code: 'membership_not_applicable' } });

    // A clinic admin cannot demote or remove a peer clinic admin.
    const peer = await makeUser(c, c.S.prov, 'clinic_admin', c.clinicA);
    expect((await post(c.S.adminA, peer.id, { clinicId: c.clinicA, role: 'clinic_staff' })).status).toBe(403);
    expect((await call(c.app, c.S.adminA, 'delete', `${ADMIN}/staff/${peer.id}/memberships/${c.clinicA}`)).status).toBe(403);
  });

  it('assigns and removes memberships with immediate effect on queue access, and audits both', async () => {
    const bId = await userId(c, 'staff.b@demo.invalid');
    const queueA = '/api/v1/staff/clinics/demo-clinic-a/booking-requests';
    expect((await call(c.app, c.S.staffB, 'get', queueA)).status).toBe(404);
    const add = await call(c.app, c.S.prov, 'post', `${ADMIN}/staff/${bId}/memberships`, { clinicId: c.clinicA, role: 'clinic_staff' });
    expect(add.status).toBe(204);
    expect((await call(c.app, c.S.staffB, 'get', queueA)).status).toBe(200);
    expect((await staffList(c, c.S.adminA)).find((u) => u.id === bId)?.memberships).toEqual([expect.objectContaining({ clinicId: c.clinicA, active: true })]);
    // A clinic admin can now manage that person within their clinic, and removal takes effect at once.
    expect((await call(c.app, c.S.adminA, 'delete', `${ADMIN}/staff/${bId}/memberships/${c.clinicA}`)).status).toBe(204);
    expect((await call(c.app, c.S.staffB, 'get', queueA)).status).toBe(404);
    const actions = (await auditRows(c.h.db)).map((r) => r.action);
    expect(actions).toEqual(expect.arrayContaining(['governance.staff_membership_set', 'governance.staff_membership_removed']));
    expect((await call(c.app, c.S.prov, 'delete', `${ADMIN}/staff/${bId}/memberships/${c.clinicA}`)).status).toBe(204); // already inactive: idempotent for admins
  });
});

describe('deactivation and last-admin protection', () => {
  let c: Ctx;
  beforeAll(async () => {
    c = await setup();
  });
  afterAll(async () => {
    await c.h.db.close();
  });
  beforeEach(() => {
    c.h.clock.now = new Date(T0);
  });

  it('is limited to provincial and technical admins and revokes every session of the user', async () => {
    const victim = await makeUser(c, c.S.prov, 'clinic_staff', c.clinicA);
    const second = await login(c.app, victim.email, NEW_PW);
    expect((await call(c.app, victim.session, 'get', '/api/v1/staff/me')).status).toBe(200);
    expect((await call(c.app, c.S.adminA, 'post', `${ADMIN}/staff/${victim.id}/deactivate`)).status).toBe(403);
    expect((await call(c.app, c.S.staffA, 'post', `${ADMIN}/staff/${victim.id}/deactivate`)).status).toBe(403);
    expect((await call(c.app, null, 'post', `${ADMIN}/staff/${victim.id}/deactivate`)).status).toBe(401);
    expect((await call(c.app, c.S.prov, 'post', `${ADMIN}/staff/${victim.id}/deactivate`, undefined, false)).status).toBe(403);

    const res = await call(c.app, c.S.prov, 'post', `${ADMIN}/staff/${victim.id}/deactivate`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deactivated: true, sessionsRevoked: 2 });
    expect((await call(c.app, victim.session, 'get', '/api/v1/staff/me')).status).toBe(401);
    expect((await call(c.app, second, 'get', '/api/v1/staff/me')).status).toBe(401);
    expect((await request(c.app).post('/api/v1/staff/login').send({ email: victim.email, password: NEW_PW })).status).toBe(401);
    expect((await call(c.app, c.S.prov, 'post', `${ADMIN}/staff/${victim.id}/deactivate`)).body).toMatchObject({ error: { code: 'already_inactive' } });
    const ev = (await auditRows(c.h.db, 'governance.staff_user_deactivated')).find((r) => r.target_id === victim.id);
    expect(ev?.metadata).toMatchObject({ count: 2 });
  });

  it('never lets someone deactivate a higher role or themselves', async () => {
    const techId = await userId(c, 'tech@demo.invalid');
    const provId = await userId(c, 'provincial@demo.invalid');
    expect((await call(c.app, c.S.prov, 'post', `${ADMIN}/staff/${techId}/deactivate`)).status).toBe(403);
    expect((await call(c.app, c.S.prov, 'post', `${ADMIN}/staff/${provId}/deactivate`)).body).toMatchObject({ error: { code: 'cannot_modify_self' } });
    expect((await call(c.app, c.S.tech, 'post', `${ADMIN}/staff/${techId}/deactivate`)).body).toMatchObject({ error: { code: 'cannot_modify_self' } });
    expect((await call(c.app, c.S.tech, 'post', `${ADMIN}/staff/00000000-0000-4000-8000-000000000000/deactivate`)).status).toBe(404);
  });

  it('cannot deactivate the last active provincial administrator', async () => {
    const provId = await userId(c, 'provincial@demo.invalid');
    // Exactly one active provincial admin exists: the technical admin may not remove it.
    const blocked = await call(c.app, c.S.tech, 'post', `${ADMIN}/staff/${provId}/deactivate`);
    expect(blocked.status).toBe(409);
    expect(blocked.body).toMatchObject({ error: { code: 'last_admin' } });
    expect((await call(c.app, c.S.prov, 'get', `${ADMIN}/clinics`)).status).toBe(200);

    // With a second provincial admin the first can go; then the second is protected.
    const second = await makeUser(c, c.S.prov, 'provincial_admin');
    expect((await call(c.app, c.S.tech, 'post', `${ADMIN}/staff/${provId}/deactivate`)).status).toBe(200);
    expect((await call(c.app, c.S.prov, 'get', `${ADMIN}/clinics`)).status).toBe(401);
    expect((await call(c.app, c.S.tech, 'post', `${ADMIN}/staff/${second.id}/deactivate`)).body).toMatchObject({ error: { code: 'last_admin' } });
    expect((await call(c.app, second.session, 'get', `${ADMIN}/clinics`)).status).toBe(200);
  });
});
