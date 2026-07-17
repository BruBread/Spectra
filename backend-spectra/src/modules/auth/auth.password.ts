import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

// promisify() resolves to scrypt's 3-argument overload and drops the options
// parameter, so the cost parameters below need a hand-rolled wrapper.
function scryptAsync(password: string, salt: Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

/**
 * Password hashing with scrypt from node's standard library.
 *
 * scrypt is memory-hard and is an accepted password KDF (OWASP lists it
 * alongside Argon2id), and using the built-in keeps the backend free of
 * native build steps — the same reason `webhook.auth.ts` already reaches for
 * node:crypto. Parameters below are the OWASP-referenced N=2^16 / r=8 / p=1
 * (~64 MiB, ~100ms per hash), which is fine for an endpoint that runs on
 * human login rather than per request.
 *
 * Hashes are stored self-describing (`scrypt$N$r$p$salt$key`) so these
 * parameters can be raised later without invalidating existing passwords.
 */
const SCRYPT_N = 65_536;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
// Node defaults maxmem to 32 MiB, which is below what these parameters need.
const MAX_MEM = 128 * SCRYPT_N * SCRYPT_R * 2;

const OPTIONS = { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: MAX_MEM };

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await scryptAsync(password, salt, KEY_LENGTH, OPTIONS);
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('hex')}$${key.toString('hex')}`;
}

/**
 * Verifies a password against a stored hash. Returns false rather than
 * throwing on a malformed/unknown hash so a corrupt record can't crash login.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, rawN, rawR, rawP, saltHex, keyHex] = parts;
  const N = Number(rawN);
  const r = Number(rawR);
  const p = Number(rawP);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(saltHex, 'hex');
    expected = Buffer.from(keyHex, 'hex');
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;

  try {
    const actual = await scryptAsync(password, salt, expected.length, {
      N,
      r,
      p,
      maxmem: 128 * N * r * 2,
    });
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
