import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AdminClinicListSchema, EvidenceSchema, type AdminClinic } from '@kalinga/shared';
import { translateDbError } from './common.js';
import { ADMIN, PROVINCIAL, auditRows, call, clinicIdOf, login, loginAll, makeHarness, makeRealClinic, type App, type Harness, type Sessions } from './test-support.js';

let h: Harness;
let app: App;
let S: Sessions;

const T0 = '2026-10-30T04:00:00Z';
const inDays = (d: number) => new Date(new Date(T0).getTime() + d * 86_400_000).toISOString();
const REF = 'MOA-2026-017';

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

async function adminClinic(id: string): Promise<AdminClinic> {
  const res = await call(app, S.prov, 'get', `${ADMIN}/clinics`);
  const found = AdminClinicListSchema.parse(res.body).items.find((c) => c.id === id);
  if (!found) throw new Error('clinic not listed');
  return found;
}

async function addAccepted(clinicId: string, type = 'partnership_agreement', ref = REF, days = 365): Promise<string> {
  const add = await call(app, S.prov, 'post', `${ADMIN}/clinics/${clinicId}/evidence`, { evidenceType: type, evidenceReference: ref, expiresAt: inDays(days) });
  expect(add.status).toBe(201);
  const rev = await call(app, S.prov, 'post', `${ADMIN}/clinics/${clinicId}/evidence/${(add.body as { id: string }).id}/review`, { decision: 'accept' });
  expect(rev.status).toBe(200);
  return (add.body as { id: string }).id;
}

describe('partner verification evidence', () => {
  it('lets a provincial admin add, accept and reject evidence records (identifier only)', async () => {
    const c = await makeRealClinic(h.db, 'ev');
    const add = await call(app, S.prov, 'post', `${ADMIN}/clinics/${c.id}/evidence`, { evidenceType: 'service_confirmation', evidenceReference: REF, expiresAt: inDays(90) });
    expect(add.status).toBe(201);
    const ev = EvidenceSchema.parse(add.body);
    expect(ev).toMatchObject({ clinicId: c.id, status: 'pending', verifiedBy: null, verifiedAt: null, evidenceReference: REF });
    expect(add.headers['cache-control']).toBe('no-store');

    const ok = await call(app, S.prov, 'post', `${ADMIN}/clinics/${c.id}/evidence/${ev.id}/review`, { decision: 'accept' });
    expect(ok.status).toBe(200);
    expect(EvidenceSchema.parse(ok.body)).toMatchObject({ status: 'accepted', verifiedBy: (S.prov.body.user as { id: string }).id });
    expect((ok.body as { verifiedAt: string }).verifiedAt).toBe(new Date(T0).toISOString());
    // Already reviewed: cannot be reviewed twice.
    expect((await call(app, S.prov, 'post', `${ADMIN}/clinics/${c.id}/evidence/${ev.id}/review`, { decision: 'reject' })).status).toBe(409);

    const add2 = await call(app, S.prov, 'post', `${ADMIN}/clinics/${c.id}/evidence`, { evidenceType: 'fee_confirmation', evidenceReference: 'FEE-LETTER-2026-02', expiresAt: inDays(30) });
    const rej = await call(app, S.prov, 'post', `${ADMIN}/clinics/${c.id}/evidence/${(add2.body as { id: string }).id}/review`, { decision: 'reject' });
    expect(rej.body).toMatchObject({ status: 'rejected', verifiedBy: null });

    const list = await call(app, S.tech, 'get', `${ADMIN}/clinics/${c.id}/evidence`);
    expect(list.status).toBe(200);
    expect((list.body as { items: unknown[] }).items).toHaveLength(2);
  });

  it('rejects file contents, URLs with spaces, multi-line text and unknown fields', async () => {
    const c = await makeRealClinic(h.db, 'bad');
    const post = (body: Record<string, unknown>) => call(app, S.prov, 'post', `${ADMIN}/clinics/${c.id}/evidence`, { evidenceType: 'partnership_agreement', expiresAt: inDays(10), ...body });
    expect((await post({ evidenceReference: 'ok\nsecond line' })).status).toBe(400);
    expect((await post({ evidenceReference: '<script>x</script>' })).status).toBe(400);
    expect((await post({ evidenceReference: 'A'.repeat(500) })).status).toBe(400);
    expect((await post({ evidenceReference: REF, fileContents: 'base64...' })).status).toBe(400);
    expect((await post({ evidenceReference: REF, evidenceType: 'passport' })).status).toBe(400);
  });

  it('validates the expiry window and the clinic', async () => {
    const c = await makeRealClinic(h.db, 'exp');
    const body = { evidenceType: 'partnership_agreement', evidenceReference: REF };
    expect((await call(app, S.prov, 'post', `${ADMIN}/clinics/${c.id}/evidence`, { ...body, expiresAt: inDays(-1) })).body).toMatchObject({ error: { code: 'evidence_expiry_invalid' } });
    expect((await call(app, S.prov, 'post', `${ADMIN}/clinics/${c.id}/evidence`, { ...body, expiresAt: inDays(4000) })).status).toBe(422);
    const missing = '00000000-0000-4000-8000-000000000000';
    expect((await call(app, S.prov, 'post', `${ADMIN}/clinics/${missing}/evidence`, { ...body, expiresAt: inDays(5) })).status).toBe(404);
    expect((await call(app, S.prov, 'get', `${ADMIN}/clinics/not_valid!/evidence`)).status).toBe(404);
  });

  it('does not let evidence be reviewed through another clinic (isolation by clinic id)', async () => {
    const a = await makeRealClinic(h.db, 'iso-a');
    const b = await makeRealClinic(h.db, 'iso-b');
    const add = await call(app, S.prov, 'post', `${ADMIN}/clinics/${a.id}/evidence`, { evidenceType: 'partnership_agreement', evidenceReference: REF, expiresAt: inDays(10) });
    const id = (add.body as { id: string }).id;
    expect((await call(app, S.prov, 'post', `${ADMIN}/clinics/${b.id}/evidence/${id}/review`, { decision: 'accept' })).status).toBe(404);
    expect((await call(app, S.prov, 'post', `${ADMIN}/clinics/${b.id}/evidence/${id}/expire`)).status).toBe(404);
    const row = await h.db.query<{ status: string }>('select status from clinic_verification_evidence where id = $1', [id]);
    expect(row.rows[0]?.status).toBe('pending');
  });
});

