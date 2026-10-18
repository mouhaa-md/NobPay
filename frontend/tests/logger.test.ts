import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logger, mask, scrub } from '@/server/logger';
import { respond, HttpError } from '@/server/http';
import { GatewayError } from '@/server/bitnob/types';

let lines: string[];
beforeEach(() => {
  lines = [];
  vi.spyOn(console, 'info').mockImplementation((l) => void lines.push(String(l)));
  vi.spyOn(console, 'warn').mockImplementation((l) => void lines.push(String(l)));
  vi.spyOn(console, 'error').mockImplementation((l) => void lines.push(String(l)));
});
afterEach(() => vi.restoreAllMocks());

describe('masking', () => {
  it('replaces the value of every sensitive key, at any depth and in any case', () => {
    const out = mask({
      ok: 1,
      BITNOB_CLIENT_SECRET: 'abc',
      headers: { Authorization: 'Bearer xyz', 'x-bitnob-signature': 'sig', cookie: 'c' },
      nested: [{ otp: '123456', preimage: 'ff', apiKey: 'k', password: 'p', webhookSecret: 's', sessionToken: 't' }],
    }) as Record<string, any>;
    expect(out.ok).toBe(1);
    expect(out.BITNOB_CLIENT_SECRET).toBe('[masqué]');
    expect(out.headers).toEqual({ Authorization: '[masqué]', 'x-bitnob-signature': '[masqué]', cookie: '[masqué]' });
    expect(Object.values(out.nested[0])).toEqual(Array(6).fill('[masqué]'));
  });

  it('scrubs keys and bearer tokens inside text, and cuts long strings', () => {
    const key = 'prd:sandbox_' + 'a1'.repeat(32);
    expect(scrub(`call failed with ${key}`)).toBe('call failed with prd:sandbox_***');
    expect(scrub('prd:live_deadbeef00')).toBe('prd:live_***');
    expect(scrub('Authorization: Bearer abc.def-ghi')).toBe('Authorization: Bearer ***');
    expect(scrub('x'.repeat(1000)).length).toBe(401);
  });

  it('survives circular data and very deep objects', () => {
    const a: Record<string, unknown> = { name: 'a' };
    a.self = a;
    expect(() => mask(a)).not.toThrow();
    expect(JSON.stringify(mask(a))).toContain('circulaire');
    let deep: Record<string, unknown> = { end: true };
    for (let i = 0; i < 20; i++) deep = { deeper: deep };
    expect(JSON.stringify(mask(deep))).toContain('profondeur max');
  });

  it('turns an Error into name, message and a short stack with secrets removed', () => {
    const err = new Error('boom prd:sandbox_' + 'b2'.repeat(10));
    const out = mask(err) as { name: string; message: string; stack: string };
    expect(out.name).toBe('Error');
    expect(out.message).toBe('boom prd:sandbox_***');
    expect(out.stack.split('\n').length).toBeLessThanOrEqual(6);
  });
});

describe('structured lines', () => {
  it('writes one JSON line per event with time, level and event, masked', () => {
    logger.warn('something', { fundingId: 'f_1', token: 'secret-value' });
    expect(lines).toHaveLength(1);
    const line = JSON.parse(lines[0]);
    expect(line).toMatchObject({ level: 'warn', event: 'something', fundingId: 'f_1', token: '[masqué]' });
    expect(Date.parse(line.time)).not.toBeNaN();
    expect(lines[0]).not.toContain('secret-value');
  });
});

describe('error answers never leak internals', () => {
  it('an unexpected error becomes a generic 500 with a reference, details only in the log', async () => {
    const res = await respond(async () => {
      throw new Error('ENOENT: /home/codespace/secret-path/db.json and prd:sandbox_' + 'c3'.repeat(16));
    });
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.code).toBe('internal');
    expect(body.error).toMatch(/référence [0-9a-f]{8}/);
    expect(JSON.stringify(body)).not.toMatch(/ENOENT|secret-path|prd:/);
    const logged = JSON.parse(lines.find((l) => l.includes('unhandled_error'))!);
    expect(logged.requestId).toBe(body.requestId);
    expect(logged.error.message).toContain('ENOENT');
    expect(lines.join('\n')).not.toContain('c3c3c3c3'); // the key was scrubbed even in the log
  });

  it('a payment provider error is a 502 with its French message, not a 500', async () => {
    const res = await respond(async () => {
      throw new GatewayError('Solde insuffisant côté Bitnob pour ce paiement.', 422, {}, 'INSUFFICIENT_FUNDS');
    });
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ code: 'gateway_error', error: 'Solde insuffisant côté Bitnob pour ce paiement.' });
  });

  it('known HttpErrors keep their status, message and Retry-After', async () => {
    const res = await respond(async () => {
      throw new HttpError(429, 'Trop de tentatives', 'rate_limited', 42);
    });
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('42');
    expect(lines).toHaveLength(0); // an expected refusal is not an error line
  });
});
