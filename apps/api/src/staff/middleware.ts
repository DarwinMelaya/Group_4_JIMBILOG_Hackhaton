import { timingSafeEqual } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import type { Request, RequestHandler, Response } from 'express';
import { STAFF_CSRF_HEADER, STAFF_SESSION_COOKIE } from '@kalinga/shared';
import { AppError } from '../http/errors.js';
import { recordAudit } from './audit.js';
import { loadSession, resolveClinicScope, sha256Hex, type ClinicScope, type LiveSession } from './repository.js';

export interface StaffDeps {
  db: () => PGlite;
  demoMode: boolean;
  now: () => Date;
  /** Origins (besides the request's own host) allowed to send state-changing staff requests. */
  allowedOrigins: readonly string[];
}

/** Covers /api/v1/staff, /api/v1/admin and the report routes: one session cookie, still never sent outside the API. */
export const STAFF_COOKIE_PATH = '/api/v1';

/** Minimal Cookie header parser (no dependency): returns the value of one cookie, or undefined. */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return undefined;
}

export function isLocalHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1';
}

/** httpOnly, SameSite=Strict, Path-scoped to /api/v1 (staff + admin + reports); Secure everywhere except localhost development. */
export function sessionCookie(req: Request, value: string, maxAgeSeconds: number): string {
  const attrs = [`${STAFF_SESSION_COOKIE}=${value}`, `Path=${STAFF_COOKIE_PATH}`, 'HttpOnly', 'SameSite=Strict', `Max-Age=${maxAgeSeconds}`];
  if (!isLocalHost(req.hostname)) attrs.push('Secure');
  return attrs.join('; ');
}

/**
 * S9-3: the cookie used to be scoped to /api/v1/staff. A browser may still hold one under that old Path, which would be
 * sent alongside the new one, so login and logout also expire it.
 */
export function legacySessionCookieExpiry(req: Request): string {
  const attrs = [`${STAFF_SESSION_COOKIE}=`, 'Path=/api/v1/staff', 'HttpOnly', 'SameSite=Strict', 'Max-Age=0'];
  if (!isLocalHost(req.hostname)) attrs.push('Secure');
  return attrs.join('; ');
}

/** Every staff response is private: never cached by browsers, proxies or the service worker. */
export const staffNoStore: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Vary', 'Cookie, Origin');
  next();
};

export function currentStaff(res: Response): LiveSession {
  const s = res.locals.staff as LiveSession | undefined;
  if (!s) throw new AppError(401, 'unauthenticated', 'Sign in to continue.');
  return s;
}

export function currentScope(res: Response): ClinicScope {
  const s = res.locals.clinicScope as ClinicScope | undefined;
  if (!s) throw new AppError(404, 'not_found', 'Not found.');
  return s;
}

/** Authenticates the session cookie against the database on every request. 401 with one generic message otherwise. */
export function requireStaff(deps: StaffDeps): RequestHandler {
  return async (req, res, next) => {
    const token = readCookie(req.get('cookie'), STAFF_SESSION_COOKIE);
    const session = token ? await loadSession(deps.db(), token, deps.now(), deps.demoMode) : null;
    if (!session) throw new AppError(401, 'unauthenticated', 'Sign in to continue.');
    res.locals.staff = session;
    next();
  };
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF protection for state-changing staff routes (decision D-026). Chosen: SESSION-BOUND SYNCHRONIZER TOKEN. The token
 * is returned in the login/me JSON body (never in a cookie), only its SHA-256 is stored with the session, and every
 * non-GET request must echo it in the X-CSRF-Token header (compared in constant time). It is layered with an Origin
 * check (when an Origin header is sent it must be this host or an explicitly allowed origin) and SameSite=Strict
 * cookies. A cross-site page can neither read the token (no CORS) nor send the custom header.
 */
export function requireSameOrigin(deps: StaffDeps): RequestHandler {
  return (req, _res, next) => {
    const origin = req.get('origin');
    if (origin !== undefined) {
      const host = req.get('host');
      const own = host !== undefined ? [`http://${host}`, `https://${host}`] : [];
      if (origin === 'null' || ![...own, ...deps.allowedOrigins].includes(origin)) {
        throw new AppError(403, 'csrf_rejected', 'The request was rejected.');
      }
    }
    next();
  };
}

export function requireCsrf(deps: StaffDeps): RequestHandler {
  const sameOrigin = requireSameOrigin(deps);
  return (req, res, next) => {
    if (SAFE_METHODS.has(req.method)) {
      next();
      return;
    }
    sameOrigin(req, res, () => undefined);
    const session = currentStaff(res);
    const sent = req.get(STAFF_CSRF_HEADER);
    const a = Buffer.from(sent ? sha256Hex(sent) : '', 'hex');
    const b = Buffer.from(session.csrfHash, 'hex');
    if (a.length !== b.length || a.length === 0 || !timingSafeEqual(a, b)) {
      throw new AppError(403, 'csrf_rejected', 'The request was rejected.');
    }
    next();
  };
}

const CLINIC_PARAM_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[a-z0-9]+(-[a-z0-9]+)*)$/;

/**
 * IDOR-safe clinic scope. Re-checks the membership server-side on EVERY request. Anything that is not an active clinic
 * membership of an active clinic-level user answers 404 (never 403), so another clinic's existence is not revealed.
 * The denial is recorded in the audit log without any request content.
 */
export function requireClinicScope(deps: StaffDeps, param = 'clinicId'): RequestHandler {
  return async (req, res, next) => {
    const staff = currentStaff(res);
    const raw = String(req.params[param] ?? '');
    const scope = CLINIC_PARAM_RE.test(raw) && raw.length <= 80 ? await resolveClinicScope(deps.db(), staff.user.id, raw, deps.demoMode) : null;
    if (!scope) {
      await recordAudit(deps.db(), {
        actorUserId: staff.user.id,
        actorKind: 'staff',
        action: 'booking_request.access_denied',
        targetType: 'booking_request',
        metadata: { outcome: 'denied' },
        at: deps.now(),
      });
      throw new AppError(404, 'not_found', 'Not found.');
    }
    res.locals.clinicScope = scope;
    next();
  };
}
