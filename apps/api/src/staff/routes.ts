import { createHash } from 'node:crypto';
import express from 'express';
import type { PGlite } from '@electric-sql/pglite';
import {
  StaffBookingListQuerySchema,
  StaffBookingTransitionSchema,
  StaffLoginRequestSchema,
  STAFF_SESSION_COOKIE,
  type StaffMe,
} from '@kalinga/shared';
import type { AppEnv } from '../env.js';
import { AppError } from '../http/errors.js';
import { WindowLimiter } from '../booking/rate-limit.js';
import { recordAudit } from './audit.js';
import { applyTransition, getDetail, listQueue } from './booking-queue.js';
import {
  currentScope,
  currentStaff,
  legacySessionCookieExpiry,
  readCookie,
  requireClinicScope,
  requireCsrf,
  requireSameOrigin,
  requireStaff,
  sessionCookie,
  staffNoStore,
  type StaffDeps,
} from './middleware.js';
import { dummyPasswordHash, verifyPassword } from './password.js';
import {
  createSession,
  deriveCsrfToken,
  findUserByEmail,
  listMemberships,
  newToken,
  purgeDeadSessions,
  recordLoginFailure,
  recordLoginSuccess,
  revokeSession,
  sha256Hex,
} from './repository.js';

const LOGIN_WINDOW_MS = 15 * 60_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface StaffRouterOptions {
  env: Pick<AppEnv, 'DEMO_MODE'>;
  getDb: () => PGlite | undefined;
  /** Test seam: clock. */
  now?: () => Date;
  /** Coarse per-IP login attempts per 15 minutes (default 30), independent of whether the account exists. */
  loginIpLimit?: number;
  /**
   * Extra origins allowed to send state-changing staff requests (besides the request's own host). Defaults to the local
   * Vite dev origins in DEMO_MODE, because the dev proxy keeps the browser Origin of the web server.
   */
  allowedOrigins?: readonly string[];
}

// 5173 = vite dev, 4173 = vite preview (production build, used by the Playwright e2e). Both reach the API through the same-origin /api proxy.
const DEV_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173', 'http://127.0.0.1:4173'];

function clientKey(req: express.Request): string {
  return createHash('sha256').update(req.ip ?? 'unknown').digest('hex');
}

/** If-Match: `"3"`, `W/"3"` or `3` -> 3. */
function parseIfMatch(header: string | undefined): number {
  if (header === undefined) throw new AppError(428, 'precondition_required', 'Send the version you loaded in the If-Match header.');
  const m = /^(?:W\/)?"?(\d{1,9})"?$/.exec(header.trim());
  if (!m?.[1]) throw new AppError(400, 'bad_request', 'The If-Match header must be the request version.');
  return Number(m[1]);
}