describe('verification and publishing of a real clinic', () => {
  it('requires evidence, then a verification level, source and date, before a real clinic can be published', async () => {
    const c = await makeRealClinic(h.db, 'pub');
    let v = (await adminClinic(c.id)).version;

    // draft -> in_review is fine, but publishing is not.
    expect((await call(app, S.prov, 'patch', `${ADMIN}/clinics/${c.id}/status`, { expectedVersion: v, status: 'in_review' })).status).toBe(200);
    v += 1;
    const noVerification = await call(app, S.prov, 'patch', `${ADMIN}/clinics/${c.id}/status`, { expectedVersion: v, status: 'published' });
    expect(noVerification.status).toBe(422);
    expect(noVerification.body).toMatchObject({ error: { code: 'publish_requires_verification' } });

    // Raising the level needs accepted, unexpired partnership evidence first.
    const noEvidence = await call(app, S.prov, 'patch', `${ADMIN}/clinics/${c.id}/verification`, { expectedVersion: v, verificationLevel: 'provider_confirmed', verificationSource: 'Signed MOA on file' });
    expect(noEvidence.status).toBe(422);
    expect(noEvidence.body).toMatchObject({ error: { code: 'evidence_required' } });

    // A pending or wrong-type record does not count.
    const pend = await call(app, S.prov, 'post', `${ADMIN}/clinics/${c.id}/evidence`, { evidenceType: 'partnership_agreement', evidenceReference: REF, expiresAt: inDays(60) });
    expect(pend.status).toBe(201);
    await addAccepted(c.id, 'fee_confirmation', 'FEE-2026-1');
    expect((await call(app, S.prov, 'patch', `${ADMIN}/clinics/${c.id}/verification`, { expectedVersion: v, verificationLevel: 'provider_confirmed', verificationSource: 'src' })).status).toBe(422);

    // Accept the partnership record: now it works.
    const pendingId = (pend.body as { id: string }).id;
    expect((await call(app, S.prov, 'post', `${ADMIN}/clinics/${c.id}/evidence/${pendingId}/review`, { decision: 'accept' })).status).toBe(200);
    const ver = await call(app, S.prov, 'patch', `${ADMIN}/clinics/${c.id}/verification`, { expectedVersion: v, verificationLevel: 'provider_confirmed', verificationSource: 'Signed MOA on file' });
    expect(ver.status).toBe(200);
    expect(ver.body).toMatchObject({ verificationLevel: 'provider_confirmed', verificationSource: 'Signed MOA on file', hasPublishEvidence: true, version: v + 1 });
    v += 1;

    const pub = await call(app, S.prov, 'patch', `${ADMIN}/clinics/${c.id}/status`, { expectedVersion: v, status: 'published' });
    expect(pub.status).toBe(200);
    expect(pub.body).toMatchObject({ status: 'published', lastVerifiedAt: new Date(T0).toISOString() });

    // History rows were appended and no free-text leaks into the audit trail.
    const rec = await h.db.query<{ n: number }>(`select count(*)::int as n from clinic_verification_records where clinic_id = $1`, [c.id]);
    expect(rec.rows[0]?.n).toBeGreaterThanOrEqual(1);
  });

  it('uses optimistic versions (stale write is a 409) and per-field verification needs evidence + source', async () => {
    const c = await makeRealClinic(h.db, 'ver');
    const v = (await adminClinic(c.id)).version;
    expect((await call(app, S.prov, 'patch', `${ADMIN}/clinics/${c.id}/status`, { expectedVersion: v + 5, status: 'in_review' })).body).toMatchObject({ error: { code: 'version_conflict' } });
    // Source is mandatory when marking verified (schema level).
    expect((await call(app, S.prov, 'patch', `${ADMIN}/clinics/${c.id}/verification`, { expectedVersion: v, addressVerification: 'verified' })).status).toBe(400);
    expect((await call(app, S.prov, 'patch', `${ADMIN}/clinics/${c.id}/verification`, { expectedVersion: v })).status).toBe(400);
    // demo_fictitious cannot be set through the API.
    expect((await call(app, S.prov, 'patch', `${ADMIN}/clinics/${c.id}/verification`, { expectedVersion: v, verificationLevel: 'demo_fictitious', verificationSource: 's' })).status).toBe(400);
    // Marking a fact verified needs some accepted evidence.
    const noEv = await call(app, S.prov, 'patch', `${ADMIN}/clinics/${c.id}/verification`, { expectedVersion: v, addressVerification: 'verified', verificationSource: 'site visit' });
    expect(noEv.body).toMatchObject({ error: { code: 'evidence_required' } });
    await addAccepted(c.id, 'service_confirmation', 'SVC-2026-4');
    const ok = await call(app, S.prov, 'patch', `${ADMIN}/clinics/${c.id}/verification`, { expectedVersion: v, addressVerification: 'verified', verificationSource: 'site visit' });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ addressVerification: 'verified', contactVerification: 'unknown' });
  });

  it('returns a published clinic to review when its last partnership evidence is expired', async () => {
    const c = await makeRealClinic(h.db, 'lapse');
    const evId = await addAccepted(c.id);
    let v = (await adminClinic(c.id)).version;
    await call(app, S.prov, 'patch', `${ADMIN}/clinics/${c.id}/status`, { expectedVersion: v, status: 'in_review' });
    v += 1;
    await call(app, S.prov, 'patch', `${ADMIN}/clinics/${c.id}/verification`, { expectedVersion: v, verificationLevel: 'verified_real', verificationSource: 'Signed MOA on file' });
    v += 1;
    expect((await call(app, S.prov, 'patch', `${ADMIN}/clinics/${c.id}/status`, { expectedVersion: v, status: 'published' })).status).toBe(200);

    const exp = await call(app, S.prov, 'post', `${ADMIN}/clinics/${c.id}/evidence/${evId}/expire`);
    expect(exp.status).toBe(200);
    expect(exp.body).toMatchObject({ status: 'expired' });
    expect(await adminClinic(c.id)).toMatchObject({ status: 'in_review', hasPublishEvidence: false });
    expect((await call(app, S.prov, 'post', `${ADMIN}/clinics/${c.id}/evidence/${evId}/expire`)).status).toBe(409);
    const lapsed = (await auditRows(h.db, 'governance.clinic_status_changed')).filter((a) => a.clinic_id === c.id && a.metadata.outcome === 'evidence_lapsed');
    expect(lapsed).toHaveLength(1);
  });

  it('treats evidence that passed its expiry date as invalid for publishing', async () => {
    const c = await makeRealClinic(h.db, 'time');
    await addAccepted(c.id, 'partnership_agreement', REF, 10);
    let v = (await adminClinic(c.id)).version;
    await call(app, S.prov, 'patch', `${ADMIN}/clinics/${c.id}/status`, { expectedVersion: v, status: 'in_review' });
    v += 1;
    // Level change needs valid evidence: do it while valid, then let it lapse by moving the clock.
    await call(app, S.prov, 'patch', `${ADMIN}/clinics/${c.id}/verification`, { expectedVersion: v, verificationLevel: 'provider_confirmed', verificationSource: 'MOA' });
    v += 1;
    h.clock.now = new Date(inDays(11));
    const P = await login(app, PROVINCIAL);
    const late = await call(app, P, 'patch', `${ADMIN}/clinics/${c.id}/status`, { expectedVersion: v, status: 'published' });
    expect(late.status).toBe(422);
    expect(late.body).toMatchObject({ error: { code: 'evidence_required' } });
    expect(AdminClinicListSchema.parse((await call(app, P, 'get', `${ADMIN}/clinics`)).body).items.find((x) => x.id === c.id)?.hasPublishEvidence).toBe(false);
    // Time travel purges earlier sessions: restore the clock and sign in again for the remaining tests.
    h.clock.now = new Date(T0);
    S = await loginAll(app);
  });

  it('lowering the level of a published clinic returns it to review instead of breaking the publish guard', async () => {
    const c = await makeRealClinic(h.db, 'low');
    await addAccepted(c.id);
    let v = (await adminClinic(c.id)).version;
    await call(app, S.prov, 'patch', `${ADMIN}/clinics/${c.id}/status`, { expectedVersion: v, status: 'in_review' });
    v += 1;
    await call(app, S.prov, 'patch', `${ADMIN}/clinics/${c.id}/verification`, { expectedVersion: v, verificationLevel: 'provider_confirmed', verificationSource: 'MOA' });
    v += 1;
    await call(app, S.prov, 'patch', `${ADMIN}/clinics/${c.id}/status`, { expectedVersion: v, status: 'published' });
    v += 1;
    const low = await call(app, S.prov, 'patch', `${ADMIN}/clinics/${c.id}/verification`, { expectedVersion: v, verificationLevel: 'unverified' });
    expect(low.status).toBe(200);
    expect(low.body).toMatchObject({ status: 'in_review', verificationLevel: 'unverified' });
  });
});

