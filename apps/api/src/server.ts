import { createApp } from './app.js';
import { loadEnv } from './env.js';
import { openDatabase } from './db/client.js';
import { createLogger } from './http/logger.js';

const env = loadEnv();
const logger = createLogger();
const db = await openDatabase(env.PGLITE_DATA_DIR);
const server = createApp({ env, logger, db }).listen(env.PORT, () => {
  logger.log('info', 'listening', { port: env.PORT, demoMode: env.DEMO_MODE });
});

const shutdown = (): void => {
  server.close(() => {
    void db.close().finally(() => process.exit(0));
  });
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
