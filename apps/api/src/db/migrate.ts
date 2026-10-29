import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PGlite } from '@electric-sql/pglite';

/** supabase/migrations at the repo root (same depth from src/db and dist/db). */
export const DEFAULT_MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../supabase/migrations',
);

const FILE_RE = /^\d{4}_[a-z0-9_]+\.sql$/;

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

/**
 * Apply `NNNN_name.sql` files in filename order, recording each in schema_migrations.
 * Idempotent: applied versions are skipped; a changed applied file is an error (checksum).
 * Each migration runs in its own transaction.
 */
export async function runMigrations(db: PGlite, dir: string = DEFAULT_MIGRATIONS_DIR): Promise<MigrationResult> {
  await db.exec(`create table if not exists schema_migrations (
    version text primary key,
    checksum text not null,
    applied_at timestamptz not null default now()
  )`);
  const files = (await readdir(dir)).filter((f) => FILE_RE.test(f)).sort();
  const done = await db.query<{ version: string; checksum: string }>('select version, checksum from schema_migrations');
  const known = new Map(done.rows.map((r) => [r.version, r.checksum]));
  const result: MigrationResult = { applied: [], skipped: [] };
  for (const file of files) {
    const sql = await readFile(path.join(dir, file), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const prior = known.get(file);
    if (prior !== undefined) {
      if (prior !== checksum) throw new Error(`Migration ${file} was modified after being applied`);
      result.skipped.push(file);
      continue;
    }
    await db.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.query('insert into schema_migrations (version, checksum) values ($1, $2)', [file, checksum]);
    });
    result.applied.push(file);
  }
  return result;
}
