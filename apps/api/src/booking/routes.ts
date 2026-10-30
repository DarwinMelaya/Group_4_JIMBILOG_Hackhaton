import { createHash } from 'node:crypto';
import express from 'express';
import type { PGlite } from '@electric-sql/pglite';
import {
  BookingCreateRequestSchema,
  BookingLookupRequestSchema,
  IDEMPOTENCY_KEY_RE,
  type BookingCreateRequest,
  type BookingCreated,
  type BookingLookupResponse,
  type BookingReplay,
  type BookingStatus,
} from '@kalinga/shared';
import type { AppEnv } from '../env.js';
import { AppError } from '../http/errors.js';
import { ACCESS_LOCKOUT_MS, dummySecretHash, throwAccessError, verifyBookingAccess } from './access.js';
import { generateReference, generateSecret, hmacHex, resolveBookingKey } from './crypto.js';
import { createMinorPolicy, type MinorBookingPolicy } from './minor-policy.js';
import { WindowLimiter } from './rate-limit.js';
import {
  addDays,
  availableServices,
  buildBookingConfig,
  effectiveServiceMode,
  findBookingByKey,
  findClinicBooking,
  insertBooking,
  manilaToday,
  purgeExpired,
  saveIdempotencyKey,
  toEnabled,
  type EnabledClinicBooking,
} from './repository.js';

/** Idempotency keys live for 24 hours; after that the same key is treated as new. */
export const IDEMPOTENCY_TTL_MS = 24 * 3_600_000;
const LOCKOUT_MS = ACCESS_LOCKOUT_MS;
const REFERENCE_INSERT_ATTEMPTS = 5;

export interface BookingRouterOptions {
  env: Pick<AppEnv, 'DEMO_MODE' | 'REAL_MINOR_BOOKING_ENABLED' | 'ALLOW_REAL_BOOKING_REQUESTS' | 'BOOKING_SECRET_KEY'>;
  getDb: () => PGlite | undefined;
  /** Defaults to the policy for `env` (DEMO fixture in demo mode, fail-closed otherwise). */
  policy?: MinorBookingPolicy;
  /** Injectable clock (tests). */
  now?: () => Date;
  /** Coarse in-memory per-IP limits (attempts per 15 minutes). */
  lookupIpLimit?: number;
  createIpLimit?: number;
  /** Shared per-IP lookup limiter (the reminder endpoint uses the same instance). Built from `lookupIpLimit` when omitted. */
  lookupLimiter?: WindowLimiter;
}

const MSG = {
  under_15_not_supported:
    'Online requests are not available for this age group in this version. Learning pages and clinic information remain available.',
  minor_policy_not_configured:
    'Online requests for ages 15 to 17 are not available because no approved procedure is configured. Learning pages and clinic information remain available.',
} as const;

const noStore: express.RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
};

export function clientKey(req: express.Request): string {
  return createHash('sha256').update(req.ip ?? 'unknown').digest('hex');
}

function normaliseNotes(notes: string | undefined): string | null {
  return notes === undefined || notes === '' ? null : notes;
}

