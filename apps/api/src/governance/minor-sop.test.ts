import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { AdminConfigSchema, MinorBookingReadinessSchema, MinorSopMappingSchema } from '@kalinga/shared';
import { createMinorPolicy } from '../booking/minor-policy.js';
import { loadEnv } from '../env.js';
import { ADMIN, addPublishEvidence, auditRows, call, clinicIdOf, loginAll, makeHarness, makeRealClinic, type App, type Harness, type Sessions } from './test-support.js';

let h: Harness;
let app: App;
let S: Sessions;

const T0 = '2026-10-30T04:00:00Z';
const SOP = { sopArtifactReference: 'SOP-MINOR-ACCESS-2026-03', sopVersion: 'v1.2', approvedBy: 'Dr. Elena P. Cruz', approvedAt: '2026-09-01', effectiveFrom: '2026-10-01' };

beforeAll(async () => {
  h = await makeHarness();
  app = h.build();
  S = await loginAll(app);
});
afterAll(async () => {
  await h.db.close();
});
beforeEach(() => {
  h.clock.now = new Date(T0);
  h.logs.length = 0;
});

const readiness = async (s = S.prov, query = '') => {
  const res = await call(app, s, 'get', `${ADMIN}/minor-booking-readiness${query}`);
  expect(res.status).toBe(200);
  return MinorBookingReadinessSchema.parse(res.body);
};

/** A published non-demo clinic with the demo booking configuration copied over (test fixture only). */
async function bookableRealClinic(): Promise<{ id: string; slug: string }> {
  const c = await makeRealClinic(h.db, 'minor');
  await h.db.query(
    `update clinics set status = 'published', verification_level = 'provider_confirmed', verification_source = 'test fixture', last_verified_at = now() where id = $1`,
    [c.id],
  );
  await addPublishEvidence(h.db, c.id); // S9-3: a published real clinic is only served with unexpired evidence
  await h.db.query(
    `insert into clinic_booking_config (clinic_id, enabled, service_mode, contact_preference_mode, notes_mode, notes_max_length, low_disclosure_supported,
       disclosure_purpose, disclosure_recipient, disclosure_cancellation, min_advance_days, max_advance_days, retention_days)
     select $1, enabled, service_mode, contact_preference_mode, notes_mode, notes_max_length, low_disclosure_supported,
       disclosure_purpose, disclosure_recipient, disclosure_cancellation, min_advance_days, max_advance_days, retention_days
     from clinic_booking_config where clinic_id = (select id from clinics where slug = 'demo-clinic-a')`,
    [c.id],
  );
  return c;
}

