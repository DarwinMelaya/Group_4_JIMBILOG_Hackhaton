import { createHash } from 'node:crypto';
import express from 'express';
import type { PGlite } from '@electric-sql/pglite';
import {
  AdminConfigSchema,
  ArticleSlugSchema,
  ArticleTransitionSchema,
  ClinicPublishUpdateSchema,
  ClinicVerificationUpdateSchema,
  EvidenceCreateSchema,
  EvidenceReviewSchema,
  InviteCreateSchema,
  InviteRedeemSchema,
  LOCALES,
  MembershipAssignSchema,
  MinorSopMappingCreateSchema,
  type AdminConfig,
  type Locale,
} from '@kalinga/shared';
import type { AppEnv } from '../env.js';
import { AppError } from '../http/errors.js';
import { WindowLimiter } from '../booking/rate-limit.js';
import { currentStaff, requireCsrf, requireSameOrigin, requireStaff, staffNoStore, type StaffDeps } from '../staff/middleware.js';
import { clinicRefParam, notFound, requireRole, uuidParam } from './common.js';
import { addEvidence, expireEvidence, listAdminClinics, listEvidence, reviewEvidence, updateStatus, updateVerification } from './clinic-governance.js';
import { listAdminArticles, transitionLocalization } from './content-review.js';
import { minorReadiness, listMappings, recordMapping, revokeMapping } from './minor-sop.js';
import { buildSummary, recordExportAudit, summaryToCsv } from '../reports/reports.js';
import { assignMembership, createInvite, deactivateUser, listInvites, listStaff, redeemInvite, removeMembership, revokeInvite, type Actor } from './staff-admin.js';

// 5173 = vite dev, 4173 = vite preview (production build, used by the Playwright e2e). Both reach the API through the same-origin /api proxy.
const DEV_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173', 'http://127.0.0.1:4173'];

export interface GovernanceRouterOptions {
  env: AppEnv;
  getDb: () => PGlite | undefined;
  /** Test seam: clock. */
  now?: () => Date;
  allowedOrigins?: readonly string[];
  /** Per-IP invite redemption attempts per 15 minutes (default 20). */
  redeemIpLimit?: number;
}

function buildDeps(options: GovernanceRouterOptions): StaffDeps {
  return {
    db: () => {
      const d = options.getDb();
      if (!d) throw new AppError(503, 'service_unavailable', 'This service is temporarily unavailable.');
      return d;
    },
    demoMode: options.env.DEMO_MODE,
    now: options.now ?? (() => new Date()),
    allowedOrigins: options.allowedOrigins ?? (options.env.DEMO_MODE ? DEV_ORIGINS : []),
  };
}

const PROV = ['provincial_admin'] as const;
const PROV_TECH = ['provincial_admin', 'technical_admin'] as const;
const STAFF_ADMINS = ['provincial_admin', 'technical_admin', 'clinic_admin'] as const;

export function buildAdminConfig(env: AppEnv): AdminConfig {
  // No secrets: only booleans and enumerations. Real-world flags are literal false in the schema and cannot be reported true.
  return AdminConfigSchema.parse({
    apiVersion: 'v1',
    nodeEnv: env.NODE_ENV,
    demoMode: env.DEMO_MODE,
    notificationTransport: env.NOTIFICATION_TRANSPORT,
    realNotificationsEnabled: env.REAL_NOTIFICATIONS_ENABLED,
    realBookingRequestsEnabled: env.ALLOW_REAL_BOOKING_REQUESTS,
    realMinorBookingEnabled: env.REAL_MINOR_BOOKING_ENABLED,
    clinicalContentApproved: env.CLINICAL_CONTENT_APPROVED,
    bookingKeyConfigured: env.BOOKING_SECRET_KEY !== undefined,
    persistentStorage: env.PGLITE_DATA_DIR !== undefined,
  });
}

/**
 * /api/v1/admin/* : every route requires a live staff session (401 otherwise), CSRF on every write, an explicit role gate
 * (403 for the wrong role) and answers `Cache-Control: no-store`. Every write records a redacted audit event in the same
 * transaction. Role matrix: see the per-route gates and docs/decision-log.md.
 */
