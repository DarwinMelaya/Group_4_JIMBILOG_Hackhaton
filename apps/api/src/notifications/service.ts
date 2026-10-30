import type { PGlite } from '@electric-sql/pglite';
import { REMINDER_MAX_ATTEMPTS, type BookingStatus, type DevOutboxItem, type Locale, type ReminderChannel } from '@kalinga/shared';
import { newDemoDestinationToken, type NotificationTransport } from './mock-transport.js';
import { renderNeutralReminder } from './render.js';

type Queryable = Pick<PGlite, 'query'>;

/** A reminder becomes due this long before the visit (never earlier than the moment it is queued). */
export const REMINDER_LEAD_MS = 24 * 3_600_000;
/** First retry waits this long; each further retry doubles it (60 s, 120 s). */
export const REMINDER_BACKOFF_BASE_MS = 60_000;

export function reminderIdempotencyKey(bookingId: string, channel: ReminderChannel, visitStartsAt: Date): string {
  return `visit_reminder:${bookingId}:${channel}:${visitStartsAt.toISOString()}`;
}

export function backoffMs(attemptsSoFar: number): number {
  return REMINDER_BACKOFF_BASE_MS * 2 ** Math.max(0, attemptsSoFar - 1);
}

/**
 * Queue the neutral reminder for a CONFIRMED request, but only when the requester opted in. Idempotent: the key is
 * deterministic, so calling it twice queues one item; a previously suppressed item (opt-out then opt-in) is re-queued.
 * Returns how many items were newly queued.
 */
export async function enqueueForConfirmedRequest(tx: Queryable, bookingId: string, now: Date): Promise<number> {
  const r = await tx.query<{ status: BookingStatus; visit_starts_at: string | null; channel: ReminderChannel; locale: Locale }>(
    `select b.status, b.visit_starts_at::text as visit_starts_at, p.channel, p.locale
     from booking_requests b join reminder_preferences p on p.booking_request_id = b.id
     where b.id = $1 and p.opted_in`,
    [bookingId],
  );
  const row = r.rows[0];
  if (!row || row.status !== 'confirmed' || !row.visit_starts_at) return 0;
  const visit = new Date(row.visit_starts_at);
  if (visit.getTime() <= now.getTime()) return 0;
  const scheduled = new Date(Math.max(now.getTime(), visit.getTime() - REMINDER_LEAD_MS));
  const q = await tx.query<{ id: string }>(
    `insert into reminder_outbox (booking_request_id, channel, locale, scheduled_for, idempotency_key, rendered_text, expires_at)
     values ($1, $2::reminder_channel, $3, $4::timestamptz, $5, $6, $7::timestamptz)
     on conflict (idempotency_key) do update
       set status = 'queued', attempts = 0, next_attempt_at = null, last_error_code = null, locale = excluded.locale,
           rendered_text = excluded.rendered_text, scheduled_for = excluded.scheduled_for, updated_at = $8::timestamptz
       where reminder_outbox.status = 'suppressed'
     returning id`,
    [bookingId, row.channel, row.locale, scheduled.toISOString(), reminderIdempotencyKey(bookingId, row.channel, visit), renderNeutralReminder(row.locale), visit.toISOString(), now.toISOString()],
  );
  // S9-3: re-saving a preference on a row that is still waiting refreshes its locale and neutral text in place (no reset of
  // attempts or schedule), so a language change takes effect before the send.
  await tx.query(
    `update reminder_outbox set locale = $2, rendered_text = $3, updated_at = $4::timestamptz
     where idempotency_key = $1 and status = 'queued' and (locale <> $2 or rendered_text <> $3)`,
    [reminderIdempotencyKey(bookingId, row.channel, visit), row.locale, renderNeutralReminder(row.locale), now.toISOString()],
  );
  return q.rows.length;
}

/** Cancel everything still waiting for this request. Returns how many were suppressed. */
export async function suppressQueued(tx: Queryable, bookingId: string, now: Date, code = 'opted_out'): Promise<number> {
  const r = await tx.query<{ id: string }>(
    `update reminder_outbox set status = 'suppressed', last_error_code = $3, next_attempt_at = null, updated_at = $2::timestamptz
     where booking_request_id = $1 and status = 'queued' returning id`,
    [bookingId, now.toISOString(), code],
  );
  return r.rows.length;
}

