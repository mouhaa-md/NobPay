import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildBeneficiary, friendlyError, sandboxGateway, toSenegalNumber } from '@/server/bitnob/client';
import { GatewayError } from '@/server/bitnob/types';
import { hmacHex } from '@/server/crypto';

/** Replays real (cleaned) Bitnob sandbox answers recorded on 2026-10-18, see docs/CONTEXTE-PROJET.md § 8.2. */
const fixture = (name: string) => JSON.parse(readFileSync(path.join(__dirname, 'fixtures/bitnob', `${name}.json`), 'utf8'));

interface Call {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
}
let calls: Call[];
let replies: { status: number; json: unknown }[];

beforeEach(() => {
  calls = [];
  replies = [];
  vi.stubEnv('BITNOB_MODE', 'sandbox');
  vi.stubEnv('BITNOB_CLIENT_ID', 'test-client');
  vi.stubEnv('BITNOB_CLIENT_SECRET', 'test-secret');
  vi.stubEnv('BITNOB_BASE_URL', 'https://api.example.test');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ method: String(init.method), url, headers: init.headers as Record<string, string>, body: String(init.body ?? '') });
      const r = replies.shift();
      if (!r) throw new Error(`unexpected request ${init.method} ${url}`);
      if (r.status === 0) throw new TypeError('fetch failed'); // no answer at all: network cut or timeout
      return new Response(JSON.stringify(r.json), { status: r.status });
    }),
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const reply = (name: string, status = 200) => replies.push({ status, json: fixture(name) });
const supplier = { name: 'Quincaillerie Ndiaye', network: 'wave' as const, phone: '+221 77 654 32 10' };
const sender = { name: 'Aminata Sow', country: 'FR' };

describe('request signing', () => {
  it('signs every call with the four X-Auth headers over CLIENT_ID:TIMESTAMP:NONCE:PAYLOAD', async () => {
    reply('invoice-create', 201);
    await sandboxGateway.createInvoice({ amountSats: 1000, description: 'NobPay probe', reference: 'nobpay:probe:001', expirySeconds: 3600 });
    const [c] = calls;
    const h = c.headers;
    expect(h['X-Auth-Client']).toBe('test-client');
    expect(h['X-Auth-Nonce']).toMatch(/^[0-9a-f]{32}$/);
    expect(h['X-Auth-Signature']).toBe(hmacHex('sha256', 'test-secret', `test-client:${h['X-Auth-Timestamp']}:${h['X-Auth-Nonce']}:${c.body}`));
    expect(h['Content-Type']).toBe('application/json');
  });

  it('signs an empty payload for a GET', async () => {
    reply('invoice-get-pending');
    await sandboxGateway.invoiceStatus('abc');
    const h = calls[0].headers;
    expect(calls[0].body).toBe('');
    expect(h['X-Auth-Signature']).toBe(hmacHex('sha256', 'test-secret', `test-client:${h['X-Auth-Timestamp']}:${h['X-Auth-Nonce']}:`));
  });
});

describe('Lightning', () => {
  it('creates an invoice: amount in sats, expiry in seconds, reads request / id / payment_hash / expires_at', async () => {
    reply('invoice-create', 201);
    const inv = await sandboxGateway.createInvoice({ amountSats: 1000, description: 'NobPay probe', reference: 'nobpay:probe:001', expirySeconds: 3600 });
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toBe('https://api.example.test/api/lightning/invoices');
    expect(JSON.parse(calls[0].body)).toEqual({ amount: 1000, description: 'NobPay probe', reference: 'nobpay:probe:001', expiry: 3600 });
    expect(inv).toEqual({
      id: '00000000-0000-4000-8000-0000000000b1',
      bolt11: expect.stringMatching(/^lntb/), // testnet, never lnbc
      paymentHash: '24d7bc97d51fecd6acea01297aff51137fb7603a5cc7a816051536bcbcb9d48b',
      expiresAt: '2026-10-18T01:53:25Z',
    });
  });

  it('reports a pending invoice as pending even though Bitnob already shows a preimage', async () => {
    reply('invoice-get-pending');
    expect(await sandboxGateway.invoiceStatus('x')).toEqual({ status: 'pending', preimage: undefined });
  });

  it('picks the BTC/USDT price among the listed pairs', async () => {
    reply('prices');
    expect(await sandboxGateway.btcUsd()).toBe(81584.95);
  });
});

