import type { PGlite } from '@electric-sql/pglite';
import {
  AdminClinicSchema,
  EvidenceSchema,
  PUBLISH_REQUIRED_EVIDENCE,
  type AdminClinic,
  type ClinicPublishUpdate,
  type ClinicVerificationUpdate,
  type Evidence,
  type EvidenceCreate,
  type EvidenceReview,
} from '@kalinga/shared';
import { AppError } from '../http/errors.js';
import { recordGovernanceAudit, redactGovernanceMetadata } from './audit.js';
import { findClinic, guarded, iso, notFound, versionConflict, type ClinicRow, type Queryable } from './common.js';

const FIVE_YEARS_MS = 5 * 365 * 86_400_000;

const demoLocked = (): AppError => new AppError(409, 'demo_clinic_locked', 'DEMO clinics can never be verified, evidenced or treated as real.');

interface EvidenceRow {
  id: string;
  clinic_id: string;
  evidence_type: Evidence['evidenceType'];
  evidence_reference: string;
  status: Evidence['status'];
  verified_by: string | null;
  verified_at: Date | string | null;
  expires_at: Date | string;
  created_at: Date | string;
}

const EVIDENCE_COLUMNS = 'id, clinic_id, evidence_type, evidence_reference, status, verified_by, verified_at, expires_at, created_at';

function toEvidence(r: EvidenceRow): Evidence {
  return EvidenceSchema.parse({
    id: r.id,
    clinicId: r.clinic_id,
    evidenceType: r.evidence_type,
    evidenceReference: r.evidence_reference,
    status: r.status,
    verifiedBy: r.verified_by,
    verifiedAt: iso(r.verified_at),
    expiresAt: iso(r.expires_at),
    createdAt: iso(r.created_at),
  });
}

/** Accepted and not yet expired. `types` narrows to specific evidence types. */
async function countValidEvidence(q: Queryable, clinicId: string, now: Date, types?: readonly string[]): Promise<number> {
  const r = await q.query<{ n: number }>(
    `select count(*)::int as n from clinic_verification_evidence
     where clinic_id = $1 and status = 'accepted' and expires_at > $2::timestamptz and ($3::text[] is null or evidence_type = any($3::text[]))`,
    [clinicId, now.toISOString(), types ? [...types] : null],
  );
  return r.rows[0]?.n ?? 0;
}

export async function listAdminClinics(db: PGlite, now: Date): Promise<AdminClinic[]> {
  const r = await db.query<ClinicRow & { valid_evidence: number; publish_evidence: number }>(
    `select c.id, c.slug, c.name, c.is_demo, c.municipality, c.status, c.verification_level, c.verification_source,
            c.address_verification, c.contact_verification, c.last_verified_at, c.version,
            (select count(*)::int from clinic_verification_evidence e
               where e.clinic_id = c.id and e.status = 'accepted' and e.expires_at > $1::timestamptz) as valid_evidence,
            (select count(*)::int from clinic_verification_evidence e
               where e.clinic_id = c.id and e.status = 'accepted' and e.expires_at > $1::timestamptz and e.evidence_type = $2) as publish_evidence
     from clinics c order by c.name, c.slug limit 200`,
    [now.toISOString(), PUBLISH_REQUIRED_EVIDENCE],
  );
  return r.rows.map((c) =>
    AdminClinicSchema.parse({
      id: c.id,
      slug: c.slug,
      name: c.name,
      isDemo: c.is_demo,
      municipality: c.municipality,
      status: c.status,
      verificationLevel: c.verification_level,
      verificationSource: c.verification_source,
      addressVerification: c.address_verification,
      contactVerification: c.contact_verification,
      lastVerifiedAt: iso(c.last_verified_at),
      version: c.version,
      validEvidenceCount: c.valid_evidence,
      hasPublishEvidence: c.publish_evidence > 0,
    }),
  );
}

export async function listEvidence(db: PGlite, clinicRef: string): Promise<Evidence[]> {
  const clinic = await findClinic(db, clinicRef);
  if (!clinic) throw notFound();
  const r = await db.query<EvidenceRow>(
    `select ${EVIDENCE_COLUMNS} from clinic_verification_evidence where clinic_id = $1 order by created_at desc, id limit 200`,
    [clinic.id],
  );
  return r.rows.map(toEvidence);
}