/** Idempotent opt-in/opt-out. Opting in never stores a real contact detail; the destination is an opaque DEMO token. */
export async function setReminderPreference(
  tx: Queryable,
  bookingId: string,
  input: { optIn: boolean; channel?: ReminderChannel | undefined; locale?: Locale | undefined },
  now: Date,
): Promise<{ optedIn: boolean; channel: ReminderChannel | null; queued: number; suppressed: number }> {
  const at = now.toISOString();
  if (!input.optIn) {
    await tx.query(
      `insert into reminder_preferences (booking_request_id, opted_in, updated_at, disabled_at)
       values ($1, false, $2::timestamptz, $2::timestamptz)
       on conflict (booking_request_id) do update
         set opted_in = false, channel = null, destination_token = null, disabled_at = $2::timestamptz, updated_at = $2::timestamptz
         where reminder_preferences.opted_in`,
      [bookingId, at],
    );
    const suppressed = await suppressQueued(tx, bookingId, now);
    return { optedIn: false, channel: null, queued: 0, suppressed };
  }
  const channel = input.channel as ReminderChannel;
  const cur = await tx.query<{ opted_in: boolean; channel: ReminderChannel | null; destination_token: string | null }>(
    `select opted_in, channel, destination_token from reminder_preferences where booking_request_id = $1`,
    [bookingId],
  );
  const c = cur.rows[0];
  const keep = c?.opted_in === true && c.channel === channel && c.destination_token !== null;
  const token = keep && c?.destination_token ? c.destination_token : newDemoDestinationToken();
  await tx.query(
    `insert into reminder_preferences (booking_request_id, opted_in, channel, destination_token, locale, consented_at, disabled_at, updated_at)
     values ($1, true, $2::reminder_channel, $3, $4, $5::timestamptz, null, $5::timestamptz)
     on conflict (booking_request_id) do update
       set opted_in = true, channel = excluded.channel, destination_token = excluded.destination_token, locale = excluded.locale,
           consented_at = case when $6::boolean then reminder_preferences.consented_at else excluded.consented_at end,
           disabled_at = null, updated_at = excluded.updated_at`,
    [bookingId, channel, token, input.locale ?? 'en', at, keep],
  );
  // A channel change cancels what was queued for the old channel before queueing for the new one.
  if (c?.opted_in === true && c.channel !== channel) await suppressQueued(tx, bookingId, now, 'channel_changed');
  const queued = await enqueueForConfirmedRequest(tx, bookingId, now);
  return { optedIn: true, channel, queued, suppressed: 0 };
}

/**
 * Staff decision hook (called inside the decision transaction): confirmed -> queue for opted-in requests; anything else
 * -> nothing waiting should be sent for a visit that is no longer confirmed.
 */
export async function syncRemindersForDecision(tx: Queryable, bookingId: string, status: BookingStatus, now: Date): Promise<void> {
  if (status === 'confirmed') await enqueueForConfirmedRequest(tx, bookingId, now);
  else await suppressQueued(tx, bookingId, now, 'visit_not_confirmed');
}

export interface DispatchSummary {
  sent: number;
  retryScheduled: number;
  failed: number;
  suppressed: number;
  /** Items left queued untouched because the transport is disabled. */
  deferred: number;
}

interface DueRow {
  id: string;
  channel: ReminderChannel;
  rendered_text: string;
  attempts: number;
  expires_at: string;
  opted_in: boolean | null;
  destination_token: string | null;
}

/**
 * Deliver due items through the transport. Safe to run repeatedly. S9-3: each item is claimed (row locked, state re-read)
 * and processed in its OWN transaction, so a throw while sending one item can never roll back or re-send items that were
 * already committed earlier in the run; a throwing item is treated as a retryable failure (code transport_error). A retryable
 * failure schedules the next attempt with backoff; after REMINDER_MAX_ATTEMPTS, or on a non-retryable failure, the item
 * becomes 'failed'. The mock transport's status guard still prevents a double 'sent'.
 */