describe('payout quote', () => {
  it('asks for a USDT -> XOF quote with a payment reason and reads data.payout', async () => {
    reply('payout-quote');
    const q = await sandboxGateway.quotePayout({ amountUsdCents: 10_000, reference: 'nobpay:pay:s1:test' });
    expect(JSON.parse(calls[0].body)).toEqual({
      amount: '100.00',
      country: 'SN',
      from_asset: 'USDT',
      to_currency: 'XOF',
      source: 'offchain',
      payment_reason: 'vendor_payment',
      reference: 'nobpay:pay:s1:test',
    });
    expect(q).toMatchObject({
      quoteId: 'QT2_21053046',
      amountUsdCents: 10_000,
      amountFcfa: 59_341, // settlement_amount 59341.08
      rate: 593.4108, // effective rate, consistent with the amount the supplier receives
      feeUsdCents: 0,
      mode: 'sandbox',
    });
  });

  it('refuses an amount over the mobile money limit with a clear French message', async () => {
    reply('error-over-limit', 400);
    await expect(sandboxGateway.quotePayout({ amountUsdCents: 600_000, reference: 'r' })).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: expect.stringContaining("dépasse la limite d'un paiement mobile money (200 000 XOF)"),
    });
  });
});

describe('payout start: initialize then finalize', () => {
  const quote = { quoteId: 'QT2_21053046', reference: 'nobpay:pay:s1:test', amountUsdCents: 10_000, rate: 593.41, feeUsdCents: 0, amountFcfa: 59_341, expiresAt: '2099-01-01T00:00:00Z', mode: 'sandbox' as const };

  it('sends the beneficiary with network code, normalised number and the sender group; keeps the payout id', async () => {
    reply('payout-initialize');
    reply('payout-get-initiated'); // stand-in for the finalize answer: same data.payout shape
    const res = await sandboxGateway.startPayout({ quote, reference: quote.reference, supplier, sender, reason: 'vendor_payment', callbackUrl: 'https://example.test/api/webhooks/bitnob' });

    expect(calls.map((c) => `${c.method} ${c.url.replace('https://api.example.test', '')}`)).toEqual([
      'POST /api/payouts/QT2_21053046/initialize',
      'POST /api/payouts/QT2_21053046/finalize',
    ]);
    expect(JSON.parse(calls[0].body)).toEqual({
      quote_id: 'QT2_21053046',
      reference: 'nobpay:pay:s1:test',
      payment_reason: 'vendor_payment',
      callback_url: 'https://example.test/api/webhooks/bitnob',
      beneficiary: {
        destination_type: 'mobile_money',
        country: 'SN',
        account_name: 'Quincaillerie Ndiaye',
        account_number: '+221776543210',
        network: 'wave',
        sender: { account_name: 'Aminata Sow', country: 'FR' },
      },
    });
    expect(calls[1].body).toBe('');
    expect(res).toEqual({ payoutId: '00000000-0000-4000-8000-0000000000a1', status: 'initiated' });
  });

  it('turns the missing-funds answer into a clear message and a code the app can test', async () => {
    reply('payout-initialize');
    reply('error-insufficient-funds', 422);
    await expect(sandboxGateway.startPayout({ quote, reference: quote.reference, supplier, sender, reason: 'vendor_payment' })).rejects.toMatchObject({
      status: 422,
      code: 'INSUFFICIENT_FUNDS',
      message: expect.stringContaining('Solde insuffisant'),
    });
  });

  it.each([
    ['network cut or timeout (no answer)', 0, 'error-insufficient-funds'],
    ['server error 503', 503, 'error-auth-failed'],
  ])('reports an unconfirmed finalize (%s) as uncertain instead of failing: the debit may have happened', async (_label, status) => {
    reply('payout-initialize');
    replies.push({ status, json: fixture('error-auth-failed') });
    const res = await sandboxGateway.startPayout({ quote, reference: quote.reference, supplier, sender, reason: 'vendor_payment' });
    expect(res).toEqual({ payoutId: '00000000-0000-4000-8000-0000000000a1', status: 'pending', uncertain: true });
  });

  it('still treats a 4xx on finalize as a definite refusal', async () => {
    reply('payout-initialize');
    reply('error-insufficient-funds', 422);
    const err = await sandboxGateway.startPayout({ quote, reference: quote.reference, supplier, sender, reason: 'x' }).catch((e) => e);
    expect(err).toBeInstanceOf(GatewayError);
    expect(err.ambiguous).toBe(false);
  });

  it('does not call Bitnob at all when the supplier number is not a Senegalese mobile', async () => {
    await expect(sandboxGateway.startPayout({ quote, reference: 'r', supplier: { ...supplier, phone: '+33612345678' }, sender, reason: 'x' })).rejects.toMatchObject({ code: 'invalid_beneficiary' });
    expect(calls).toHaveLength(0);
  });

  it('reads a payout by its id from data.payout', async () => {
    reply('payout-get-initiated');
    expect(await sandboxGateway.payoutStatus('00000000-0000-4000-8000-0000000000a1')).toEqual({ status: 'initiated', error: undefined });
    expect(calls[0].url).toBe('https://api.example.test/api/payouts/00000000-0000-4000-8000-0000000000a1');
  });
});