export async function addEvidence(db: PGlite, clinicRef: string, actorId: string, input: EvidenceCreate, now: Date): Promise<Evidence> {
  return guarded(() =>
    db.transaction(async (tx) => {
      const clinic = await findClinic(tx, clinicRef, true);
      if (!clinic) throw notFound();
      if (clinic.is_demo) throw demoLocked();
      const expiresAt = new Date(input.expiresAt);
      if (expiresAt.getTime() <= now.getTime() || expiresAt.getTime() > now.getTime() + FIVE_YEARS_MS) {
        throw new AppError(422, 'evidence_expiry_invalid', 'The expiry must be in the future and within five years.');
      }
      const r = await tx.query<EvidenceRow>(
        `insert into clinic_verification_evidence (clinic_id, evidence_type, evidence_reference, recorded_by, expires_at, created_at, updated_at)
         values ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz, $6::timestamptz) returning ${EVIDENCE_COLUMNS}`,
        [clinic.id, input.evidenceType, input.evidenceReference, actorId, expiresAt.toISOString(), now.toISOString()],
      );
      const row = r.rows[0];
      if (!row) throw new Error('evidence insert returned no row');
      await recordGovernanceAudit(tx, {
        actorUserId: actorId,
        action: 'governance.evidence_added',
        targetType: 'clinic_evidence',
        targetId: row.id,
        clinicId: clinic.id,
        metadata: { evidence_type: input.evidenceType, to_status: 'pending' },
        at: now,
      });
      return toEvidence(row);
    }),
  );
}

async function loadEvidence(tx: Queryable, clinicId: string, evidenceId: string): Promise<EvidenceRow> {
  const r = await tx.query<EvidenceRow>(
    `select ${EVIDENCE_COLUMNS} from clinic_verification_evidence where id = $1 and clinic_id = $2 for update`,
    [evidenceId, clinicId],
  );
  const row = r.rows[0];
  if (!row) throw notFound();
  return row;
}

export async function reviewEvidence(
  db: PGlite,
  clinicRef: string,
  evidenceId: string,
  actorId: string,
  input: EvidenceReview,
  now: Date,
): Promise<Evidence> {
  return guarded(() =>
    db.transaction(async (tx) => {
      const clinic = await findClinic(tx, clinicRef, true);
      if (!clinic) throw notFound();
      if (clinic.is_demo) throw demoLocked();
      const cur = await loadEvidence(tx, clinic.id, evidenceId);
      if (cur.status !== 'pending') throw new AppError(409, 'evidence_not_pending', 'Only pending evidence can be reviewed.');
      if (new Date(cur.expires_at).getTime() <= now.getTime()) {
        throw new AppError(409, 'evidence_expired', 'This evidence has already expired.');
      }
      const accept = input.decision === 'accept';
      const r = await tx.query<EvidenceRow>(
        `update clinic_verification_evidence
         set status = $2, verified_by = $3, verified_at = $4::timestamptz, updated_at = $5::timestamptz
         where id = $1 returning ${EVIDENCE_COLUMNS}`,
        [evidenceId, accept ? 'accepted' : 'rejected', accept ? actorId : null, accept ? now.toISOString() : null, now.toISOString()],
      );
      const row = r.rows[0];
      if (!row) throw notFound();
      await recordGovernanceAudit(tx, {
        actorUserId: actorId,
        action: 'governance.evidence_reviewed',
        targetType: 'clinic_evidence',
        targetId: evidenceId,
        clinicId: clinic.id,
        metadata: { evidence_type: row.evidence_type, decision: input.decision, from_status: 'pending', to_status: row.status },
        at: now,
      });
      return toEvidence(row);
    }),
  );
}

/**
 * Expires pending or accepted evidence. If that removes the last valid publish evidence of a PUBLISHED real clinic, the
 * clinic goes back to `in_review` in the same transaction: a lapsed claim returns to pending verification.
 */
export async function expireEvidence(db: PGlite, clinicRef: string, evidenceId: string, actorId: string, now: Date): Promise<Evidence> {
  return guarded(() =>
    db.transaction(async (tx) => {
      const clinic = await findClinic(tx, clinicRef, true);
      if (!clinic) throw notFound();
      if (clinic.is_demo) throw demoLocked();
      const cur = await loadEvidence(tx, clinic.id, evidenceId);
      if (cur.status !== 'pending' && cur.status !== 'accepted') {
        throw new AppError(409, 'evidence_not_expirable', 'Only pending or accepted evidence can be expired.');
      }
      const r = await tx.query<EvidenceRow>(
        `update clinic_verification_evidence set status = 'expired', updated_at = $2::timestamptz where id = $1 returning ${EVIDENCE_COLUMNS}`,
        [evidenceId, now.toISOString()],
      );
      const row = r.rows[0];
      if (!row) throw notFound();
      await recordGovernanceAudit(tx, {
        actorUserId: actorId,
        action: 'governance.evidence_expired',
        targetType: 'clinic_evidence',
        targetId: evidenceId,
        clinicId: clinic.id,
        metadata: { evidence_type: row.evidence_type, from_status: cur.status, to_status: 'expired' },
        at: now,
      });
      if (clinic.status === 'published' && (await countValidEvidence(tx, clinic.id, now, [PUBLISH_REQUIRED_EVIDENCE])) === 0) {
        await tx.query(`update clinics set status = 'in_review', version = version + 1, updated_at = $2::timestamptz where id = $1`, [clinic.id, now.toISOString()]);
        await recordGovernanceAudit(tx, {
          actorUserId: actorId,
          action: 'governance.clinic_status_changed',
          targetType: 'clinic',
          targetId: clinic.id,
          clinicId: clinic.id,
          metadata: { from_status: 'published', to_status: 'in_review', outcome: 'evidence_lapsed' },
          at: now,
        });
      }
      return toEvidence(row);
    }),
  );
}

