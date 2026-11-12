import { createHash } from 'node:crypto';
import { HttpError } from './http';

/**
 * In-memory fixed-window rate limiter. One process only (like the JSON database): swap `store` for Redis
 * when the app runs on several instances. Disabled with RATE_LIMIT=0 (tests, local debugging).
 *
 * The table has to stay small even when somebody tries to fill it: some keys contain what a caller sent (a path segment,
 * a token header), so long keys are shortened, expired buckets are dropped regularly (not on every request), and the table
 * has a ceiling.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const g = globalThis as unknown as { __nobpayRate?: Map<string, Bucket> };
const store: Map<string, Bucket> = (g.__nobpayRate ??= new Map());

/** Longest key kept as it is; a longer one is replaced by its SHA-256 (a caller-chosen key cannot weigh kilobytes in the table). */
const MAX_KEY_CHARS = 96;
/** Expired buckets are looked for at most this often, and only once the table has this many entries. */
const SWEEP_EVERY_MS = 30_000;
const SWEEP_FROM = 1_000;
/** Ceiling of the table. When it is full of live buckets, the oldest short-lived ones go first (never a daily cap such as the SMS budget). */
export const MAX_RATE_KEYS = 20_000;
const SHORT_WINDOW_MS = 60 * 60_000;
let lastSweep = 0;

export interface Verdict {
  ok: boolean;
  retryAfterSec: number;
}

const compact = (key: string): string => (key.length <= MAX_KEY_CHARS ? key : `h:${createHash('sha256').update(key).digest('hex')}`);

function dropExpired(now: number): void {
  lastSweep = now;
  for (const [k, b] of store) if (b.resetAt <= now) store.delete(k);
}

/** Room for one more key: expired buckets first, then a tenth of the table (oldest first, short windows only). */
function makeRoom(now: number): void {
  dropExpired(now);
  if (store.size < MAX_RATE_KEYS) return;
  let toDrop = Math.ceil(MAX_RATE_KEYS / 10);
  for (const [k, b] of store) {
    if (toDrop <= 0) break;
    if (b.resetAt - now <= SHORT_WINDOW_MS) {
      store.delete(k);
      toDrop -= 1;
    }
  }
}

/** Counts one hit for `key`. Returns ok=false once more than `max` hits happened inside `windowMs`. */
export function hit(key: string, max: number, windowMs: number, now = Date.now()): Verdict {
  if (process.env.RATE_LIMIT === '0') return { ok: true, retryAfterSec: 0 };
  const id = compact(key);
  if (store.size >= SWEEP_FROM && now - lastSweep >= SWEEP_EVERY_MS) dropExpired(now);
  let b = store.get(id);
  if (!b || b.resetAt <= now) {
    if (!b && store.size >= MAX_RATE_KEYS) makeRoom(now);
    b = { count: 0, resetAt: now + windowMs };
    store.delete(id); // a renewed window goes to the back of the table: the front holds the oldest
    store.set(id, b);
  }
  b.count += 1;
  return { ok: b.count <= max, retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
}

export function resetRateLimits(): void {
  store.clear();
  lastSweep = 0;
}

/** How many keys are tracked (tests and diagnostics). */
export function rateLimitSize(): number {
  return store.size;
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
  refund: { max: 10, windowMs: HOUR },
  push: { max: 20, windowMs: 10 * MIN },
  projectEdit: { max: 40, windowMs: HOUR },
  contribute: { max: 12, windowMs: HOUR },
  witness: { max: 30, windowMs: 10 * MIN },
  // each Lightning quote calls the supplier's domain and asks our wallet for its balance
  quote: { max: 20, windowMs: 10 * MIN },
  aiReview: { max: 10, windowMs: HOUR },
  guestIp: { max: 10, windowMs: HOUR },
  // wipes the whole demo instance: a judge may reset a few times, a script must not do it in a loop
  devReset: { max: 10, windowMs: HOUR },
  publicRead: { max: 120, windowMs: MIN },
  fileRead: { max: 300, windowMs: MIN },
  webhook: { max: 600, windowMs: MIN },
} as const;