describe('finding a payout by our reference', () => {
  it('matches the reference in the list, a bare quote included, and maps statuses', async () => {
    reply('payouts-list');
    expect(await sandboxGateway.findPayoutByReference('nobpay:pay:s1:test')).toEqual({ payoutId: '00000000-0000-4000-8000-0000000000a1', status: 'initiated', error: undefined });
    expect(calls[0].url).toBe('https://api.example.test/api/payouts?limit=100');
    reply('payouts-list');
    expect(await sandboxGateway.findPayoutByReference('nobpay:pay:s2:test')).toMatchObject({ status: 'initiated' }); // QUOTE = not finalized
  });

  it('returns null when Bitnob does not know the reference', async () => {
    reply('payouts-list');
    expect(await sandboxGateway.findPayoutByReference('nobpay:pay:other')).toBeNull();
  });
});

describe('beneficiary and error helpers', () => {
  it('accepts the three accepted forms of a Senegalese mobile number (Bitnob pattern) and nothing else', () => {
    expect(toSenegalNumber('771234567')).toBe('771234567');
    expect(toSenegalNumber('77 123 45 67')).toBe('771234567');
    expect(toSenegalNumber('+221 77 123 45 67')).toBe('+221771234567');
    expect(() => toSenegalNumber('+221 33 123 45 67')).toThrowError(GatewayError); // landline
    expect(() => toSenegalNumber('12345')).toThrowError(/invalide/);
  });

  it('maps the three mobile money networks to the codes Bitnob lists for SN', () => {
    const net = (n: 'wave' | 'orange_money' | 'free_money') => buildBeneficiary({ ...supplier, network: n }, sender).network;
    expect([net('wave'), net('orange_money'), net('free_money')]).toEqual(['wave', 'orange', 'free']);
  });

  it('explains authentication and whitelist failures, and keeps the raw reason for unknown errors', () => {
    expect(friendlyError(403, fixture('error-ip-not-whitelisted'), 'GET', '/x')).toMatch(/liste d'adresses IP/);
    expect(friendlyError(401, fixture('error-auth-failed'), 'GET', '/x')).toMatch(/authentification/);
    expect(friendlyError(400, fixture('error-sender-required'), 'POST', '/api/payouts/q/initialize')).toContain('sender: Sender is required');
    expect(friendlyError(500, {}, 'GET', '/x')).toBe('Bitnob 500 sur GET /x : 500');
  });
});
