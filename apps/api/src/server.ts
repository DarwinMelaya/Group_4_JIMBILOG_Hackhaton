import { createApp } from './app.js';
import { isLoopbackHost, loadEnv, resolveHost } from './env.js';
import { openDatabase } from './db/client.js';
import { seedDemoData } from './db/seed.js';
import { createLogger } from './http/logger.js';
import { startBackgroundJobs } from './jobs.js';

const env = loadEnv();
const logger = createLogger();
const db = await openDatabase(env.PGLITE_DATA_DIR);
const host = resolveHost(env);
// Dev/test only: fictitious, unreviewed DEMO content. seedDemoData itself refuses staging/production.
if (env.DEMO_MODE && (env.NODE_ENV === 'development' || env.NODE_ENV === 'test')) {
  await seedDemoData(db, env);
  logger.log('warn', 'DEMO staff accounts are seeded with a shared DEMO password (development/test only); never expose this server beyond the local machine');
}
if (env.DEMO_MODE && !isLoopbackHost(host)) {
  logger.log('warn', 'DEMO_MODE is on but HOST is not a loopback address: DEMO data and DEMO staff accounts are reachable from the network');
}
// DEMO/dev only (a no-op otherwise): reminders, stale-pending expiry, retention purge and evidence-lapse demotion.
const stopJobs = startBackgroundJobs(db, env, { logger });
const server = createApp({ env, logger, db }).listen(env.PORT, host, () => {
  logger.log('info', 'listening', { host, port: env.PORT, demoMode: env.DEMO_MODE });
});

const shutdown = (): void => {
  stopJobs();
  server.close(() => {
    void db.close().finally(() => process.exit(0));
  });
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
