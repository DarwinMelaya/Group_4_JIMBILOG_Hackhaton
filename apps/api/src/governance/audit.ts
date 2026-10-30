import type { Queryable } from './common.js';

export type GovernanceAuditAction =
  | 'governance.evidence_added'
  | 'governance.evidence_reviewed'
  | 'governance.evidence_expired'
  | 'governance.clinic_verification_changed'
  | 'governance.clinic_status_changed'
  | 'governance.article_review_changed'
  | 'governance.staff_invite_created'
  | 'governance.staff_invite_redeemed'
  | 'governance.staff_invite_revoked'
  | 'governance.staff_membership_set'
  | 'governance.staff_membership_removed'
  | 'governance.staff_user_deactivated'
  | 'governance.minor_sop_recorded'
  | 'governance.minor_sop_revoked'
  | 'governance.report_exported';

export type GovernanceAuditTarget =
  | 'clinic'
  | 'clinic_evidence'
  | 'article_localization'
  | 'staff_invite'
  | 'staff_membership'
  | 'staff_user'
  | 'minor_sop_mapping'
  | 'report';

/**
 * Same redaction model as the staff audit: a small allow-list of keys, and only short [a-z0-9_.-] tokens or small
 * integers survive. Invite codes, e-mail addresses, reviewer names, document references and free text have no key here,
 * so they cannot be recorded even by mistake. (The audit_events CHECK constraint is a second guard.)
 */
const ALLOWED_KEYS = new Set([
  'from_status',
  'to_status',
  'version_before',
  'version_after',
  'outcome',
  'count',
  'locale',
  'evidence_type',
  'role',
  'decision',
]);
const SAFE_TOKEN = /^[a-z0-9_.-]{1,40}$/;

export type GovernanceMetadata = Partial<Record<'from_status' | 'to_status' | 'outcome' | 'locale' | 'evidence_type' | 'role' | 'decision', string>> &
  Partial<Record<'version_before' | 'version_after' | 'count', number>>;

export function redactGovernanceMetadata(input: GovernanceMetadata): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(input)) {
    if (!ALLOWED_KEYS.has(k)) continue;
    if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 1_000_000) out[k] = v;
    else if (typeof v === 'string' && SAFE_TOKEN.test(v)) out[k] = v;
  }
  return out;
}

export interface GovernanceAuditEvent {
  actorUserId: string;
  action: GovernanceAuditAction;
  targetType: GovernanceAuditTarget;
  targetId: string | null;
  clinicId?: string | null;
  metadata?: GovernanceMetadata;
  at: Date;
}

/** Call inside the same transaction as the write so the change and its audit event commit (or roll back) together. */
export async function recordGovernanceAudit(q: Queryable, e: GovernanceAuditEvent): Promise<void> {
  await q.query(
    `insert into audit_events (created_at, actor_user_id, actor_kind, action, target_type, target_id, clinic_id, metadata)
     values ($1::timestamptz, $2, 'staff', $3, $4, $5, $6, $7::jsonb)`,
    [e.at.toISOString(), e.actorUserId, e.action, e.targetType, e.targetId, e.clinicId ?? null, JSON.stringify(redactGovernanceMetadata(e.metadata ?? {}))],
  );
}