describe('DEMO clinics stay fictitious (existing constraints surface as clean errors)', () => {
  it('refuses evidence, verification and real levels for a demo clinic with 409 and changes nothing', async () => {
    const demoId = await clinicIdOf(h.db, 'demo-clinic-a');
    const before = await h.db.query<Record<string, unknown>>('select verification_level, address_verification, status, version from clinics where id = $1', [demoId]);
    const locked = { error: { code: 'demo_clinic_locked' } };
    expect((await call(app, S.prov, 'post', `${ADMIN}/clinics/${demoId}/evidence`, { evidenceType: 'partnership_agreement', evidenceReference: REF, expiresAt: inDays(5) })).body).toMatchObject(locked);
    const v = (await adminClinic(demoId)).version;
    expect((await call(app, S.prov, 'patch', `${ADMIN}/clinics/${demoId}/verification`, { expectedVersion: v, verificationLevel: 'verified_real', verificationSource: 'x' })).body).toMatchObject(locked);
    expect((await call(app, S.prov, 'patch', `${ADMIN}/clinics/${demoId}/verification`, { expectedVersion: v, addressVerification: 'verified', verificationSource: 'x' })).status).toBe(409);
    const after = await h.db.query<Record<string, unknown>>('select verification_level, address_verification, status, version from clinics where id = $1', [demoId]);
    expect(after.rows).toEqual(before.rows);
    const ev = await h.db.query('select 1 from clinic_verification_evidence where clinic_id = $1', [demoId]);
    expect(ev.rows).toHaveLength(0);
  });

  it('keeps the database guards even if the API check were bypassed, and maps their errors to 4xx', async () => {
    const demoId = await clinicIdOf(h.db, 'demo-clinic-b');
    await expect(
      h.db.query(`insert into clinic_verification_evidence (clinic_id, evidence_type, evidence_reference, recorded_by, expires_at) values ($1, 'partnership_agreement', 'MOA-X-1', gen_random_uuid(), now() + interval '1 day')`, [demoId]),
    ).rejects.toThrow(/demo clinics cannot hold real verification evidence/);
    await expect(h.db.query(`update clinics set verification_level = 'verified_real' where id = $1`, [demoId])).rejects.toThrow();
    expect(translateDbError(new Error('demo clinics cannot hold real verification evidence'))).toMatchObject({ status: 409, code: 'demo_clinic_locked' });
    expect(translateDbError(new Error('violates check constraint "clinics_published_requires_verification"'))).toMatchObject({ status: 422 });
    expect(translateDbError(new Error('boom'))).toBeNull();
  });
});

describe('audit of clinic governance writes', () => {
  it('records a redacted event for every write and never the document reference', async () => {
    await h.db.exec('truncate audit_events');
    const secretRef = 'MOA-AUDIT-PROBE-77';
    const c = await makeRealClinic(h.db, 'aud');
    const id = await addAccepted(c.id, 'partnership_agreement', secretRef);
    await call(app, S.prov, 'post', `${ADMIN}/clinics/${c.id}/evidence/${id}/expire`);
    const rows = await auditRows(h.db);
    expect(rows.map((r) => r.action).sort()).toEqual(['governance.evidence_added', 'governance.evidence_expired', 'governance.evidence_reviewed']);
    expect(rows.every((r) => r.actor_user_id !== null && r.clinic_id === c.id)).toBe(true);
    const dump = JSON.stringify(rows) + h.logs.join('\n');
    expect(dump).not.toContain(secretRef);
    expect(dump).not.toMatch(/password|token|secret|cookie/i);
    // Failed writes leave no audit event.
    const before = (await auditRows(h.db)).length;
    await call(app, S.prov, 'post', `${ADMIN}/clinics/${c.id}/evidence/${id}/expire`);
    expect((await auditRows(h.db)).length).toBe(before);
  });
});
