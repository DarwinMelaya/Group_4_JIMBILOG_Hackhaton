import express from 'express';
import type { PGlite } from '@electric-sql/pglite';
import {
  ReminderPreferenceRequestSchema,
  type DevOutboxResponse,
  type ReminderPreferenceResponse,
} from '@kalinga/shared';
import { dummySecretHash, throwAccessError, verifyBookingAccess } from '../booking/access.js';
import { resolveBookingKey } from '../booking/crypto.js';
import { clientKey } from '../booking/routes.js';
import type { WindowLimiter } from '../booking/rate-limit.js';
import type { AppEnv } from '../env.js';
import { AppError } from '../http/errors.js';
import { selectTransport, type NotificationTransport } from './mock-transport.js';
import { dispatchDueReminders, listOutbox, setReminderPreference } from './service.js';

export interface ReminderRouterOptions {
  env: Pick<AppEnv, 'DEMO_MODE' | 'NODE_ENV' | 'BOOKING_SECRET_KEY' | 'NOTIFICATION_TRANSPORT' | 'REAL_NOTIFICATIONS_ENABLED'>;
  getDb: () => PGlite | undefined;
  /** The SAME per-IP limiter instance the status lookup uses, so the two endpoints share one budget. */
  lookupLimiter: WindowLimiter;
  now?: () => Date;
  transport?: NotificationTransport;
}

const noStore: express.RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
};

/** The inspection endpoints exist only for a DEMO build running in development/test; otherwise they do not exist (404). */
export function devOutboxAvailable(env: Pick<AppEnv, 'DEMO_MODE' | 'NODE_ENV'>): boolean {
  return env.DEMO_MODE && (env.NODE_ENV === 'development' || env.NODE_ENV === 'test');
}

const OUTBOX_NOTICE = 'DEMO mock outbox: these records were written by the mock transport. Nothing was delivered to any person.';

export function reminderRouter(options: ReminderRouterOptions): express.Router {
  const { env, getDb, lookupLimiter } = options;
  const now = options.now ?? (() => new Date());
  const key = resolveBookingKey(env);
  const dummyHash = key ? dummySecretHash(key) : '';
  const transport = options.transport ?? selectTransport(env);
  const router = express.Router();

  const db = (): PGlite => {
    const d = getDb();
    if (!d) throw new AppError(503, 'service_unavailable', 'This service is temporarily unavailable.');
    return d;
  };

  // ---- POST opt in / out (same reference + secret proof, lockout and throttle as the status lookup) -------------------
  router.post('/public/booking-requests/reminders', noStore, async (req, res) => {
    if (!key) throw new AppError(503, 'booking_unavailable', 'Booking requests are not available in this environment.');
    const wait = lookupLimiter.hit(clientKey(req));
    if (wait !== null) {
      res.setHeader('Retry-After', String(wait));
      throw new AppError(429, 'lookup_throttled', 'Too many attempts. Please wait before trying again.');
    }
    const body = ReminderPreferenceRequestSchema.parse(req.body ?? {});
    const d = db();
    const t0 = now();

    // One transaction: the failure counter commits even though the response is an error.
    const result = await d.transaction(async (tx) => {
      const access = await verifyBookingAccess(tx, key, dummyHash, body, t0);
      if (access.kind !== 'ok') return { ok: false, access } as const;
      const pref = await setReminderPreference(tx, access.booking.id, { optIn: body.optIn, channel: body.channel, locale: body.locale }, t0);
      return { ok: true, demo: access.booking.is_demo, pref } as const;
    });

    if (!result.ok) throwAccessError(result.access, (s) => res.setHeader('Retry-After', String(s)));
    const payload: ReminderPreferenceResponse = {
      optedIn: result.pref.optedIn,
      channel: result.pref.channel,
      mock: true,
      demo: result.demo,
      queued: result.pref.queued,
      suppressed: result.pref.suppressed,
    };
    res.status(200).json(payload);
  });

  // ---- DEV-only inspection (404 unless DEMO_MODE and development/test) ------------------------------------------------
  router.use('/dev/outbox', noStore, (_req, _res, next) => {
    if (!devOutboxAvailable(env)) return next(new AppError(404, 'not_found', 'Not found.'));
    next();
  });

  router.get('/dev/outbox', async (_req, res) => {
    const payload: DevOutboxResponse = { mock: true, notice: OUTBOX_NOTICE, items: await listOutbox(db()) };
    res.json(payload);
  });

  // Runs the dispatcher once with the mock transport (there is no scheduler in this prototype).
  router.post('/dev/outbox/dispatch', async (_req, res) => {
    const summary = await dispatchDueReminders(db(), now(), transport);
    res.json({ mock: true, ...summary });
  });

  return router;
}
