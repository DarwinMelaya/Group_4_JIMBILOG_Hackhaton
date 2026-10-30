import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * DEMO-only HMAC key so a local demo works with no configuration. It protects nothing real (all data is fictitious) and
 * is refused outside DEMO_MODE: staging/production must provide BOOKING_SECRET_KEY (>= 32 chars).
 */
export const DEMO_BOOKING_KEY = 'kalinga-demo-only-booking-hmac-key-not-a-secret';

/** Resolve the HMAC key, or undefined when none is available (booking endpoints then answer 503). */
export function resolveBookingKey(env: { DEMO_MODE: boolean; BOOKING_SECRET_KEY?: string | undefined }): Buffer | undefined {
  if (env.BOOKING_SECRET_KEY) return Buffer.from(env.BOOKING_SECRET_KEY, 'utf8');
  return env.DEMO_MODE ? Buffer.from(DEMO_BOOKING_KEY, 'utf8') : undefined;
}

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Public, non-secret reference: 'KAL-' + 10 base32 characters (50 bits from the CSPRNG, unbiased: 256 % 32 === 0). */
export function generateReference(): string {
  const bytes = randomBytes(10);
  let out = '';
  for (const b of bytes) out += BASE32[b % 32];
  return `KAL-${out}`;
}

/** Independent 256-bit access secret (base64url, 43 chars). Shown once; only an HMAC of it is stored. */
export function generateSecret(): string {
  return randomBytes(32).toString('base64url');
}

/** HMAC-SHA256 hex with domain separation, used for secrets, references and idempotency keys alike. */
export function hmacHex(key: Buffer, domain: 'secret' | 'reference' | 'idempotency' | 'fingerprint', value: string): string {
  return createHmac('sha256', key).update(`${domain}\u0000${value}`).digest('hex');
}

/** Constant-time comparison of two equal-length hex digests (never short-circuits on content). */
export function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  if (ba.length !== bb.length || ba.length === 0) return false;
  return timingSafeEqual(ba, bb);
}
