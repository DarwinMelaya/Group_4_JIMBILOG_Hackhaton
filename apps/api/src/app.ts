import express from 'express';
import helmet from 'helmet';
import type { PGlite } from '@electric-sql/pglite';
import { PublicConfigSchema, type PublicConfig } from '@kalinga/shared';
import { loadEnv, type AppEnv } from './env.js';
import { accessLog, noStoreByDefault, requestId } from './http/middleware.js';
import { errorHandler, notFoundHandler } from './http/errors.js';
import { createLogger, type Logger } from './http/logger.js';
import { articlesRouter } from './articles/routes.js';
import { clinicsRouter } from './clinics/routes.js';
import { pathwayRouter } from './pathway/routes.js';
import { bookingRouter } from './booking/routes.js';
import type { MinorBookingPolicy } from './booking/minor-policy.js';
import { ACCESS_LOCKOUT_MS } from './booking/access.js';
import { WindowLimiter } from './booking/rate-limit.js';
import { reminderRouter } from './notifications/routes.js';
import { staffRouter, type StaffRouterOptions } from './staff/routes.js';
import { adminRouter, inviteRedeemRouter } from './governance/routes.js';

export interface AppOptions {
  env?: AppEnv;
  logger?: Logger;
  db?: PGlite;
  /** Test seams for the booking module: clock, minor policy and in-memory per-IP limits. */
  booking?: { now?: () => Date; policy?: MinorBookingPolicy; lookupIpLimit?: number; createIpLimit?: number };
  /** Test seams for the staff module: clock, per-IP login limit, extra allowed origins. */
  staff?: Pick<StaffRouterOptions, 'now' | 'loginIpLimit' | 'allowedOrigins'>;
}

export function buildPublicConfig(env: AppEnv): PublicConfig {
  // Parsed through the shared schema so the response cannot drift from the contract.
  return PublicConfigSchema.parse({
    apiVersion: 'v1',
    demoMode: env.DEMO_MODE,
    locales: ['en', 'fil'],
    defaultLocale: 'en',
    timezone: 'Asia/Manila',
    notificationTransport: env.NOTIFICATION_TRANSPORT,
    realBookingEnabled: env.ALLOW_REAL_BOOKING_REQUESTS,
    clinicalContentApproved: env.CLINICAL_CONTENT_APPROVED,
  });
}

export function createApp(options: AppOptions = {}): express.Express {
  const env = options.env ?? loadEnv({});
  const logger = options.logger ?? createLogger();
  const app = express();
  app.disable('x-powered-by');
  // Rate limiters key on req.ip: trust no proxy header unless a known number of reverse-proxy hops is configured.
  if (env.TRUST_PROXY_HOPS > 0) app.set('trust proxy', env.TRUST_PROXY_HOPS);
  app.set('etag', false);
  app.locals.db = options.db;

  app.use(requestId);
  app.use(accessLog(logger));
  app.use(
    helmet({
      // JSON API: nothing is rendered, so lock everything down.
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      referrerPolicy: { policy: 'no-referrer' },
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );
  app.use(noStoreByDefault);
  app.use(express.json({ limit: '16kb' }));

  const v1 = express.Router();
  v1.get('/public/config', (_req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.json(buildPublicConfig(env));
  });
  v1.use(articlesRouter(env.DEMO_MODE, () => app.locals.db as PGlite | undefined));
  v1.use(clinicsRouter(env.DEMO_MODE, () => app.locals.db as PGlite | undefined));
  v1.use(pathwayRouter(env.DEMO_MODE, () => app.locals.db as PGlite | undefined));
  // One per-IP budget shared by the status lookup and the reminder preference endpoint (same proof, same throttle).
  const lookupLimiter = new WindowLimiter(options.booking?.lookupIpLimit ?? 30, ACCESS_LOCKOUT_MS);
  v1.use(bookingRouter({ env, getDb: () => app.locals.db as PGlite | undefined, ...options.booking, lookupLimiter }));
  v1.use(reminderRouter({ env, getDb: () => app.locals.db as PGlite | undefined, lookupLimiter, ...(options.booking?.now ? { now: options.booking.now } : {}) }));
  const governance = { env, getDb: () => app.locals.db as PGlite | undefined, ...(options.staff?.now ? { now: options.staff.now } : {}), ...(options.staff?.loginIpLimit ? { redeemIpLimit: options.staff.loginIpLimit } : {}), ...(options.staff?.allowedOrigins ? { allowedOrigins: options.staff.allowedOrigins } : {}) };
  v1.use('/staff/invites', inviteRedeemRouter(governance));
  v1.use('/admin', adminRouter(governance));
  v1.use('/staff', staffRouter({ env, getDb: () => app.locals.db as PGlite | undefined, ...options.staff }));
  app.use('/api/v1', v1);

  app.use(notFoundHandler);
  app.use(errorHandler(logger));
  return app;
}
