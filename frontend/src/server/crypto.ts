import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export function sha256Hex(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

export function hmacHex(algorithm: 'sha256' | 'sha512', key: string, data: string): string {
  return createHmac(algorithm, key).update(data).digest('hex');
}

export function randomId(prefix: string, bytes = 6): string {
  return `${prefix}_${randomBytes(bytes).toString('hex')}`;
}

export function randomToken(bytes = 16): string {
  return randomBytes(bytes).toString('hex');
}

/** Constant-time string comparison (different lengths return false without leaking position). */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/** Deterministic JSON used for hashing (the same code runs in the browser, see lib/canonical). */
export { canonicalize } from '@/lib/canonical';
