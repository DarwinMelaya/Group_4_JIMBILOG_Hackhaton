import { PGlite } from '@electric-sql/pglite';
import { runMigrations } from './migrate.js';

/**
 * Open a PGlite database. No dataDir (or empty) means in-memory (tests); a dataDir persists on disk
 * (dev, PGLITE_DATA_DIR). Migrations are applied before returning.
 */
export async function openDatabase(dataDir?: string): Promise<PGlite> {
  const db = dataDir ? new PGlite(dataDir) : new PGlite();
  await db.waitReady;
  await runMigrations(db);
  return db;
}
