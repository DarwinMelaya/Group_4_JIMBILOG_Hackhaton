import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';

/**
 * Password hashing for staff accounts: scrypt with a per-user random salt (RFC 7914; OWASP-recommended family).
 * Stored form: `scrypt$N$r$p$<salt b64url>$<hash b64url>` so parameters can be raised later without a migration.
 */
export const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, keyLen: 64, saltLen: 16 } as const;
const MAX_N = 2 ** 17; // refuse absurd parameters from a corrupted row (memory/CPU guard)

function derive(password: string, salt: Buffer, N: number, r: number, p: number, keyLen: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password.normalize('NFKC'), salt, keyLen, { N, r, p, maxmem: 256 * N * r }, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const { N, r, p, keyLen, saltLen } = SCRYPT_PARAMS;
  const salt = randomBytes(saltLen);
  const key = await derive(password, salt, N, r, p, keyLen);
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

interface Parsed {
  N: number;
  r: number;
  p: number;
  salt: Buffer;
  hash: Buffer;
}

function parse(stored: string): Parsed | null {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return null;
  const [N, r, p] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  if (![N, r, p].every((n) => Number.isInteger(n) && n > 0) || N > MAX_N || (N & (N - 1)) !== 0 || r > 16 || p > 4) return null;
  const salt = Buffer.from(parts[4] ?? '', 'base64url');
  const hash = Buffer.from(parts[5] ?? '', 'base64url');
  if (salt.length < 8 || hash.length < 16) return null;
  return { N, r, p, salt, hash };
}

/** A well-formed hash of a random password, used to keep timing equal when the account does not exist. */
let dummy: Promise<string> | undefined;
export function dummyPasswordHash(): Promise<string> {
  dummy ??= hashPassword(randomBytes(18).toString('base64url'));
  return dummy;
}

/** Timing-safe verification. A malformed stored hash verifies as false (after doing equivalent work). */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parse(stored);
  if (!parsed) {
    await derive(password, randomBytes(SCRYPT_PARAMS.saltLen), SCRYPT_PARAMS.N, SCRYPT_PARAMS.r, SCRYPT_PARAMS.p, SCRYPT_PARAMS.keyLen);
    return false;
  }
  const key = await derive(password, parsed.salt, parsed.N, parsed.r, parsed.p, parsed.hash.length);
  return key.length === parsed.hash.length && timingSafeEqual(key, parsed.hash);
}
