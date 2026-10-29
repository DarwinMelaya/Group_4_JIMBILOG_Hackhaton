import { z } from 'zod';

const bool = z.enum(['true', 'false']).transform((v) => v === 'true');

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().int().min(0).max(65535).default(3001),
  DEMO_MODE: bool.default(true),
  CLINICAL_CONTENT_APPROVED: bool.default(false),
  ALLOW_REAL_BOOKING_REQUESTS: bool.default(false),
  REAL_MINOR_BOOKING_ENABLED: bool.default(false),
  NOTIFICATION_TRANSPORT: z.literal('mock').default('mock'),
  REAL_NOTIFICATIONS_ENABLED: bool.default(false),
  PGLITE_DATA_DIR: z.string().optional(),
});

export type AppEnv = z.infer<typeof EnvSchema>;

/** Parse and validate environment. Throws on invalid or unsafe combinations. */
export function loadEnv(source: Record<string, string | undefined> = process.env): AppEnv {
  const cleaned: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(source)) cleaned[k] = v === '' ? undefined : v;
  const env = EnvSchema.parse(cleaned);
  if (env.REAL_NOTIFICATIONS_ENABLED) throw new Error('REAL_NOTIFICATIONS_ENABLED must be false (mock transport only)');
  if (env.REAL_MINOR_BOOKING_ENABLED) throw new Error('REAL_MINOR_BOOKING_ENABLED must be false (approved SOP artifact missing)');
  if (env.ALLOW_REAL_BOOKING_REQUESTS) throw new Error('ALLOW_REAL_BOOKING_REQUESTS must be false in this prototype');
  if ((env.NODE_ENV === 'staging' || env.NODE_ENV === 'production') && env.DEMO_MODE) {
    throw new Error('DEMO_MODE must be false in staging/production');
  }
  return env;
}
