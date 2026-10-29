import express from 'express';
import helmet from 'helmet';
import type { PGlite } from '@electric-sql/pglite';
import { PublicConfigSchema, type PublicConfig } from '@kalinga/shared';
import { loadEnv, type AppEnv } from './env.js';
import { accessLog, noStoreByDefault, requestId } from './http/middleware.js';
import { errorHandler, notFoundHandler } from './http/errors.js';
import { createLogger, type Logger } from './http/logger.js';

export interface AppOptions {
  env?: AppEnv;
  logger?: Logger;
  db?: PGlite;
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
  app.use('/api/v1', v1);

  app.use(notFoundHandler);
  app.use(errorHandler(logger));
  return app;
}
