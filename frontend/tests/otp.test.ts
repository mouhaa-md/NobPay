import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setSmsProviderForTests, twilioSmsProvider, type SmsProvider } from '@/server/sms';

const jar = vi.hoisted(() => new Map<string, { value: string }>());
vi.mock('next/headers', () => ({
  cookies: () => ({
    get: (n: string) => (jar.has(n) ? { name: n, value: jar.get(n)!.value } : undefined),
    set: (n: string, value: string) => void jar.set(n, { value }),
    delete: (n: string) => void jar.delete(n),
  }),
}));

let otp: typeof import('@/server/otp');
let auth: typeof import('@/server/auth');
let db: typeof import('@/server/db');

const sent: { to: string; text: string }[] = [];
const fakeProvider: SmsProvider = { name: 'fake', send: async (to, text) => void sent.push({ to, text }) };
const lastCode = () => /(\d{6})/.exec(sent[sent.length - 1].text)![1];
const wrongOf = (code: string) => (code === '000000' ? '111111' : '000000');
const ageOtps = (ms: number) =>
  db.withDb((d) => {
    for (const o of d.otps ?? []) {
      o.createdAt = new Date(Date.parse(o.createdAt) - ms).toISOString();
      o.expiresAt = new Date(Date.parse(o.expiresAt) - ms).toISOString();
    }
  });

beforeAll(async () => {
  process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), 'nobpay-otp-'));
  otp = await import('@/server/otp');
  auth = await import('@/server/auth');
  db = await import('@/server/db');
});
beforeEach(async () => {
  sent.length = 0;
  jar.clear();
  setSmsProviderForTests(fakeProvider);
  vi.stubEnv('BITNOB_MODE', 'mock');
  vi.stubEnv('SESSION_SECRET', 'a-long-random-secret-of-more-than-32-characters');
  await db.withDb((d) => void (d.otps = []));
});
afterEach(() => {
  setSmsProviderForTests(null);
  vi.unstubAllEnvs();
});

const PHONE = '+33611112222';
const OTHER = '+33633334444';

describe('real SMS codes', () => {
  it('sends a random 6-digit code by SMS, never returns it, and stores only a hash', async () => {
    const res = await otp.requestOtp(PHONE);
    expect(res).toEqual({ kind: 'sms', resendIn: 30 });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(PHONE);
    expect(lastCode()).toMatch(/^\d{6}$/);
    const stored = JSON.stringify((await db.readDb()).otps);
    expect(stored).not.toContain(lastCode() + '"'); // no plain code
    expect(stored).toContain('codeHash');
  });

  it('accepts the right code once, then refuses to reuse it', async () => {
    await otp.requestOtp(PHONE);
    const code = lastCode();
    await expect(otp.verifyOtp(PHONE, code)).resolves.toBeUndefined();
    await expect(otp.verifyOtp(PHONE, code)).rejects.toMatchObject({ status: 400, code: 'bad_otp' });
  });

  it('refuses a wrong code and counts attempts; the 6th try is locked even with the right code', async () => {
    await otp.requestOtp(PHONE);
    const code = lastCode();
    for (let i = 1; i <= 5; i++) {
      const err = await otp.verifyOtp(PHONE, wrongOf(code)).catch((e) => e);
      expect(err).toMatchObject({ status: 400, code: 'bad_otp' });
    }
    await expect(otp.verifyOtp(PHONE, code)).rejects.toMatchObject({ status: 429, code: 'otp_locked' });
  });

  it('tells how many tries are left', async () => {
    await otp.requestOtp(PHONE);
    const err = await otp.verifyOtp(PHONE, wrongOf(lastCode())).catch((e) => e);
    expect(err.message).toContain('4 essais restants');
  });

  it('expires after 5 minutes', async () => {
    await otp.requestOtp(PHONE);
    const code = lastCode();
    await ageOtps(5 * 60_000 + 1000);
    await expect(otp.verifyOtp(PHONE, code)).rejects.toMatchObject({ code: 'otp_expired' });
  });

  it('is only good for the phone it was sent to', async () => {
    await otp.requestOtp(PHONE);
    await otp.requestOtp(OTHER);
    const codeOther = lastCode();
    await expect(otp.verifyOtp(PHONE, codeOther)).rejects.toMatchObject({ code: 'bad_otp' });
    await expect(otp.verifyOtp(OTHER, codeOther)).resolves.toBeUndefined();
  });

  it('a new code replaces the old one, and a request too soon is refused with the wait time', async () => {
    await otp.requestOtp(PHONE);
    const first = lastCode();
    await expect(otp.requestOtp(PHONE)).rejects.toMatchObject({ status: 429, code: 'otp_too_soon', retryAfter: expect.any(Number) });
    await ageOtps(31_000);
    await otp.requestOtp(PHONE);
    const second = lastCode();
    if (second !== first) await expect(otp.verifyOtp(PHONE, first)).rejects.toMatchObject({ code: 'bad_otp' });
    await expect(otp.verifyOtp(PHONE, second)).resolves.toBeUndefined();
  });

  it('forgets the code when the SMS could not be sent, so the user can retry at once', async () => {
    setSmsProviderForTests({ name: 'broken', send: async () => Promise.reject(new Error('boom')) });
    await expect(otp.requestOtp(PHONE)).rejects.toThrow('boom');
    expect((await db.readDb()).otps).toHaveLength(0);
    setSmsProviderForTests(fakeProvider);
    await expect(otp.requestOtp(PHONE)).resolves.toMatchObject({ kind: 'sms' });
  });

  it('rejects a phone that is too short', async () => {
    await expect(otp.requestOtp('+33 1')).rejects.toMatchObject({ code: 'bad_phone' });
  });
});

