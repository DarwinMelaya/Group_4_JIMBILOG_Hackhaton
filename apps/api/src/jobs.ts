import type { PGlite } from '@electric-sql/pglite';
import type { AppEnv } from './env.js';
import { purgeExpired } from './booking/repository.js';
import { demoteLapsedClinics } from './governance/clinic-governance.js';
import type { Logger } from './http/logger.js';
import { selectTransport, type NotificationTransport } from './notifications/mock-transport.js';
import { dispatchDueReminders, type DispatchSummary } from './notifications/service.js';
import { expireStalePending } from './staff/booking-queue.js';

/**
 * S9-3 in-process background jobs for DEMO / local development ONLY (a real deployment needs its own scheduler and is
 * deployment work). Every job is a plain async function that takes the clock as an argument, so tests call them directly.
 * The scheduler is started from server.ts only: createApp (and therefore every test) never starts a timer.
 */
export const JOB_INTERVAL_MS = 60_000;

export interface JobsSummary {
  reminders: DispatchSummary | null;
  expiredPending: number | null;
  /** Booking requests removed because retention_expires_at passed. */
  purgedBookings: number | null;
  /** Published real clinics returned to in_review because their partnership evidence lapsed. */
  demotedClinics: number | null;
  /** Names of jobs that threw (the others still ran). */
  failed: string[];
}

export async function purgeRetentionJob(db: PGlite, now: Date): Promise<number> {
  return db.transaction(async (tx) => {
    const before = await tx.query<{ n: number }>(`select count(*)::int as n from booking_requests where retention_expires_at <= $1::timestamptz`, [now.toISOString()]);
    await purgeExpired(tx, now);
    return before.rows[0]?.n ?? 0;
  });
}

/** Run every job once with isolated failures: one job throwing never stops the others. */
export async function runJobsOnce(
  db: PGlite,
  now: Date,
  transport: NotificationTransport,
  logger?: Logger,
): Promise<JobsSummary> {
  const out: JobsSummary = { reminders: null, expiredPending: null, purgedBookings: null, demotedClinics: null, failed: [] };
  const attempt = async <T>(name: string, fn: () => Promise<T>): Promise<T | null> => {
    try {
      return await fn();
    } catch (err) {
      out.failed.push(name);
      logger?.log('error', 'background job failed', { job: name, errorName: err instanceof Error ? err.name : 'unknown' });
      return null;
    }
  };
  out.reminders = await attempt('dispatch_reminders', () => dispatchDueReminders(db, now, transport));
  out.expiredPending = await attempt('expire_stale_pending', () => expireStalePending(db, now));
  out.purgedBookings = await attempt('purge_retention', () => purgeRetentionJob(db, now));
  out.demotedClinics = await attempt('demote_lapsed_clinics', () => demoteLapsedClinics(db, now));
  return out;
}

export interface BackgroundJobOptions {
  intervalMs?: number;
  now?: () => Date;
  logger?: Logger;
}

/**
 * Starts the 60 s scheduler. Returns stop(); a no-op unless DEMO_MODE=true and NODE_ENV is development or test. The timer
 * is unref'd (never keeps the process alive), a tick is skipped while the previous one is still running, and stop() clears
 * the timer.
 */
export function startBackgroundJobs(db: PGlite, env: Pick<AppEnv, 'DEMO_MODE' | 'NODE_ENV' | 'NOTIFICATION_TRANSPORT' | 'REAL_NOTIFICATIONS_ENABLED'>, options: BackgroundJobOptions = {}): () => void {
  if (!env.DEMO_MODE || (env.NODE_ENV !== 'development' && env.NODE_ENV !== 'test')) return () => undefined;
  const transport = selectTransport(env);
  const now = options.now ?? (() => new Date());
  let running = false;
  let stopped = false;
  const timer = setInterval(() => {
    if (running || stopped) return;
    running = true;
    void runJobsOnce(db, now(), transport, options.logger)
      .catch(() => undefined)
      .finally(() => {
        running = false;
      });
  }, options.intervalMs ?? JOB_INTERVAL_MS);
  timer.unref();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
