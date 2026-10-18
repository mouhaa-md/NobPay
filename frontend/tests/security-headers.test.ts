import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';

const call = (method: string, headers: Record<string, string> = {}, url = 'http://localhost:3000/api/projects') =>
  middleware(new NextRequest(url, { method, headers }));
const blocked = async (r: Response) => r.status === 403 && (await r.json()).code === 'cross_site';

afterEach(() => vi.unstubAllEnvs());

describe('cross-site protection of the API', () => {
  it('refuses a state-changing request the browser says comes from another site', async () => {
    expect(await blocked(call('POST', { 'sec-fetch-site': 'cross-site', host: 'localhost:3000' }))).toBe(true);
    expect(await blocked(call('POST', { 'sec-fetch-site': 'same-site', host: 'localhost:3000' }))).toBe(true);
    expect(await blocked(call('DELETE', { 'sec-fetch-site': 'cross-site' }))).toBe(true);
  });

  it('refuses a foreign Origin, "null" included, even without Sec-Fetch-Site', async () => {
    expect(await blocked(call('POST', { origin: 'https://evil.example', host: 'localhost:3000' }))).toBe(true);
    expect(await blocked(call('POST', { origin: 'null', host: 'localhost:3000' }))).toBe(true);
    expect(await blocked(call('POST', { origin: 'not a url', host: 'localhost:3000' }))).toBe(true);
    expect(await blocked(call('POST', { origin: 'http://localhost:3000.evil.example', host: 'localhost:3000' }))).toBe(true);
  });

  it('lets same-origin browser calls through, whatever the way the host is reported', async () => {
    expect((await call('POST', { origin: 'http://localhost:3000', 'sec-fetch-site': 'same-origin', host: 'localhost:3000' })).status).toBe(200);
    // behind a tunnel the Host seen by the app can differ: x-forwarded-host and PUBLIC_BASE_URL are accepted
    expect((await call('POST', { origin: 'https://app.example.test', host: 'localhost:3000', 'x-forwarded-host': 'app.example.test' })).status).toBe(200);
    vi.stubEnv('PUBLIC_BASE_URL', 'https://app.example.test');
    expect((await call('POST', { origin: 'https://app.example.test', host: 'internal:3000' })).status).toBe(200);
  });

  it('does not touch server-to-server calls (no Origin, no Sec-Fetch-Site): webhooks stay protected by their signature', async () => {
    expect((await call('POST', {}, 'http://localhost:3000/api/webhooks/bitnob')).status).toBe(200);
  });

  it('never blocks reads', async () => {
    expect((await call('GET', { 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' })).status).toBe(200);
    expect((await call('HEAD', { 'sec-fetch-site': 'cross-site' })).status).toBe(200);
  });
});

describe('security headers (next.config.mjs)', () => {
  const load = async () => (await import(/* @vite-ignore */ ['..', 'next.config.mjs'].join('/'))) as { securityHeaders: { key: string; value: string }[] };

  it('sets the protective headers, with geolocation allowed for this origin only', async () => {
    const h = Object.fromEntries((await load()).securityHeaders.map((x) => [x.key, x.value]));
    expect(h['X-Content-Type-Options']).toBe('nosniff');
    expect(h['X-Frame-Options']).toBe('DENY');
    expect(h['Referrer-Policy']).toBe('same-origin');
    expect(h['Permissions-Policy']).toContain('geolocation=(self)');
    expect(h['Permissions-Policy']).toContain('camera=()');
    expect(h['Strict-Transport-Security']).toMatch(/max-age=\d+/);
  });

  it('has a CSP that allows nothing from other sites and no plugins or framing', async () => {
    const csp = (await load()).securityHeaders.find((x) => x.key === 'Content-Security-Policy')!.value;
    for (const d of ["default-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'", "connect-src 'self'"]) expect(csp).toContain(d);
    expect(csp).not.toMatch(/https?:\/\//); // no external origin is whitelisted
    expect(csp).not.toContain("script-src *");
  });
});
