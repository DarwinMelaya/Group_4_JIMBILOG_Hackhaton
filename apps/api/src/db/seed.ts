import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PGlite } from '@electric-sql/pglite';
import type { AppEnv } from '../env.js';
import { seedDemoStaff } from '../staff/demo-seed.js';

/** supabase/seeds at the repo root (same depth from src/db and dist/db). */
export const DEFAULT_SEEDS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../supabase/seeds');

const FILE_RE = /^\d{4}_[a-z0-9_]+\.sql$/;

/**
 * Load the DEMO seed files (fictitious placeholder content). Dev/test only: refuses to run unless
 * DEMO_MODE is true and NODE_ENV is development or test, so staging/production can never receive demo rows.
 * Seeds are idempotent (`on conflict do nothing`), so re-running is safe. DEMO staff accounts are added last.
 */
export async function seedDemoData(
  db: PGlite,
  env: Pick<AppEnv, 'DEMO_MODE' | 'NODE_ENV'>,
  dir: string = DEFAULT_SEEDS_DIR,
): Promise<string[]> {
  if (!env.DEMO_MODE || (env.NODE_ENV !== 'development' && env.NODE_ENV !== 'test')) {
    throw new Error('Demo seeds may only be loaded when DEMO_MODE=true and NODE_ENV is development or test');
  }
  const files = (await readdir(dir)).filter((f) => FILE_RE.test(f)).sort();
  for (const file of files) {
    const sql = await readFile(path.join(dir, file), 'utf8');
    await db.transaction(async (tx) => {
      await tx.exec(sql);
    });
  }
  // Staff accounts need scrypt hashes, so they are created by code at seed time (no hashes or passwords in the repo).
  await seedDemoStaff(db);
  return files;
}