export function adminRouter(options: GovernanceRouterOptions): express.Router {
  const deps = buildDeps(options);
  const now = deps.now;
  const db = deps.db;
  const router = express.Router();
  router.use(staffNoStore);
  router.use(requireStaff(deps));
  router.use(requireCsrf(deps));
  const actor = (res: express.Response): Actor => {
    const s = currentStaff(res);
    return { id: s.user.id, role: s.user.role };
  };

  // ---- Safe configuration (technical admin) ----------------------------------------------------------------------------
  router.get('/config', requireRole('technical_admin'), (_req, res) => {
    res.json(buildAdminConfig(options.env));
  });

  // ---- Clinic governance: evidence, verification, publish status -------------------------------------------------------
  router.get('/clinics', requireRole(...PROV_TECH), async (_req, res) => {
    res.json({ items: await listAdminClinics(db(), now()) });
  });

  router.get('/clinics/:clinicId/evidence', requireRole(...PROV_TECH), async (req, res) => {
    res.json({ items: await listEvidence(db(), clinicRefParam(req.params.clinicId)) });
  });

  router.post('/clinics/:clinicId/evidence', requireRole(...PROV), async (req, res) => {
    const input = EvidenceCreateSchema.parse(req.body ?? {});
    res.status(201).json(await addEvidence(db(), clinicRefParam(req.params.clinicId), actor(res).id, input, now()));
  });

  router.post('/clinics/:clinicId/evidence/:evidenceId/review', requireRole(...PROV), async (req, res) => {
    const input = EvidenceReviewSchema.parse(req.body ?? {});
    res.json(await reviewEvidence(db(), clinicRefParam(req.params.clinicId), uuidParam(req.params.evidenceId), actor(res).id, input, now()));
  });

  router.post('/clinics/:clinicId/evidence/:evidenceId/expire', requireRole(...PROV), async (req, res) => {
    res.json(await expireEvidence(db(), clinicRefParam(req.params.clinicId), uuidParam(req.params.evidenceId), actor(res).id, now()));
  });

  router.patch('/clinics/:clinicId/verification', requireRole(...PROV), async (req, res) => {
    const input = ClinicVerificationUpdateSchema.parse(req.body ?? {});
    res.json(await updateVerification(db(), clinicRefParam(req.params.clinicId), actor(res).id, input, now()));
  });

  router.patch('/clinics/:clinicId/status', requireRole(...PROV), async (req, res) => {
    const input = ClinicPublishUpdateSchema.parse(req.body ?? {});
    res.json(await updateStatus(db(), clinicRefParam(req.params.clinicId), actor(res).id, input, now()));
  });

  // ---- Minor SOP clinic mapping (record only; never enables real minor booking) ----------------------------------------
  router.get('/minor-booking-readiness', requireRole(...PROV_TECH), async (req, res) => {
    const clinicId = req.query.clinicId;
    if (clinicId !== undefined && (typeof clinicId !== 'string' || !/^[0-9a-f-]{36}$/.test(clinicId))) {
      throw new AppError(400, 'validation_failed', 'The request failed validation.');
    }
    res.json(await minorReadiness(db(), options.env, clinicId));
  });

  router.get('/clinics/:clinicId/minor-sop-mappings', requireRole(...PROV_TECH), async (req, res) => {
    res.json({ items: await listMappings(db(), clinicRefParam(req.params.clinicId)) });
  });

  router.post('/clinics/:clinicId/minor-sop-mappings', requireRole(...PROV), async (req, res) => {
    const input = MinorSopMappingCreateSchema.parse(req.body ?? {});
    res.status(201).json(await recordMapping(db(), clinicRefParam(req.params.clinicId), actor(res).id, input, now()));
  });

  router.post('/clinics/:clinicId/minor-sop-mappings/:mappingId/revoke', requireRole(...PROV), async (req, res) => {
    res.json(await revokeMapping(db(), clinicRefParam(req.params.clinicId), uuidParam(req.params.mappingId), actor(res).id, now()));
  });

  // ---- Editorial review lifecycle (provincial admin acts as editor/reviewer in this prototype) -------------------------
  router.get('/articles', requireRole(...PROV), async (_req, res) => {
    res.json({ items: await listAdminArticles(db()) });
  });

  router.post('/articles/:slug/localizations/:locale/transition', requireRole(...PROV), async (req, res) => {
    const slug = ArticleSlugSchema.safeParse(req.params.slug);
    const locale = String(req.params.locale ?? '');
    if (!slug.success || !(LOCALES as readonly string[]).includes(locale)) throw notFound();
    const input = ArticleTransitionSchema.parse(req.body ?? {});
    res.json(await transitionLocalization(db(), slug.data, locale as Locale, actor(res).id, input, now()));
  });

  // ---- Privacy-preserving aggregate reports (small-cell suppression; no per-record data) ---------------------------------
  const reportMonths = (raw: unknown): number => {
    if (raw === undefined) return 6;
    const n = typeof raw === 'string' && /^\d{1,2}$/.test(raw) ? Number(raw) : NaN;
    if (!Number.isInteger(n) || n < 1 || n > 12) throw new AppError(400, 'validation_failed', 'The request failed validation.');
    return n;
  };

  router.get('/reports/summary', requireRole(...STAFF_ADMINS), async (req, res) => {
    res.json(await buildSummary(db(), actor(res), reportMonths(req.query.months), now()));
  });

  router.get('/reports/export.csv', requireRole(...STAFF_ADMINS), async (req, res) => {
    const summary = await buildSummary(db(), actor(res), reportMonths(req.query.months), now());
    const csv = summaryToCsv(summary);
    await recordExportAudit(db(), actor(res), summary.periods.length, now());
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="kalinga-demo-report.csv"');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(csv);
  });

  // ---- Staff roles: invites, memberships, deactivation --------------------------------------------------------------------
  router.get('/staff', requireRole(...STAFF_ADMINS), async (_req, res) => {
    res.json({ items: await listStaff(db(), actor(res)) });
  });

  router.get('/staff/invites', requireRole(...STAFF_ADMINS), async (_req, res) => {
    res.json({ items: await listInvites(db(), actor(res), now()) });
  });

  router.post('/staff/invites', requireRole(...STAFF_ADMINS), async (req, res) => {
    const input = InviteCreateSchema.parse(req.body ?? {});
    // The one-time invite code is in this response body only. It is not logged (the access log records no bodies) or audited.
    res.status(201).json(await createInvite(db(), actor(res), input, deps.demoMode, now()));
  });

  router.post('/staff/invites/:inviteId/revoke', requireRole(...STAFF_ADMINS), async (req, res) => {
    await revokeInvite(db(), actor(res), uuidParam(req.params.inviteId), now());
    res.status(204).end();
  });

  router.post('/staff/:userId/memberships', requireRole(...STAFF_ADMINS), async (req, res) => {
    const input = MembershipAssignSchema.parse(req.body ?? {});
    await assignMembership(db(), actor(res), uuidParam(req.params.userId), input, now());
    res.status(204).end();
  });

  router.delete('/staff/:userId/memberships/:clinicId', requireRole(...STAFF_ADMINS), async (req, res) => {
    await removeMembership(db(), actor(res), uuidParam(req.params.userId), uuidParam(req.params.clinicId), now());
    res.status(204).end();
  });

  router.post('/staff/:userId/deactivate', requireRole(...PROV_TECH), async (req, res) => {
    const out = await deactivateUser(db(), actor(res), uuidParam(req.params.userId), now());
    res.json({ deactivated: true, sessionsRevoked: out.sessionsRevoked });
  });

  return router;
}

function clientKey(req: express.Request): string {
  return createHash('sha256').update(req.ip ?? 'unknown').digest('hex');
}

/**
 * POST /api/v1/staff/invites/redeem : the only session-less governance route. Single use, expiring, rate limited,
 * Origin-checked, one generic failure for every invalid case. It creates the account but does NOT sign it in.
 */
export function inviteRedeemRouter(options: GovernanceRouterOptions): express.Router {
  const deps = buildDeps(options);
  const limiter = new WindowLimiter(options.redeemIpLimit ?? 20, 15 * 60_000);
  const router = express.Router();
  router.use(staffNoStore);
  router.post('/redeem', requireSameOrigin(deps), async (req, res) => {
    const wait = limiter.hit(clientKey(req));
    if (wait !== null) {
      res.setHeader('Retry-After', String(wait));
      throw new AppError(429, 'rate_limited', 'Too many attempts. Please wait before trying again.');
    }
    const input = InviteRedeemSchema.parse(req.body ?? {});
    await redeemInvite(deps.db(), input, deps.now());
    res.status(201).json({ created: true });
  });
  return router;
}
