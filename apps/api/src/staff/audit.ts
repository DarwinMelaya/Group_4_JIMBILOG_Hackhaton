import type { PGlite } from '@electric-sql/pglite';

type Queryable = Pick<PGlite, 'query'>;

export type AuditAction =
  | 'staff.login_succeeded'
  | 'staff.login_failed'
  | 'staff.logout'
  | 'booking_request.status_changed'
  | 'booking_request.access_denied'
  | 'booking_request.expired';

export type AuditTarget = 'booking_request' | 'staff_session' | 'staff_user';

/**
 * Metadata allow-list. Only these keys, and only booleans, short tokens of [a-z0-9_.-] or small integers are kept: ids,
 * statuses, versions and flags. Free text, e-mail addresses, references, secrets and contact details cannot get through
 * even by mistake, and the audit_events CHECK constraint is a second guard.
 */
const ALLOWED_KEYS = new Set(['from_status', 'to_status', 'version_before', 'version_after', 'visit_time_set', 'text_added', 'outcome', 'count']);
const SAFE_TOKEN = /^[a-z0-9_.-]{1,40}$/;

export type AuditMetadata = Partial<Record<'from_status' | 'to_status' | 'outcome', string>> &
  Partial<Record<'version_before' | 'version_after' | 'count', number>> &
  Partial<Record<'visit_time_set' | 'text_added', boolean>>;

export function redactAuditMetadata(input: AuditMetadata): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(input)) {
    if (!ALLOWED_KEYS.has(k)) continue;
    if (typeof v === 'boolean') out[k] = v;
    else if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 1_000_000) out[k] = v;
    else if (typeof v === 'string' && SAFE_TOKEN.test(v)) out[k] = v;
  }
  return out;
}

export interface AuditEvent {
  actorUserId: string | null;
  actorKind: 'staff' | 'system' | 'anonymous';
  action: AuditAction;
  targetType: AuditTarget;
  targetId?: string | null;
  clinicId?: string | null;
  metadata?: AuditMetadata;
  at: Date;
}

export async function recordAudit(q: Queryable, e: AuditEvent): Promise<void> {
  await q.query(
    `insert into audit_events (created_at, actor_user_id, actor_kind, action, target_type, target_id, clinic_id, metadata)
     values ($1::timestamptz, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
    [
      e.at.toISOString(),
      e.actorUserId,
      e.actorKind,
      e.action,
      e.targetType,
      e.targetId ?? null,
      e.clinicId ?? null,
      JSON.stringify(redactAuditMetadata(e.metadata ?? {})),
    ],
  );
}
