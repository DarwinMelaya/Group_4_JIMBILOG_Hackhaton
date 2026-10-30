import type { PGlite } from '@electric-sql/pglite';
import { MinorBookingReadinessSchema, MinorSopMappingSchema, type MinorBookingReadiness, type MinorSopMapping, type MinorSopMappingCreate } from '@kalinga/shared';
import type { AppEnv } from '../env.js';
import { AppError } from '../http/errors.js';
import { recordGovernanceAudit } from './audit.js';
import { findClinic, guarded, iso, notFound } from './common.js';

interface MappingRow {
  id: string;
  clinic_id: string;
  sop_artifact_reference: string;
  sop_version: string;
  approved_by: string;
  approved_at: string;
  effective_from: string;
  status: 'recorded' | 'revoked';
  created_at: Date | string;
}

const COLUMNS = `id, clinic_id, sop_artifact_reference, sop_version, approved_by, approved_at::text as approved_at,
  effective_from::text as effective_from, status, created_at`;

function toMapping(r: MappingRow): MinorSopMapping {
  return MinorSopMappingSchema.parse({
    id: r.id,
    clinicId: r.clinic_id,
    sopArtifactReference: r.sop_artifact_reference,
    sopVersion: r.sop_version,
    approvedBy: r.approved_by,
    approvedAt: r.approved_at,
    effectiveFrom: r.effective_from,
    status: r.status,
    createdAt: iso(r.created_at),
  });
}

export async function listMappings(db: PGlite, clinicRef: string): Promise<MinorSopMapping[]> {
  const clinic = await findClinic(db, clinicRef);
  if (!clinic) throw notFound();
  const r = await db.query<MappingRow>(`select ${COLUMNS} from minor_sop_mappings where clinic_id = $1 order by created_at desc, id limit 100`, [clinic.id]);
  return r.rows.map(toMapping);
}

/**
 * Records that an approved SOP artifact is mapped to a clinic. This is a RECORD ONLY: nothing in the booking policy reads
 * this table, so recording (or revoking) a mapping never changes whether real 15-17 requests are accepted.
 */
export async function recordMapping(db: PGlite, clinicRef: string, actorId: string, input: MinorSopMappingCreate, now: Date): Promise<MinorSopMapping> {
  return guarded(() =>
    db.transaction(async (tx) => {
      const clinic = await findClinic(tx, clinicRef, true);
      if (!clinic) throw notFound();
      if (clinic.is_demo) throw new AppError(409, 'demo_clinic_locked', 'DEMO clinics can never be mapped to a real minor SOP.');
      const r = await tx.query<MappingRow>(
        `insert into minor_sop_mappings (clinic_id, sop_artifact_reference, sop_version, approved_by, approved_at, effective_from, recorded_by, created_at)
         values ($1, $2, $3, $4, $5::date, $6::date, $7, $8::timestamptz) returning ${COLUMNS}`,
        [clinic.id, input.sopArtifactReference, input.sopVersion, input.approvedBy, input.approvedAt, input.effectiveFrom, actorId, now.toISOString()],
      );
      const row = r.rows[0];
      if (!row) throw new Error('mapping insert returned no row');
      await recordGovernanceAudit(tx, {
        actorUserId: actorId,
        action: 'governance.minor_sop_recorded',
        targetType: 'minor_sop_mapping',
        targetId: row.id,
        clinicId: clinic.id,
        metadata: { outcome: 'recorded', to_status: 'recorded' },
        at: now,
      });
      return toMapping(row);
    }),
  );
}

export async function revokeMapping(db: PGlite, clinicRef: string, mappingId: string, actorId: string, now: Date): Promise<MinorSopMapping> {
  return db.transaction(async (tx) => {
    const clinic = await findClinic(tx, clinicRef, true);
    if (!clinic) throw notFound();
    const cur = await tx.query<MappingRow>(`select ${COLUMNS} from minor_sop_mappings where id = $1 and clinic_id = $2 for update`, [mappingId, clinic.id]);
    const row = cur.rows[0];
    if (!row) throw notFound();
    if (row.status !== 'recorded') throw new AppError(409, 'mapping_not_active', 'This mapping is already revoked.');
    const r = await tx.query<MappingRow>(`update minor_sop_mappings set status = 'revoked' where id = $1 returning ${COLUMNS}`, [mappingId]);
    await recordGovernanceAudit(tx, {
      actorUserId: actorId,
      action: 'governance.minor_sop_revoked',
      targetType: 'minor_sop_mapping',
      targetId: mappingId,
      clinicId: clinic.id,
      metadata: { from_status: 'recorded', to_status: 'revoked' },
      at: now,
    });
    return toMapping(r.rows[0] ?? row);
  });
}

/**
 * Honest readiness report. `realMinorBookingActive` is literal false: the booking policy fails closed behind
 * REAL_MINOR_BOOKING_ENABLED (which env.ts refuses) and is not wired to these mappings. If the env flag were ever true the
 * response schema would reject it, so this endpoint can never report a false "ready".
 */
export async function minorReadiness(db: PGlite, env: Pick<AppEnv, 'REAL_MINOR_BOOKING_ENABLED'>, clinicId?: string): Promise<MinorBookingReadiness> {
  const r = await db.query<{ n: number }>(
    `select count(*)::int as n from minor_sop_mappings where status = 'recorded' and ($1::uuid is null or clinic_id = $1::uuid)`,
    [clinicId ?? null],
  );
  const count = r.rows[0]?.n ?? 0;
  return MinorBookingReadinessSchema.parse({
    mappingPresent: count > 0,
    mappingCount: count,
    envEnabled: env.REAL_MINOR_BOOKING_ENABLED,
    realMinorBookingActive: false,
    blockedBy: ['real_minor_booking_flag_disabled', 'booking_policy_not_wired_to_mappings'],
  });
}