export function bookingRouter(options: BookingRouterOptions): express.Router {
  const { env, getDb } = options;
  const now = options.now ?? (() => new Date());
  const policy = options.policy ?? createMinorPolicy(env);
  const key = resolveBookingKey(env);
  const lookupLimiter = options.lookupLimiter ?? new WindowLimiter(options.lookupIpLimit ?? 30, LOCKOUT_MS);
  const createLimiter = new WindowLimiter(options.createIpLimit ?? 30, LOCKOUT_MS);
  // Compared against when the reference is unknown, so unknown-reference and wrong-secret do the same work.
  const dummyHash = key ? dummySecretHash(key) : '';
  const router = express.Router();

  const db = (): PGlite => {
    const d = getDb();
    if (!d) throw new AppError(503, 'service_unavailable', 'This service is temporarily unavailable.');
    return d;
  };
  const requireKey = (): Buffer => {
    if (!key) throw new AppError(503, 'booking_unavailable', 'Booking requests are not available in this environment.');
    return key;
  };

  router.use('/public/booking-requests', noStore);

  // ---- GET clinic-specific booking config -----------------------------------------------------------------------
  router.get('/public/clinics/:id/booking-config', noStore, async (req, res) => {
    const id = String(req.params.id ?? '');
    if (!/^[A-Za-z0-9-]{1,80}$/.test(id)) throw new AppError(404, 'not_found', 'Not found.');
    const d = db();
    const row = await findClinicBooking(d, env.DEMO_MODE, id, now());
    if (!row) throw new AppError(404, 'not_found', 'Not found.');
    const enabled = toEnabled(row, row.enabled === true ? await availableServices(d, row.clinic_id) : []);
    if (!enabled) throw new AppError(404, 'booking_not_available', 'This clinic is not taking online requests.');
    res.json(buildBookingConfig(enabled, policy, env.DEMO_MODE, now()));
  });

  // ---- POST create -----------------------------------------------------------------------------------------------
  router.post('/public/booking-requests', async (req, res) => {
    const hmacKey = requireKey();
    const wait = createLimiter.hit(clientKey(req));
    if (wait !== null) {
      res.setHeader('Retry-After', String(wait));
      throw new AppError(429, 'rate_limited', 'Too many requests. Please try again later.');
    }
    const idemKey = req.get('idempotency-key');
    if (idemKey === undefined || idemKey === '') {
      throw new AppError(400, 'idempotency_key_required', 'An Idempotency-Key header is required.');
    }
    if (!IDEMPOTENCY_KEY_RE.test(idemKey)) {
      throw new AppError(400, 'idempotency_key_invalid', 'The Idempotency-Key header is not valid.');
    }
    const body = BookingCreateRequestSchema.parse(req.body ?? {});
    const d = db();
    const t0 = now();

    const row = await findClinicBooking(d, env.DEMO_MODE, body.clinicId);
    if (!row) throw new AppError(404, 'not_found', 'Not found.');
    if (!row.is_demo && !env.ALLOW_REAL_BOOKING_REQUESTS) {
      throw new AppError(403, 'real_booking_disabled', 'Requests to real clinics are not available in this prototype.');
    }
    const cfg = toEnabled(row, row.enabled === true ? await availableServices(d, row.clinic_id) : []);
    if (!cfg) throw new AppError(404, 'booking_not_available', 'This clinic is not taking online requests.');

    // Minor policy first: nothing about a rejected request is stored, and no idempotency key is consumed.
    const decision = policy.evaluate({ ageBand: body.ageBand, clinicId: row.clinic_id, isDemoClinic: row.is_demo, demoMode: env.DEMO_MODE });
    if (decision.outcome === 'rejected') throw new AppError(422, decision.code, MSG[decision.code]);
    const isDemoMinorFlow = decision.outcome === 'demo_only';

    const keyHash = hmacHex(hmacKey, 'idempotency', idemKey);
    const fingerprint = hmacHex(
      hmacKey,
      'fingerprint',
      JSON.stringify([row.clinic_id, body.ageBand, body.preferredDate, body.preferredWindow, body.service ?? null, body.contactPreference ?? null, normaliseNotes(body.notes)]),
    );

    type Outcome =
      | { kind: 'created'; payload: BookingCreated }
      | { kind: 'replay'; payload: BookingReplay }
      | { kind: 'conflict' }
      | { kind: 'exhausted' };

    const replayOf = (existing: Awaited<ReturnType<typeof findBookingByKey>>): Outcome | null => {
      if (!existing) return null;
      if (existing.request_fingerprint !== fingerprint) return { kind: 'conflict' };
      return {
        kind: 'replay',
        payload: {
          alreadyCreated: true,
          status: existing.status as BookingStatus,
          requestOnly: true,
          demo: existing.is_demo,
          reference: existing.reference,
          clinic: { name: existing.clinic_name, slug: existing.clinic_slug, isDemo: existing.is_demo },
        },
      };
    };

    // S9-3: an idempotent replay (or key conflict) is answered BEFORE field/date validation, because the stored request was
    // valid when it was made and the date window moves with the clock. A replay never writes anything.
    const early = replayOf(await findBookingByKey(d, keyHash, t0));
    if (early === null) validateFields(body, cfg, t0);

    const outcome = early ?? (await d.transaction<Outcome>(async (tx) => {
      await purgeExpired(tx, t0);
      const raced = replayOf(await findBookingByKey(tx, keyHash, t0));
      if (raced) return raced;
      // The secret is independent of the reference; only its HMAC is persisted.
      const secret = generateSecret();
      const secretHash = hmacHex(hmacKey, 'secret', secret);
      for (let i = 0; i < REFERENCE_INSERT_ATTEMPTS; i += 1) {
        const reference = generateReference();
        const id = await insertBooking(tx, {
          reference,
          secretHash,
          clinicId: row.clinic_id,
          preferredDate: body.preferredDate,
          preferredWindow: body.preferredWindow,
          service: body.service ?? null,
          contactPreference: body.contactPreference ?? null,
          notes: normaliseNotes(body.notes),
          ageBand: body.ageBand,
          isDemo: row.is_demo,
          isDemoMinorFlow,
          now: t0,
          retentionDays: cfg.retention_days,
        });
        if (id === null) continue;
        await saveIdempotencyKey(tx, keyHash, fingerprint, id, t0, IDEMPOTENCY_TTL_MS);
        return {
          kind: 'created',
          payload: {
            status: 'pending',
            requestOnly: true,
            demo: row.is_demo,
            demoMinorFlow: isDemoMinorFlow,
            reference,
            secret,
            clinic: { name: row.name, slug: row.slug, isDemo: row.is_demo },
            createdAt: t0.toISOString(),
          },
        };
      }
      return { kind: 'exhausted' };
    }));

    switch (outcome.kind) {
      case 'created':
        res.status(201).json(outcome.payload);
        return;
      case 'replay':
        // 200, not 201: the original secret was shown once and is deliberately NOT repeated.
        res.status(200).json(outcome.payload);
        return;
      case 'conflict':
        throw new AppError(409, 'idempotency_key_conflict', 'This Idempotency-Key was already used for a different request.');
      case 'exhausted':
        throw new AppError(503, 'booking_unavailable', 'The request could not be created. Please try again.');
    }
  });

  // ---- POST lookup (reference + secret in the body only) ---------------------------------------------------------
  router.post('/public/booking-requests/lookup', async (req, res) => {
    const hmacKey = requireKey();
    const wait = lookupLimiter.hit(clientKey(req));
    if (wait !== null) {
      res.setHeader('Retry-After', String(wait));
      throw new AppError(429, 'lookup_throttled', 'Too many attempts. Please wait before trying again.');
    }
    const body = BookingLookupRequestSchema.parse(req.body ?? {});
    const d = db();
    const t0 = now();

    // One transaction: the failure counter commits even though the response is an error.
    const result = await d.transaction((tx) => verifyBookingAccess(tx, hmacKey, dummyHash, body, t0));

    if (result.kind === 'ok') {
      const b = result.booking;
      const payload: BookingLookupResponse = {
        reference: b.reference,
        status: b.status,
        requestOnly: true,
        demo: b.is_demo,
        clinic: { name: b.clinic_name, slug: b.clinic_slug, isDemo: b.is_demo },
        clinicNote: b.clinic_note,
        visitInstructions: b.visit_instructions,
        updatedAt: new Date(b.updated_at).toISOString(),
      };
      res.status(200).json(payload);
      return;
    }
    throwAccessError(result, (seconds) => res.setHeader('Retry-After', String(seconds)));
  });

  return router;
}

