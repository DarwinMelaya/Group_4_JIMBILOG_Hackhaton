import type { PGlite } from '@electric-sql/pglite';
import { adminClinicIds, type Actor } from '../governance/staff-admin.js';
import { recordGovernanceAudit } from '../governance/audit.js';
import { csvRow, suppressGroup, SUPPRESSION_THRESHOLD, type Cell } from './suppress.js';

/** The booking statuses reported, in a fixed order. `awaiting` is the internal `pending` status (no clinic decision yet). */
export const REPORT_STATUS_KEYS = ['awaiting', 'confirmed', 'alternative', 'cancelled', 'expired'] as const;
export type ReportStatusKey = (typeof REPORT_STATUS_KEYS)[number];

const DB_STATUS: Record<string, ReportStatusKey> = {
  pending: 'awaiting',
  confirmed: 'confirmed',
  alternative_offered: 'alternative',
  cancelled: 'cancelled',
  expired: 'expired',
};

export interface ReportPeriod {
  /** Calendar month in Asia/Manila, YYYY-MM. */
  period: string;
  received: Cell;
  awaiting: Cell;
  confirmed: Cell;
  alternative: Cell;
  cancelled: Cell;
  expired: Cell;
}

export interface ReportSummary {
  generatedAt: string;
  scope: 'clinic' | 'all';
  suppressionThreshold: number;
  periods: ReportPeriod[];
  /** Present only when the `attendance_reporting_approved` switch is on. This prototype collects no attendance data. */
  attendance?: { status: 'not_collected' };
  caveats: string[];
}

const MANILA_OFFSET_MS = 8 * 3_600_000;

/** The last `months` calendar months (Asia/Manila, no DST), oldest first, ending with the month containing `now`. */
export function monthWindow(now: Date, months: number): string[] {
  const local = new Date(now.getTime() + MANILA_OFFSET_MS);
  const out: string[] = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

async function attendanceApproved(db: Pick<PGlite, 'query'>): Promise<boolean> {
  const r = await db.query<{ bool_value: boolean }>(`select bool_value from report_settings where key = 'attendance_reporting_approved'`);
  return r.rows[0]?.bool_value === true;
}

/**
 * Aggregates only: counts per calendar month per status. Never selects a reference, secret, age band, contact preference,
 * note or any per-record column. clinic_admin sees only the clinics they actively administer; provincial/technical see all.
 */
export async function buildSummary(db: PGlite, actor: Actor, months: number, now: Date): Promise<ReportSummary> {
  const scoped = actor.role === 'clinic_admin';
  const clinicIds = scoped ? await adminClinicIds(db, actor) : null;
  const window = monthWindow(now, months);
  const first = window[0] ?? '1970-01';
  // Start of the first month at 00:00 Asia/Manila, expressed in UTC.
  const startUtc = new Date(Date.parse(`${first}-01T00:00:00Z`) - MANILA_OFFSET_MS);
  const rows = await db.query<{ period: string; status: string; n: number }>(
    `select to_char((created_at at time zone 'UTC') + interval '8 hours', 'YYYY-MM') as period, status::text as status, count(*)::int as n
       from booking_requests
      where created_at >= $1::timestamptz and ($2::uuid[] is null or clinic_id = any($2::uuid[]))
      group by 1, 2`,
    [startUtc.toISOString(), clinicIds],
  );
  const counts = new Map<string, Record<ReportStatusKey, number>>();
  for (const p of window) counts.set(p, { awaiting: 0, confirmed: 0, alternative: 0, cancelled: 0, expired: 0 });
  for (const r of rows.rows) {
    const key = DB_STATUS[r.status];
    const bucket = counts.get(r.period);
    if (key && bucket) bucket[key] += r.n;
  }
  const periods: ReportPeriod[] = window.map((period) => {
    const c = counts.get(period) ?? { awaiting: 0, confirmed: 0, alternative: 0, cancelled: 0, expired: 0 };
    const total = REPORT_STATUS_KEYS.reduce((s, k) => s + c[k], 0);
    const g = suppressGroup(total, c);
    return { period, received: g.total, ...g.parts };
  });
  const summary: ReportSummary = {
    generatedAt: now.toISOString(),
    scope: scoped ? 'clinic' : 'all',
    suppressionThreshold: SUPPRESSION_THRESHOLD,
    periods,
    caveats: ['DEMO data only.', `Counts below ${SUPPRESSION_THRESHOLD} are shown as "<${SUPPRESSION_THRESHOLD}" to protect privacy.`],
  };
  if (await attendanceApproved(db)) summary.attendance = { status: 'not_collected' };
  return summary;
}

export function summaryToCsv(s: ReportSummary): string {
  const lines = [csvRow(['period', 'metric', 'count'])];
  for (const p of s.periods) {
    lines.push(csvRow([p.period, 'received', p.received]));
    for (const k of REPORT_STATUS_KEYS) lines.push(csvRow([p.period, k, p[k]]));
  }
  return `${lines.join('\r\n')}\r\n`;
}

export async function recordExportAudit(db: PGlite, actor: Actor, rows: number, now: Date): Promise<void> {
  await recordGovernanceAudit(db, {
    actorUserId: actor.id,
    action: 'governance.report_exported',
    targetType: 'report',
    targetId: null,
    metadata: { outcome: 'exported', role: actor.role, count: rows },
    at: now,
  });
}
