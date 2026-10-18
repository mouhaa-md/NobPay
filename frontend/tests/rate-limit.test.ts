import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { clientIp, enforce, hit, LIMITS, resetRateLimits } from '@/server/rateLimit';

const jar = vi.hoisted(() => new Map<string, { value: string }>());
vi.mock('next/headers', () => ({
  cookies: () => ({
    get: (n: string) => (jar.has(n) ? { name: n, value: jar.get(n)!.value } : undefined),
    set: (n: string, value: string) => void jar.set(n, { value }),
    delete: (n: string) => void jar.delete(n),
  }),
}));

const req = (headers: Record<string, string> = {}, body: unknown = {}) =>
  new Request('http://localhost/x', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

beforeAll(() => {
  process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), 'nobpay-rate-'));
});
beforeEach(() => {
  resetRateLimits();
  vi.stubEnv('BITNOB_MODE', 'mock');
  vi.stubEnv('ALLOW_DEMO', '');
});
afterEach(() => vi.unstubAllEnvs());

describe('limiter', () => {
  it('lets max hits through inside a window, then refuses with a wait time', () => {
    const t = 1_000_000;
    for (let i = 0; i < 3; i++) expect(hit('k', 3, 60_000, t + i).ok).toBe(true);
    const v = hit('k', 3, 60_000, t + 10);
    expect(v.ok).toBe(false);
    expect(v.retryAfterSec).toBeGreaterThan(55);
    expect(v.retryAfterSec).toBeLessThanOrEqual(60);
  });

  it('starts a fresh window afterwards, and keys do not share their count', () => {
    const t = 5_000_000;
    for (let i = 0; i < 4; i++) hit('a', 3, 1000, t);
    expect(hit('a', 3, 1000, t + 500).ok).toBe(false);
    expect(hit('a', 3, 1000, t + 1001).ok).toBe(true);
    expect(hit('b', 3, 1000, t + 500).ok).toBe(true);
  });

  it('throws a French 429 with Retry-After information', () => {
    for (let i = 0; i < 2; i++) enforce('x', 2, 60_000);
    try {
      enforce('x', 2, 60_000, 'Trop de codes demandés');
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toMatchObject({ status: 429, code: 'rate_limited', message: expect.stringMatching(/^Trop de codes demandés\. Réessayez dans \d+ (secondes|minutes)\.$/) });
      expect((e as { retryAfter: number }).retryAfter).toBeGreaterThan(0);
    }
  });

  it('is switched off by RATE_LIMIT=0', () => {
    vi.stubEnv('RATE_LIMIT', '0');
    for (let i = 0; i < 50; i++) expect(hit('off', 1, 60_000).ok).toBe(true);
  });
});

describe('client address behind proxies', () => {
  it('takes the entry added by our own proxy (right-most by default), not what the client wrote', () => {
    expect(clientIp(req({ 'x-forwarded-for': '6.6.6.6, 203.0.113.9' }))).toBe('203.0.113.9');
    expect(clientIp(req({ 'x-forwarded-for': '203.0.113.9' }))).toBe('203.0.113.9');
  });
  it('honours TRUSTED_PROXY_HOPS and falls back to "local" with no proxy', () => {
    vi.stubEnv('TRUSTED_PROXY_HOPS', '2');
    expect(clientIp(req({ 'x-forwarded-for': '6.6.6.6, 203.0.113.9, 10.0.0.1' }))).toBe('203.0.113.9');
    expect(clientIp(req())).toBe('local');
  });
});

describe('routes', () => {
  it('SMS code requests: 429 per phone after the limit, other numbers unaffected, Retry-After set', async () => {
    const { POST } = await import('@/app/api/auth/otp/route');
    for (let i = 0; i < LIMITS.otpPhone.max; i++) expect((await POST(req({}, { phone: '+221771111111' }))).status).toBe(200);
    const blocked = await POST(req({}, { phone: '+221771111111' }));
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
    expect((await blocked.json()).error).toContain('ce numéro');
    expect((await POST(req({}, { phone: '+221772222222' }))).status).toBe(200);
  });

  it('SMS code requests: also limited per client address', async () => {
    const { POST } = await import('@/app/api/auth/otp/route');
    const ip = { 'x-forwarded-for': '198.51.100.7' };
    for (let i = 0; i < LIMITS.otpIp.max; i++) expect((await POST(req(ip, { phone: `+2217730000${String(i).padStart(2, '0')}` }))).status).toBe(200);
    expect((await POST(req(ip, { phone: '+221779999999' }))).status).toBe(429);
  });

  it('sign-in attempts: limited per phone', async () => {
    const { POST } = await import('@/app/api/auth/login/route');
    for (let i = 0; i < LIMITS.authPhone.max; i++) expect((await POST(req({}, { phone: '+221700000000', otp: '000000' }))).status).toBe(400); // wrong code
    expect((await POST(req({}, { phone: '+221700000000', otp: '000000' }))).status).toBe(429);
  });

  it('public anchor refresh: at most one real check per anchor every 20 seconds', async () => {
    const { POST } = await import('@/app/api/anchors/[id]/refresh/route');
    const ctx = { params: { id: 'a_unknown' } };
    expect((await POST(req(), ctx)).status).toBe(404); // reaches the service
    const second = await POST(req(), ctx);
    expect(second.status).toBe(429);
    expect((await second.json()).error).toContain('vient d\'être vérifié');
  });

  it('webhook receiver: a very large burst from one address is slowed down with a 429 (Bitnob retries)', async () => {
    const { POST } = await import('@/app/api/webhooks/bitnob/route');
    vi.stubEnv('BITNOB_WEBHOOK_SECRET', 'whsec_rate');
    for (let i = 0; i < LIMITS.webhook.max; i++) hit('webhook:local', LIMITS.webhook.max, LIMITS.webhook.windowMs);
    const res = await POST(req({ 'x-bitnob-signature': 'x' }, { event: 'ping' }));
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBeTruthy();
  });
});