/**
 * S9-3 background job: a PUBLISHED real (non-demo) clinic with no accepted, unexpired partnership evidence is demoted to
 * `in_review` (the same outcome as expiring the last evidence by hand). DEMO clinics are never touched. One redacted system
 * audit event per demotion, in the same transaction as the change. Idempotent; returns how many clinics were demoted.
 */
export async function demoteLapsedClinics(db: PGlite, now: Date): Promise<number> {
  return db.transaction(async (tx) => {
    const at = now.toISOString();
    const lapsed = await tx.query<{ id: string; version: number }>(
      `select c.id, c.version from clinics c
       where c.status = 'published' and not c.is_demo
         and not exists (select 1 from clinic_verification_evidence e where e.clinic_id = c.id and e.status = 'accepted'
                         and e.evidence_type = $1 and e.expires_at > $2::timestamptz)
       order by c.id for update of c`,
      [PUBLISH_REQUIRED_EVIDENCE, at],
    );
    for (const c of lapsed.rows) {
      await tx.query(`update clinics set status = 'in_review', version = version + 1, updated_at = $2::timestamptz where id = $1`, [c.id, at]);
      await tx.query(
        `insert into audit_events (created_at, actor_user_id, actor_kind, action, target_type, target_id, clinic_id, metadata)
         values ($1::timestamptz, null, 'system', 'governance.clinic_status_changed', 'clinic', $2, $2, $3::jsonb)`,
        [
          at,
          c.id,
          JSON.stringify(
            redactGovernanceMetadata({ from_status: 'published', to_status: 'in_review', outcome: 'evidence_lapsed', version_before: c.version, version_after: c.version + 1 }),
          ),
        ],
      );
    }
    return lapsed.rows.length;
  });
}

const levelToStatus = (level: string): 'verified' | 'unverified' => (level === 'unverified' ? 'unverified' : 'verified');