describe('sign-up and sign-in use the per-user code', () => {
  it('two accounts cannot open each other with their codes, nor with the old shared code', async () => {
    vi.stubEnv('ALLOW_DEMO', '1');
    await otp.requestOtp('+33655550001');
    const a = lastCode();
    await otp.requestOtp('+33655550002');
    const b = lastCode();
    await auth.registerUser({ firstName: 'A', lastName: 'A', country: 'FR', phone: '+33655550001', otp: a });
    await expect(auth.registerUser({ firstName: 'B', lastName: 'B', country: 'FR', phone: '+33655550002', otp: a })).rejects.toMatchObject({ code: 'bad_otp' });
    await expect(auth.registerUser({ firstName: 'B', lastName: 'B', country: 'FR', phone: '+33655550002', otp: '123456' })).rejects.toMatchObject({ code: 'bad_otp' });
    await expect(auth.registerUser({ firstName: 'B', lastName: 'B', country: 'FR', phone: '+33655550002', otp: b })).resolves.toMatchObject({ phone: '+33655550002' });
  });

  it('signing in needs a fresh code each time', async () => {
    await otp.requestOtp('+33655550001');
    const code = lastCode();
    await expect(auth.loginUser({ phone: '+33655550001', otp: code })).resolves.toMatchObject({ phone: '+33655550001' });
    await expect(auth.loginUser({ phone: '+33655550001', otp: code })).rejects.toMatchObject({ code: 'bad_otp' });
  });
});

describe('demo mode (no SMS provider)', () => {
  beforeEach(() => setSmsProviderForTests(null));

  it('returns the shared demo code when ALLOW_DEMO permits, and accepts only that', async () => {
    vi.stubEnv('ALLOW_DEMO', '1');
    expect(await otp.requestOtp(PHONE)).toEqual({ kind: 'demo', demoCode: '123456' });
    await expect(otp.verifyOtp(PHONE, '123456')).resolves.toBeUndefined();
    await expect(otp.verifyOtp(PHONE, '654321')).rejects.toMatchObject({ code: 'bad_otp' });
  });

  it('has no code at all when demo is refused', async () => {
    vi.stubEnv('BITNOB_MODE', 'sandbox');
    vi.stubEnv('ALLOW_DEMO', '');
    await expect(otp.requestOtp(PHONE)).rejects.toMatchObject({ status: 503, code: 'sms_unavailable' });
    await expect(otp.verifyOtp(PHONE, '123456')).rejects.toMatchObject({ status: 503 });
  });
});

describe('Twilio provider', () => {
  it('posts a form-encoded message with basic auth, and turns failures into a French error', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response('{}', { status: calls.length === 1 ? 201 : 400 });
    }));
    const p = twilioSmsProvider({ accountSid: 'ACtest', authToken: 'tok', from: '+15005550006' });
    await p.send('+221771234567', 'hello');
    expect(calls[0].url).toBe('https://api.twilio.com/2010-04-01/Accounts/ACtest/Messages.json');
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from('ACtest:tok').toString('base64')}`);
    expect(String(calls[0].init.body)).toBe('To=%2B221771234567&From=%2B15005550006&Body=hello');
    await expect(p.send('+221771234567', 'x')).rejects.toMatchObject({ status: 502, code: 'sms_failed' });
    vi.unstubAllGlobals();
  });
});
