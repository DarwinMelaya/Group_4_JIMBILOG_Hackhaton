import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { openDatabase } from './client.js';
import { DEFAULT_MIGRATIONS_DIR, runMigrations } from './migrate.js';

const dbs: PGlite[] = [];
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dbs.splice(0).map((d) => d.close()));
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});
async function mem(): Promise<PGlite> {
  const d = new PGlite();
  await d.waitReady;
  dbs.push(d);
  return d;
}
async function tmpMigrations(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'kalinga-mig-'));
  dirs.push(dir);
  for (const [n, sql] of Object.entries(files)) await writeFile(path.join(dir, n), sql);
  return dir;
}

describe('migration runner', () => {
  it('applies the baseline and records it', async () => {
    const db = await mem();
    const r = await runMigrations(db);
    expect(r.applied).toContain('0001_baseline.sql');
    const rows = await db.query<{ version: string }>('select version from schema_migrations order by version');
    expect(rows.rows.map((x) => x.version)).toContain('0001_baseline.sql');
    const cfg = await db.query<{ value: string }>("select value from app_config where key = 'schema.baseline'");
    expect(cfg.rows[0]?.value).toBe('0001');
  });

  it('is idempotent: second run applies nothing and does not duplicate rows', async () => {
    const db = await mem();
    await runMigrations(db);
    const second = await runMigrations(db);
    expect(second.applied).toEqual([]);
    expect(second.skipped).toContain('0001_baseline.sql');
    const n = await db.query<{ c: number }>('select count(*)::int as c from app_config');
    expect(n.rows[0]?.c).toBe(1);
  });

  it('applies in filename order and rolls back a failing migration', async () => {
    const dir = await tmpMigrations({
      '0002_b.sql': 'create table b (id int);',
      '0001_a.sql': 'create table a (id int);',
      '0003_bad.sql': 'create table c (id int); select * from does_not_exist;',
    });
    const db = await mem();
    await expect(runMigrations(db, dir)).rejects.toThrow();
    const v = await db.query<{ version: string }>('select version from schema_migrations order by version');
    expect(v.rows.map((x) => x.version)).toEqual(['0001_a.sql', '0002_b.sql']);
    const c = await db.query<{ t: string | null }>("select to_regclass('public.c')::text as t");
    expect(c.rows[0]?.t).toBeNull();
  });

  it('rejects an applied migration whose content changed', async () => {
    const dir = await tmpMigrations({ '0001_a.sql': 'create table a (id int);' });
    const db = await mem();
    await runMigrations(db, dir);
    await writeFile(path.join(dir, '0001_a.sql'), 'create table a (id int, x int);');
    await expect(runMigrations(db, dir)).rejects.toThrow(/modified/);
  });

  it('baseline enforces the key format constraint', async () => {
    const db = await mem();
    await runMigrations(db);
    await expect(db.query("insert into app_config (key, value) values ('Bad Key', '1')")).rejects.toThrow();
  });

  it('migration filenames in supabase/migrations follow NNNN_name.sql', async () => {
    const files = (await readdir(DEFAULT_MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql'));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) expect(f).toMatch(/^\d{4}_[a-z0-9_]+\.sql$/);
    expect((await readFile(path.join(DEFAULT_MIGRATIONS_DIR, files[0] as string), 'utf8')).length).toBeGreaterThan(0);
  });
});

describe('openDatabase', () => {
  it('is in-memory by default and migrated', async () => {
    const db = await openDatabase();
    dbs.push(db);
    const r = await db.query<{ c: number }>('select count(*)::int as c from schema_migrations');
    expect(r.rows[0]?.c).toBeGreaterThan(0);
  });

  it('persists to a data directory and stays idempotent on reopen', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'kalinga-pg-'));
    dirs.push(root);
    const dir = path.join(root, 'data');
    const a = await openDatabase(dir);
    await a.query(`insert into app_config (key, value) values ('test.persist', '"yes"')`);
    await a.close();
    const b = await openDatabase(dir);
    dbs.push(b);
    const r = await b.query<{ c: number }>("select count(*)::int as c from app_config where key = 'test.persist'");
    expect(r.rows[0]?.c).toBe(1);
    const m = await b.query<{ c: number }>('select count(*)::int as c from schema_migrations');
    expect(m.rows[0]?.c).toBe(1);
  });
});