export async function dispatchDueReminders(db: PGlite, now: Date, transport: NotificationTransport): Promise<DispatchSummary> {
  const out: DispatchSummary = { sent: 0, retryScheduled: 0, failed: 0, suppressed: 0, deferred: 0 };
  const at = now.toISOString();
  const due = await db.query<{ id: string }>(
    `select o.id from reminder_outbox o
     where o.status = 'queued' and o.scheduled_for <= $1::timestamptz and (o.next_attempt_at is null or o.next_attempt_at <= $1::timestamptz)
     order by o.scheduled_for, o.id`,
    [at],
  );
  for (const { id } of due.rows) {
    const fail = async (q: Pick<PGlite, 'query'>, attempts: number, code: string, retryable: boolean): Promise<void> => {
      if (retryable && attempts < REMINDER_MAX_ATTEMPTS) {
        await q.query(
          `update reminder_outbox set attempts = $2, last_error_code = $3, next_attempt_at = $4::timestamptz, updated_at = $5::timestamptz where id = $1`,
          [id, attempts, code, new Date(now.getTime() + backoffMs(attempts)).toISOString(), at],
        );
        out.retryScheduled += 1;
      } else {
        await q.query(
          `update reminder_outbox set status = 'failed', attempts = $2, last_error_code = $3, next_attempt_at = null, updated_at = $4::timestamptz where id = $1`,
          [id, attempts, code, at],
        );
        out.failed += 1;
      }
    };
    let attemptsBefore = 0;
    try {
      await db.transaction(async (tx) => {
        const claimed = await tx.query<DueRow>(
          `select o.id, o.channel, o.rendered_text, o.attempts, o.expires_at::text as expires_at, p.opted_in, p.destination_token
           from reminder_outbox o left join reminder_preferences p on p.booking_request_id = o.booking_request_id
           where o.id = $1 and o.status = 'queued' and o.scheduled_for <= $2::timestamptz and (o.next_attempt_at is null or o.next_attempt_at <= $2::timestamptz)
           for update of o`,
          [id, at],
        );
        const r = claimed.rows[0];
        if (!r) return; // already handled by a concurrent run
        attemptsBefore = r.attempts;
        const expired = new Date(r.expires_at).getTime() <= now.getTime();
        if (expired || !r.opted_in || !r.destination_token) {
          // Label by the actual reason: the visit time passed, the requester opted out, or no destination token remains.
          const code = expired ? 'expired' : !r.opted_in ? 'opted_out' : 'no_destination';
          await tx.query(`update reminder_outbox set status = 'suppressed', last_error_code = $2, updated_at = $3::timestamptz where id = $1`, [id, code, at]);
          out.suppressed += 1;
          return;
        }
        if (!transport.enabled) {
          out.deferred += 1;
          return;
        }
        const res = await transport.send({ id: r.id, channel: r.channel, destinationToken: r.destination_token, text: r.rendered_text }, { exec: tx, now });
        const attempts = r.attempts + 1;
        if (res.ok) {
          await tx.query(`update reminder_outbox set attempts = $2 where id = $1`, [id, attempts]);
          out.sent += 1;
        } else {
          await fail(tx, attempts, res.code, res.retryable);
        }
      });
    } catch {
      // The item's own transaction rolled back (nothing half-written); earlier items stay committed. Record a retryable failure.
      await fail(db, attemptsBefore + 1, 'transport_error', true);
    }
  }
  return out;
}

export async function listOutbox(db: Queryable, limit = 100): Promise<DevOutboxItem[]> {
  const r = await db.query<{
    id: string;
    kind: 'visit_reminder';
    channel: ReminderChannel;
    status: DevOutboxItem['status'];
    scheduled_for: string;
    attempts: number;
    next_attempt_at: string | null;
    last_error_code: string | null;
    sent_at: string | null;
    locale: Locale;
    rendered_text: string;
    destination_token: string | null;
  }>(
    `select o.id, o.kind, o.channel, o.status, o.scheduled_for::text as scheduled_for, o.attempts, o.next_attempt_at::text as next_attempt_at,
            o.last_error_code, o.sent_at::text as sent_at, o.locale, o.rendered_text, p.destination_token
     from reminder_outbox o left join reminder_preferences p on p.booking_request_id = o.booking_request_id
     order by o.created_at desc, o.id limit $1`,
    [limit],
  );
  const iso = (v: string | null): string | null => (v === null ? null : new Date(v).toISOString());
  return r.rows.map((o) => ({
    id: o.id,
    kind: o.kind,
    channel: o.channel,
    status: o.status,
    scheduledFor: new Date(o.scheduled_for).toISOString(),
    attempts: o.attempts,
    nextAttemptAt: iso(o.next_attempt_at),
    lastErrorCode: o.last_error_code,
    sentAt: iso(o.sent_at),
    locale: o.locale,
    renderedText: o.rendered_text,
    demoDestination: o.destination_token ?? 'demo:cleared',
  }));
}
