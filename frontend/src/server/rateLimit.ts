import { HttpError } from './http';

/**
 * In-memory fixed-window rate limiter. One process only (like the JSON database): swap `store` for Redis
 * when the app runs on several instances. Disabled with RATE_LIMIT=0 (tests, local debugging).
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const g = globalThis as unknown as { __nobpayRate?: Map<string, Bucket> };
const store: Map<string, Bucket> = (g.__nobpayRate ??= new Map());

export interface Verdict {
  ok: boolean;
  retryAfterSec: number;
}

/** Counts one hit for `key`. Returns ok=false once more than `max` hits happened inside `windowMs`. */
export function hit(key: string, max: number, windowMs: number, now = Date.now()): Verdict {
  if (process.env.RATE_LIMIT === '0') return { ok: true, retryAfterSec: 0 };
  if (store.size > 10_000) {
    for (const [k, b] of store) if (b.resetAt <= now) store.delete(k);
  }
  let b = store.get(key);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + windowMs };
    store.set(key, b);
  }
  b.count += 1;
  return { ok: b.count <= max, retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
}

export function resetRateLimits(): void {
  store.clear();
}

const humanWait = (sec: number) => (sec < 90 ? `${sec} secondes` : `${Math.ceil(sec / 60)} minutes`);

/** Throws a 429 (French message, Retry-After) when the limit for `key` is exceeded. */
export function enforce(key: string, max: number, windowMs: number, what = 'Trop de tentatives'): void {
  const v = hit(key, max, windowMs);
  if (!v.ok) throw new HttpError(429, `${what}. Réessayez dans ${humanWait(v.retryAfterSec)}.`, 'rate_limited', v.retryAfterSec);
}

/**
 * Client address behind proxies. X-Forwarded-For is only trustworthy for the entries our own proxies add, so we take
 * the entry `TRUSTED_PROXY_HOPS` from the right (default 1: a single tunnel / load balancer in front of the app).
 */
export function clientIp(request: Request): string {
  const hops = Math.max(1, Number(process.env.TRUSTED_PROXY_HOPS) || 1);
  const parts = (request.headers.get('x-forwarded-for') ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return 'local';
  return parts[Math.max(0, parts.length - hops)];
}

const MIN = 60_000;
const HOUR = 60 * MIN;

/** The limits, in one place. `ip` limits are per client address, the others per account / phone / token. */
export const LIMITS = {
  otpPhone: { max: 5, windowMs: 10 * MIN },
  otpIp: { max: 20, windowMs: 10 * MIN },
  authIp: { max: 20, windowMs: 10 * MIN },
  authPhone: { max: 8, windowMs: 10 * MIN },
  demoIp: { max: 30, windowMs: 10 * MIN },
  proof: { max: 20, windowMs: 10 * MIN },
  anchorRefreshIp: { max: 30, windowMs: 10 * MIN },
  anchorRefreshEach: { max: 1, windowMs: 20_000 },
  anchorCreate: { max: 10, windowMs: HOUR },
  projectCreate: { max: 20, windowMs: HOUR },
  fundingCreate: { max: 30, windowMs: HOUR },
  publicRead: { max: 120, windowMs: MIN },
  fileRead: { max: 300, windowMs: MIN },
  webhook: { max: 600, windowMs: MIN },
} as const;