describe('minor SOP clinic mapping', () => {
  it('records, lists and revokes a mapping for a real clinic (provincial admin only)', async () => {
    const c = await makeRealClinic(h.db, 'sop');
    const before = await readiness(S.prov, `?clinicId=${c.id}`);
    expect(before).toMatchObject({ mappingPresent: false, mappingCount: 0, envEnabled: false, realMinorBookingActive: false });

    const rec = await call(app, S.prov, 'post', `${ADMIN}/clinics/${c.id}/minor-sop-mappings`, SOP);
    expect(rec.status).toBe(201);
    const mapping = MinorSopMappingSchema.parse(rec.body);
    expect(mapping).toMatchObject({ clinicId: c.id, status: 'recorded', sopVersion: 'v1.2', effectiveFrom: '2026-10-01' });

    const after = await readiness(S.tech, `?clinicId=${c.id}`);
    expect(after).toMatchObject({ mappingPresent: true, mappingCount: 1, envEnabled: false, realMinorBookingActive: false });
    expect(after.blockedBy).toEqual(expect.arrayContaining(['real_minor_booking_flag_disabled', 'booking_policy_not_wired_to_mappings']));
    expect(((await call(app, S.tech, 'get', `${ADMIN}/clinics/${c.id}/minor-sop-mappings`)).body as { items: unknown[] }).items).toHaveLength(1);

    expect((await call(app, S.prov, 'post', `${ADMIN}/clinics/${c.id}/minor-sop-mappings/${mapping.id}/revoke`)).body).toMatchObject({ status: 'revoked' });
    expect((await call(app, S.prov, 'post', `${ADMIN}/clinics/${c.id}/minor-sop-mappings/${mapping.id}/revoke`)).status).toBe(409);
    expect(await readiness(S.prov, `?clinicId=${c.id}`)).toMatchObject({ mappingPresent: false, realMinorBookingActive: false });
  });

  it('rejects malformed input and DEMO clinics, and enforces roles and CSRF', async () => {
    const c = await makeRealClinic(h.db, 'sopbad');
    const post = (b: unknown, s = S.prov, csrf = true) => call(app, s, 'post', `${ADMIN}/clinics/${c.id}/minor-sop-mappings`, b, csrf);
    expect((await post({ ...SOP, sopArtifactReference: 'x\ny' })).status).toBe(400);
    expect((await post({ ...SOP, effectiveFrom: '2026-08-01' })).status).toBe(400); // before approval
    expect((await post({ ...SOP, approvedAt: '2026-13-01' })).status).toBe(400);
    expect((await post({ ...SOP, approvedBy: 'AI assistant' })).status).toBe(400);
    expect((await post({ ...SOP, extra: true })).status).toBe(400);
    expect((await post(SOP, S.tech)).status).toBe(403);
    expect((await post(SOP, S.adminA)).status).toBe(403);
    expect((await post(SOP, S.staffA)).status).toBe(403);
    expect((await post(SOP, S.prov, false)).status).toBe(403);
    expect((await call(app, null, 'post', `${ADMIN}/clinics/${c.id}/minor-sop-mappings`, SOP)).status).toBe(401);
    const demoId = await clinicIdOf(h.db, 'demo-clinic-a');
    const demo = await call(app, S.prov, 'post', `${ADMIN}/clinics/${demoId}/minor-sop-mappings`, SOP);
    expect(demo.status).toBe(409);
    expect(demo.body).toMatchObject({ error: { code: 'demo_clinic_locked' } });
    await expect(
      h.db.query(`insert into minor_sop_mappings (clinic_id, sop_artifact_reference, sop_version, approved_by, approved_at, effective_from, recorded_by) values ($1, 'SOP-1-2026', 'v1', 'Some Person', '2026-01-01', '2026-01-02', gen_random_uuid())`, [demoId]),
    ).rejects.toThrow(/demo clinics cannot be mapped/);
    const rows = await h.db.query('select 1 from minor_sop_mappings where clinic_id = $1', [c.id]);
    expect(rows.rows).toHaveLength(0);
    expect((await call(app, S.prov, 'get', `${ADMIN}/minor-booking-readiness?clinicId=nope`)).status).toBe(400);
    expect((await call(app, S.adminA, 'get', `${ADMIN}/minor-booking-readiness`)).status).toBe(403);
  });

  it('does NOT enable real 15-17 booking: behaviour is identical before and after a mapping', async () => {
    const c = await bookableRealClinic();
    const post = () =>
      request(app)
        .post('/api/v1/public/booking-requests')
        .set('Idempotency-Key', 'minor-mapping-test-key-0001-abcdef')
        .send({ clinicId: c.slug, ageBand: '15_17', preferredDate: '2026-11-04', preferredWindow: 'morning', acknowledgedDisclosure: true });
    const config = () => request(app).get(`/api/v1/public/clinics/${c.slug}/booking-config`);
    const policy = createMinorPolicy({ DEMO_MODE: false, REAL_MINOR_BOOKING_ENABLED: false });
    const input = { ageBand: '15_17' as const, clinicId: c.id, isDemoClinic: false, demoMode: false };

    const beforePost = await post();
    const beforeConfig = await config();
    const beforeDecision = policy.evaluate(input);
    expect(beforePost.status).toBeGreaterThanOrEqual(400);
    expect(beforeDecision).toEqual({ outcome: 'rejected', code: 'minor_policy_not_configured' });

    expect((await call(app, S.prov, 'post', `${ADMIN}/clinics/${c.id}/minor-sop-mappings`, SOP)).status).toBe(201);
    const status = await readiness();
    expect(status).toMatchObject({ mappingPresent: true, envEnabled: false, realMinorBookingActive: false });

    const afterPost = await post();
    expect(afterPost.status).toBe(beforePost.status);
    expect(afterPost.body.error?.code).toBe(beforePost.body.error?.code);
    expect(afterPost.body.error?.message).toBe(beforePost.body.error?.message);
    expect(afterPost.status).not.toBe(201);
    expect((await config()).body).toEqual(beforeConfig.body);
    expect(policy.evaluate(input)).toEqual(beforeDecision);
    // The policy factory still refuses real minors even when a (hypothetical) evidence object for this clinic is supplied while the flag is off.
    const withEvidence = createMinorPolicy({ DEMO_MODE: false, REAL_MINOR_BOOKING_ENABLED: false }, { evidenceId: 'x', policyVersion: 'v1', effectiveFrom: new Date('2026-01-01'), clinicIds: [c.id] });
    expect(withEvidence.evaluate(input)).toEqual({ outcome: 'rejected', code: 'minor_policy_not_configured' });
    const created = await h.db.query('select 1 from booking_requests where clinic_id = $1', [c.id]);
    expect(created.rows).toHaveLength(0);
    // The environment cannot be switched on either.
    expect(() => loadEnv({ REAL_MINOR_BOOKING_ENABLED: 'true' })).toThrow();
  });

  it('audits mapping changes without the SOP reference or approver name', async () => {
    await h.db.exec('truncate audit_events');
    const c = await makeRealClinic(h.db, 'sopaud');
    const rec = await call(app, S.prov, 'post', `${ADMIN}/clinics/${c.id}/minor-sop-mappings`, { ...SOP, sopArtifactReference: 'SOP-AUDIT-PROBE-9', approvedBy: 'Quentin Probe' });
    await call(app, S.prov, 'post', `${ADMIN}/clinics/${c.id}/minor-sop-mappings/${(rec.body as { id: string }).id}/revoke`);
    const rows = await auditRows(h.db);
    expect(rows.map((r) => r.action).sort()).toEqual(['governance.minor_sop_recorded', 'governance.minor_sop_revoked']);
    expect(rows.every((r) => r.clinic_id === c.id && r.target_type === 'minor_sop_mapping')).toBe(true);
    expect(JSON.stringify(rows) + h.logs.join('\n')).not.toMatch(/SOP-AUDIT-PROBE|Quentin/);
  });
});

describe('safe configuration view', () => {
  it('is technical-admin only and shows effective flags without secrets', async () => {
    const res = await call(app, S.tech, 'get', `${ADMIN}/config`);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const cfg = AdminConfigSchema.parse(res.body);
    expect(cfg).toMatchObject({
      demoMode: true,
      notificationTransport: 'mock',
      realNotificationsEnabled: false,
      realBookingRequestsEnabled: false,
      realMinorBookingEnabled: false,
      clinicalContentApproved: false,
    });
    for (const s of [S.prov, S.adminA, S.staffA]) expect((await call(app, s, 'get', `${ADMIN}/config`)).status).toBe(403);
    expect((await call(app, null, 'get', `${ADMIN}/config`)).status).toBe(401);
  });

  it('reports that a booking key is configured without ever returning it', async () => {
    const key = 'k'.repeat(48);
    const keyed = h.build({}, loadEnv({ BOOKING_SECRET_KEY: key }));
    const res = await call(keyed, S.tech, 'get', `${ADMIN}/config`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ bookingKeyConfigured: true });
    expect(JSON.stringify(res.body)).not.toContain(key);
    expect(Object.keys(res.body as object).sort()).toEqual(Object.keys(AdminConfigSchema.shape).sort());
  });
});