export async function updateVerification(
  db: PGlite,
  clinicRef: string,
  actorId: string,
  input: ClinicVerificationUpdate,
  now: Date,
): Promise<AdminClinic> {
  return guarded(async () => {
    const clinicId = await db.transaction(async (tx) => {
      const clinic = await findClinic(tx, clinicRef, true);
      if (!clinic) throw notFound();
      // DEMO clinics are locked completely: they can never be verified or treated as real, and nothing here may touch them.
      if (clinic.is_demo) throw demoLocked();
      if (clinic.version !== input.expectedVersion) throw versionConflict();

      const raisesLevel = input.verificationLevel !== undefined && input.verificationLevel !== 'unverified';
      const raisesField = input.addressVerification === 'verified' || input.contactVerification === 'verified';
      if (raisesLevel && (await countValidEvidence(tx, clinic.id, now, [PUBLISH_REQUIRED_EVIDENCE])) === 0) {
        throw new AppError(422, 'evidence_required', 'An accepted, unexpired partnership agreement evidence record is required.');
      }
      if (raisesField && (await countValidEvidence(tx, clinic.id, now)) === 0) {
        throw new AppError(422, 'evidence_required', 'Accepted, unexpired evidence is required before marking a fact verified.');
      }

      const level = input.verificationLevel ?? clinic.verification_level;
      const lowering = input.verificationLevel === 'unverified' && clinic.verification_level !== 'unverified';
      // A lowered level on a published clinic would break the publish guard: it returns to review instead.
      const status = lowering && clinic.status === 'published' ? 'in_review' : clinic.status;
      const levelChanged = input.verificationLevel !== undefined && input.verificationLevel !== clinic.verification_level;
      const source = levelChanged ? (input.verificationSource ?? (lowering ? 'admin_downgrade' : null)) : clinic.verification_source;
      const verifiedAt = levelChanged && raisesLevel ? now.toISOString() : iso(clinic.last_verified_at);

      // S9-3: each history row records the REAL source: the one supplied, else the resolved clinic source, and 'admin_downgrade'
      // only for an actual lowering of the level (never as a default for unrelated field changes).
      const recordSource = input.verificationSource ?? source ?? clinic.verification_source ?? (lowering ? 'admin_downgrade' : 'admin_update');
      const changes: { scope: 'listing' | 'contact'; status: 'verified' | 'unknown' | 'unverified' }[] = [];
      if (input.addressVerification !== undefined && input.addressVerification !== clinic.address_verification) {
        changes.push({ scope: 'listing', status: input.addressVerification });
      }
      if (input.contactVerification !== undefined && input.contactVerification !== clinic.contact_verification) {
        changes.push({ scope: 'contact', status: input.contactVerification });
      }
      if (levelChanged) changes.push({ scope: 'listing', status: levelToStatus(level) });

      await tx.query(
        `update clinics set address_verification = $2, contact_verification = $3, verification_level = $4, verification_source = $5,
                last_verified_at = $6::timestamptz, status = $7, version = version + 1, updated_at = $8::timestamptz
         where id = $1`,
        [
          clinic.id,
          input.addressVerification ?? clinic.address_verification,
          input.contactVerification ?? clinic.contact_verification,
          level,
          source,
          verifiedAt,
          status,
          now.toISOString(),
        ],
      );
      for (const c of changes) {
        await tx.query(
          `insert into clinic_verification_records (clinic_id, scope, status, source, verified_at) values ($1, $2, $3, $4, $5::timestamptz)`,
          [clinic.id, c.scope, c.status, recordSource, now.toISOString()],
        );
      }
      await recordGovernanceAudit(tx, {
        actorUserId: actorId,
        action: 'governance.clinic_verification_changed',
        targetType: 'clinic',
        targetId: clinic.id,
        clinicId: clinic.id,
        metadata: { count: changes.length, to_status: level, version_before: clinic.version, version_after: clinic.version + 1 },
        at: now,
      });
      if (status !== clinic.status) {
        await recordGovernanceAudit(tx, {
          actorUserId: actorId,
          action: 'governance.clinic_status_changed',
          targetType: 'clinic',
          targetId: clinic.id,
          clinicId: clinic.id,
          metadata: { from_status: clinic.status, to_status: status, outcome: 'verification_lowered' },
          at: now,
        });
      }
      return clinic.id;
    });
    return getAdminClinic(db, clinicId, now);
  });
}

const STATUS_MOVES: Readonly<Record<ClinicRow['status'], readonly ClinicRow['status'][]>> = {
  draft: ['in_review'],
  in_review: ['draft', 'published', 'unpublished'],
  published: ['unpublished', 'in_review'],
  unpublished: ['in_review', 'published'],
};

export async function updateStatus(db: PGlite, clinicRef: string, actorId: string, input: ClinicPublishUpdate, now: Date): Promise<AdminClinic> {
  return guarded(async () => {
    const clinicId = await db.transaction(async (tx) => {
      const clinic = await findClinic(tx, clinicRef, true);
      if (!clinic) throw notFound();
      if (clinic.version !== input.expectedVersion) throw versionConflict();
      if (!STATUS_MOVES[clinic.status].includes(input.status)) {
        throw new AppError(409, 'invalid_transition', 'That status change is not allowed from the current status.');
      }
      if (input.status === 'published' && !clinic.is_demo) {
        const verified =
          (clinic.verification_level === 'provider_confirmed' || clinic.verification_level === 'verified_real') &&
          clinic.verification_source !== null &&
          clinic.last_verified_at !== null;
        if (!verified) {
          throw new AppError(422, 'publish_requires_verification', 'A real clinic needs a verification level, source and date before it can be published.');
        }
        if ((await countValidEvidence(tx, clinic.id, now, [PUBLISH_REQUIRED_EVIDENCE])) === 0) {
          throw new AppError(422, 'evidence_required', 'Publishing a real clinic requires accepted, unexpired partnership agreement evidence.');
        }
      }
      await tx.query(`update clinics set status = $2, version = version + 1, updated_at = $3::timestamptz where id = $1`, [clinic.id, input.status, now.toISOString()]);
      await recordGovernanceAudit(tx, {
        actorUserId: actorId,
        action: 'governance.clinic_status_changed',
        targetType: 'clinic',
        targetId: clinic.id,
        clinicId: clinic.id,
        metadata: { from_status: clinic.status, to_status: input.status, version_before: clinic.version, version_after: clinic.version + 1 },
        at: now,
      });
      return clinic.id;
    });
    return getAdminClinic(db, clinicId, now);
  });
}

export async function getAdminClinic(db: PGlite, clinicId: string, now: Date): Promise<AdminClinic> {
  const all = await listAdminClinics(db, now);
  const found = all.find((c) => c.id === clinicId);
  if (!found) throw notFound();
  return found;
}