export function staffRouter(options: StaffRouterOptions): express.Router {
  const now = options.now ?? (() => new Date());
  const demoMode = options.env.DEMO_MODE;
  const deps: StaffDeps = {
    db: () => {
      const d = options.getDb();
      if (!d) throw new AppError(503, 'service_unavailable', 'This service is temporarily unavailable.');
      return d;
    },
    demoMode,
    now,
    allowedOrigins: options.allowedOrigins ?? (demoMode ? DEV_ORIGINS : []),
  };
  const loginLimiter = new WindowLimiter(options.loginIpLimit ?? 30, LOGIN_WINDOW_MS);

  const router = express.Router();
  router.use(staffNoStore);
  const auth = requireStaff(deps);
  const csrf = requireCsrf(deps);
  const scope = requireClinicScope(deps);

  const meBody = async (res: express.Response, sessionToken: string): Promise<StaffMe> => {
    const s = currentStaff(res);
    const memberships = await listMemberships(deps.db(), s.user.id, demoMode);
    return {
      user: { id: s.user.id, email: s.user.email, displayName: s.user.displayName, role: s.user.role, isDemo: s.user.isDemo },
      memberships: memberships.map((m) => ({ clinicId: m.clinic_id, clinicSlug: m.clinic_slug, clinicName: m.clinic_name, role: m.role })),
      csrfToken: deriveCsrfToken(sessionToken),
      sessionExpiresAt: s.expiresAt.toISOString(),
    };
  };

  // ---- POST /staff/login ----------------------------------------------------------------------------------------
  router.post('/login', requireSameOrigin(deps), async (req, res) => {
    const wait = loginLimiter.hit(clientKey(req));
    if (wait !== null) {
      res.setHeader('Retry-After', String(wait));
      throw new AppError(429, 'login_throttled', 'Too many sign-in attempts. Please wait before trying again.');
    }
    const body = StaffLoginRequestSchema.parse(req.body ?? {});
    const db = deps.db();
    const t0 = now();

    const user = await findUserByEmail(db, body.email);
    // Always do one scrypt verification (against a dummy hash for unknown accounts) so timing does not reveal accounts.
    const passwordOk = await verifyPassword(body.password, user?.password_hash ?? (await dummyPasswordHash()));
    const locked = user?.locked_until != null && new Date(user.locked_until).getTime() > t0.getTime();
    const usable = user !== null && user.active && !(user.is_demo && !demoMode);

    if (user && usable && passwordOk && !locked) {
      const token = newToken();
      const csrfToken = deriveCsrfToken(token);
      const session = await db.transaction(async (tx) => {
        await purgeDeadSessions(tx, t0);
        await recordLoginSuccess(tx, user.id, t0);
        const created = await createSession(tx, user.id, sha256Hex(token), sha256Hex(csrfToken), t0);
        await recordAudit(tx, {
          actorUserId: user.id,
          actorKind: 'staff',
          action: 'staff.login_succeeded',
          targetType: 'staff_session',
          targetId: created.id,
          metadata: { outcome: 'ok' },
          at: t0,
        });
        return created;
      });
      res.setHeader('Set-Cookie', [
        sessionCookie(req, token, Math.floor((session.expiresAt.getTime() - t0.getTime()) / 1000)),
        legacySessionCookieExpiry(req),
      ]);
      const memberships = await listMemberships(db, user.id, demoMode);
      const out: StaffMe = {
        user: { id: user.id, email: user.email, displayName: user.display_name, role: user.role, isDemo: user.is_demo },
        memberships: memberships.map((m) => ({ clinicId: m.clinic_id, clinicSlug: m.clinic_slug, clinicName: m.clinic_name, role: m.role })),
        csrfToken,
        sessionExpiresAt: session.expiresAt.toISOString(),
      };
      res.status(200).json(out);
      return;
    }

    // One generic failure for: unknown account, wrong password, deactivated account, locked account.
    const outcome = !user ? 'unknown' : locked ? 'locked' : !usable ? 'inactive' : 'bad_credentials';
    await db.transaction(async (tx) => {
      if (user && usable && !passwordOk && !locked) await recordLoginFailure(tx, user.id, t0);
      await recordAudit(tx, {
        actorUserId: user?.id ?? null,
        actorKind: 'anonymous',
        action: 'staff.login_failed',
        targetType: 'staff_user',
        targetId: user?.id ?? null,
        metadata: { outcome },
        at: t0,
      });
    });
    throw new AppError(401, 'login_failed', 'Sign-in failed. Check your details and try again.');
  });

  // ---- POST /staff/logout ---------------------------------------------------------------------------------------
  router.post('/logout', auth, csrf, async (req, res) => {
    const s = currentStaff(res);
    const t0 = now();
    await deps.db().transaction(async (tx) => {
      await revokeSession(tx, s.sessionId, t0);
      await recordAudit(tx, {
        actorUserId: s.user.id,
        actorKind: 'staff',
        action: 'staff.logout',
        targetType: 'staff_session',
        targetId: s.sessionId,
        at: t0,
      });
    });
    res.setHeader('Set-Cookie', [sessionCookie(req, '', 0), legacySessionCookieExpiry(req)]);
    res.status(204).end();
  });

  // ---- GET /staff/me --------------------------------------------------------------------------------------------
  router.get('/me', auth, async (req, res) => {
    const token = readCookie(req.get('cookie'), STAFF_SESSION_COOKIE) ?? '';
    res.json(await meBody(res, token));
  });

  // ---- Booking queue (clinic-scoped; membership re-checked on every request) ---------------------------------------
  router.get('/clinics/:clinicId/booking-requests', auth, scope, async (req, res) => {
    const query = StaffBookingListQuerySchema.parse(req.query);
    res.json(await listQueue(deps.db(), currentScope(res), query, now()));
  });

  router.get('/clinics/:clinicId/booking-requests/:requestId', auth, scope, async (req, res) => {
    const id = String(req.params.requestId ?? '');
    const detail = UUID_RE.test(id) ? await getDetail(deps.db(), currentScope(res), id, now()) : null;
    if (!detail) throw new AppError(404, 'not_found', 'Not found.');
    res.setHeader('ETag', `"${detail.version}"`);
    res.json(detail);
  });

  router.patch('/clinics/:clinicId/booking-requests/:requestId/status', auth, csrf, scope, async (req, res) => {
    const id = String(req.params.requestId ?? '');
    if (!UUID_RE.test(id)) throw new AppError(404, 'not_found', 'Not found.');
    const expectedVersion = parseIfMatch(req.get('if-match'));
    const input = StaffBookingTransitionSchema.parse(req.body ?? {});
    const detail = await applyTransition(deps.db(), {
      clinic: currentScope(res),
      requestId: id,
      actorUserId: currentStaff(res).user.id,
      expectedVersion,
      input,
      now: now(),
    });
    res.setHeader('ETag', `"${detail.version}"`);
    res.json(detail);
  });

  return router;
}
