import { z } from 'zod';

const bool = z.enum(['true', 'false']).transform((v) => v === 'true');

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().int().min(0).max(65535).default(3001),
  DEMO_MODE: bool.default(true),
  CLINICAL_CONTENT_APPROVED: bool.default(false),
  /** Reference to the clinical approval evidence (document id or review record). Required when CLINICAL_CONTENT_APPROVED=true. */
  CLINICAL_CONTENT_EVIDENCE_REF: z.string().trim().min(1).max(200).optional(),
  ALLOW_REAL_BOOKING_REQUESTS: bool.default(false),
  REAL_MINOR_BOOKING_ENABLED: bool.default(false),
  NOTIFICATION_TRANSPORT: z.literal('mock').default('mock'),
  REAL_NOTIFICATIONS_ENABLED: bool.default(false),
  PGLITE_DATA_DIR: z.string().optional(),
  /** HMAC key for booking secret verifiers, references and idempotency keys (>= 32 chars). Optional only in DEMO_MODE, where a fixed DEMO key is used. */
  /** Interface to bind. Defaults to 127.0.0.1 when DEMO_MODE=true (DEMO data is never exposed on the network) and 0.0.0.0 otherwise. */
  HOST: z.string().trim().min(1).max(100).optional(),
  /** Reverse-proxy hops to trust for req.ip (rate limiters). 0 = trust none (default); only raise it behind a known proxy. */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  BOOKING_SECRET_KEY: z.string().min(32).max(256).optional(),
});

export type AppEnv = z.infer<typeof EnvSchema>;

/** The interface the server binds to (see HOST). */
export function resolveHost(env: Pick<AppEnv, 'DEMO_MODE' | 'HOST'>): string {
  return env.HOST ?? (env.DEMO_MODE ? '127.0.0.1' : '0.0.0.0');
}

export function isLoopbackHost(host: string): boolean {
  return host === '127.0.0.1' || host === 'localhost' || host === '::1' || host.startsWith('127.');
}

/** Parse and validate environment. Throws on invalid or unsafe combinations. */
export function loadEnv(source: Record<string, string | undefined> = process.env): AppEnv {
  const cleaned: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(source)) cleaned[k] = v === '' ? undefined : v;
  const env = EnvSchema.parse(cleaned);
  if (env.REAL_NOTIFICATIONS_ENABLED) throw new Error('REAL_NOTIFICATIONS_ENABLED must be false (mock transport only)');
  if (env.REAL_MINOR_BOOKING_ENABLED) throw new Error('REAL_MINOR_BOOKING_ENABLED must be false (approved SOP artifact missing)');
  if (env.ALLOW_REAL_BOOKING_REQUESTS) throw new Error('ALLOW_REAL_BOOKING_REQUESTS must be false in this prototype');
  if (env.CLINICAL_CONTENT_APPROVED && env.DEMO_MODE) {
    throw new Error('CLINICAL_CONTENT_APPROVED must be false while DEMO_MODE is true (demo content is never clinically approved)');
  }
  if (env.CLINICAL_CONTENT_APPROVED && !env.CLINICAL_CONTENT_EVIDENCE_REF) {
    throw new Error('CLINICAL_CONTENT_APPROVED=true requires CLINICAL_CONTENT_EVIDENCE_REF (reference to the approval evidence)');
  }
  if ((env.NODE_ENV === 'staging' || env.NODE_ENV === 'production') && env.DEMO_MODE) {
    throw new Error('DEMO_MODE must be false in staging/production');
  }
  return env;
}
