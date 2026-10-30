import request from 'supertest';
import type { PGlite } from '@electric-sql/pglite';
import { createApp, type AppOptions } from '../app.js';
import { openDatabase } from '../db/client.js';
import { seedDemoData } from '../db/seed.js';
import { loadEnv, type AppEnv } from '../env.js';
import { createLogger } from '../http/logger.js';
import { DEMO_STAFF_PASSWORD_DEFAULT } from './demo-seed.js';

/** Shared helpers for the staff test files (not part of the production bundle's entry points). */
export const DEMO_PW = DEMO_STAFF_PASSWORD_DEFAULT;
export const STAFF_A = 'staff.a@demo.invalid';
export const STAFF_B = 'staff.b@demo.invalid';
export const ADMIN_A = 'admin.a@demo.invalid';
export const PROVINCIAL = 'provincial@demo.invalid';
export const TECH = 'tech@demo.invalid';
export const DISABLED = 'disabled@demo.invalid';

export interface Harness {
  db: PGlite;
  env: AppEnv;
  clock: { now: Date };
  logs: string[];
  build(over?: Partial<AppOptions>, env?: AppEnv): ReturnType<typeof createApp>;
}

export async function makeHarness(start = '2026-10-30T04:00:00Z'): Promise<Harness> {
  const env = loadEnv({});
  const db = await openDatabase();
  await seedDemoData(db, env);
  const h: Harness = {
    db,
    env,
    clock: { now: new Date(start) },
    logs: [],
    build(over = {}, e = env) {
      return createApp({
        env: e,
        logger: createLogger((l) => h.logs.push(l)),
        db,
        booking: { now: () => h.clock.now, createIpLimit: 10_000, lookupIpLimit: 10_000 },
        staff: { now: () => h.clock.now, loginIpLimit: 10_000 },
        ...over,
      });
    },
  };
  return h;
}

export interface Session {
  cookie: string;
  csrf: string;
  body: Record<string, unknown>;
}

export async function login(app: ReturnType<typeof createApp>, email: string, password = DEMO_PW): Promise<Session> {
  const res = await request(app).post('/api/v1/staff/login').send({ email, password });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status}`);
  const setCookie = res.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = setCookie?.[0]?.split(';')[0] ?? '';
  return { cookie, csrf: (res.body as { csrfToken: string }).csrfToken, body: res.body as Record<string, unknown> };
}

export async function clinicId(db: PGlite, slug: string): Promise<string> {
  const r = await db.query<{ id: string }>('select id from clinics where slug = $1', [slug]);
  return r.rows[0]?.id ?? '';
}

let keyCounter = 0;

/** Creates a pending booking through the PUBLIC API; returns ids and the one-time credentials. */
export async function createBooking(
  app: ReturnType<typeof createApp>,
  db: PGlite,
  over: Record<string, unknown> = {},
): Promise<{ id: string; reference: string; secret: string }> {
  const res = await request(app)
    .post('/api/v1/public/booking-requests')
    .set('Idempotency-Key', `staff-test-key-${String(++keyCounter).padStart(8, '0')}-abcdef`)
    .send({ clinicId: 'demo-clinic-a', ageBand: '18_plus', preferredDate: '2026-11-03', preferredWindow: 'morning', acknowledgedDisclosure: true, ...over });
  if (res.status !== 201) throw new Error(`booking create failed: ${res.status} ${JSON.stringify(res.body)}`);
  const { reference, secret } = res.body as { reference: string; secret: string };
  const row = await db.query<{ id: string }>('select id from booking_requests where reference = $1', [reference]);
  return { id: row.rows[0]?.id ?? '', reference, secret };
}
