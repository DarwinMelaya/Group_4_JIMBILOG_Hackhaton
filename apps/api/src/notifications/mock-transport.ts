import { randomBytes } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import { REMINDER_CHANNELS, type ReminderChannel } from '@kalinga/shared';

type Queryable = Pick<PGlite, 'query'>;

/**
 * Notification transport for reminders. ONLY a deterministic DEMO mock exists in this prototype: nothing here opens a
 * socket, calls an HTTP API or talks to an SMS/e-mail provider (a test scans this directory for such imports), and the
 * environment validator refuses any other transport or REAL_NOTIFICATIONS_ENABLED=true.
 *
 * "sent" means "recorded by the mock transport", never "delivered to a person".
 */
export interface OutboxMessage {
  id: string;
  channel: ReminderChannel;
  /** Opaque DEMO placeholder ('demo:' + 16 hex characters). Never a real phone number or address. */
  destinationToken: string;
  text: string;
}

export interface TransportContext {
  /** The dispatcher's transaction. The mock transport records 'sent' through it, and nowhere else does. */
  exec: Queryable;
  now: Date;
}

export type SendResult = { ok: true } | { ok: false; code: string; retryable: boolean };

export interface NotificationTransport {
  readonly kind: 'mock' | 'disabled';
  /** False for the disabled transport: the dispatcher then leaves everything queued and spends no attempt. */
  readonly enabled: boolean;
  send(message: OutboxMessage, ctx: TransportContext): Promise<SendResult>;
}

/** Test seam: force failures deterministically. `times` failures happen first, then sends succeed (Infinity = always). */
export interface MockFailureMode {
  code: string;
  retryable: boolean;
  times: number;
}

export class MockTransport implements NotificationTransport {
  readonly kind = 'mock' as const;
  readonly enabled = true;
  private failuresLeft: number;
  /** Count of send() calls (diagnostics for tests). */
  calls = 0;

  constructor(private readonly failure?: MockFailureMode) {
    this.failuresLeft = failure?.times ?? 0;
  }

  async send(message: OutboxMessage, ctx: TransportContext): Promise<SendResult> {
    this.calls += 1;
    if (this.failure && this.failuresLeft > 0) {
      this.failuresLeft -= 1;
      return { ok: false, code: this.failure.code, retryable: this.failure.retryable };
    }
    // The only place an outbox row becomes 'sent'. The status guard makes a second call a no-op (never double-record).
    const r = await ctx.exec.query<{ id: string }>(
      `update reminder_outbox set status = 'sent', sent_at = $2::timestamptz, last_error_code = null,
              next_attempt_at = null, updated_at = $2::timestamptz
       where id = $1 and status = 'queued' returning id`,
      [message.id, ctx.now.toISOString()],
    );
    if (r.rows.length === 0) return { ok: false, code: 'not_queued', retryable: false };
    return { ok: true };
  }
}

/** Used when reminders are switched off: it never sends and the dispatcher leaves the queue untouched. */
export class DisabledTransport implements NotificationTransport {
  readonly kind = 'disabled' as const;
  readonly enabled = false;
  send(): Promise<SendResult> {
    return Promise.resolve({ ok: false, code: 'transport_disabled', retryable: false });
  }
}

/**
 * Resolve the transport for the validated environment. Only 'mock' is implementable; anything else (a future real
 * provider name, or REAL_NOTIFICATIONS_ENABLED) throws instead of silently falling back, so a real transport cannot be
 * selected by configuration.
 */
export function selectTransport(env: { NOTIFICATION_TRANSPORT: string; REAL_NOTIFICATIONS_ENABLED: boolean }): NotificationTransport {
  if (env.REAL_NOTIFICATIONS_ENABLED) throw new Error('Real notifications are not available: the mock transport is the only transport.');
  if (env.NOTIFICATION_TRANSPORT !== 'mock') throw new Error(`Unsupported notification transport "${env.NOTIFICATION_TRANSPORT}": only "mock" exists.`);
  return new MockTransport();
}

/** Generates an opaque DEMO destination placeholder. It carries no information about any person. */
export function newDemoDestinationToken(): string {
  return `demo:${randomBytes(8).toString('hex')}`;
}

export function isReminderChannel(v: string): v is ReminderChannel {
  return (REMINDER_CHANNELS as readonly string[]).includes(v);
}