/** Field rules from the clinic's config: collect only what it asks for, and what it asks for must be sensible. */
function validateFields(body: BookingCreateRequest, cfg: EnabledClinicBooking, t0: Date): void {
  const serviceMode = effectiveServiceMode(cfg.service_mode, cfg.services);
  const check = (name: string, mode: 'hidden' | 'optional' | 'required', present: boolean): void => {
    if (mode === 'hidden' && present) throw new AppError(400, 'field_not_collected', `This clinic does not collect: ${name}.`);
    if (mode === 'required' && !present) throw new AppError(400, 'field_required', `This clinic requires: ${name}.`);
  };
  check('service', serviceMode, body.service !== undefined);
  if (body.service !== undefined && !cfg.services.includes(body.service)) {
    throw new AppError(400, 'service_not_offered', 'This clinic does not list that service for requests.');
  }
  check('contactPreference', cfg.contact_preference_mode, body.contactPreference !== undefined);
  const notes = normaliseNotes(body.notes);
  check('notes', cfg.notes_mode, notes !== null);
  if (notes !== null && notes.length > cfg.notes_max_length) {
    throw new AppError(400, 'notes_too_long', `Notes can be at most ${cfg.notes_max_length} characters.`);
  }
  // Preferred date is validated in Asia/Manila against the clinic's advance window.
  const today = manilaToday(t0);
  const min = addDays(today, cfg.min_advance_days);
  const max = addDays(today, cfg.max_advance_days);
  if (body.preferredDate < min || body.preferredDate > max) {
    throw new AppError(400, 'date_out_of_range', `Choose a preferred date between ${min} and ${max}.`);
  }
}
