import { createHash, randomBytes } from 'node:crypto';
import type { NWCClient } from '@getalby/sdk/nwc';
import {
  Nip47NetworkError,
  Nip47PublishError,
  Nip47PublishTimeoutError,
  Nip47ReplyTimeoutError,
  Nip47ResponseValidationError,
  Nip47WalletError,
} from '@getalby/sdk/nwc';
import { describe, expect, it, vi } from 'vitest';
import { mapWalletError, nwcWallet } from '@/server/lightning/nwc';
import { WalletError } from '@/server/lightning/wallet';
import { encodeBolt11 } from './helpers/bolt11';

const sha256Hex = (hex: string) => createHash('sha256').update(Buffer.from(hex, 'hex')).digest('hex');
const newSecret = () => {
  const preimage = randomBytes(32).toString('hex');
  return { preimage, paymentHash: sha256Hex(preimage) };
};
const invoiceFor = (paymentHash: string, sats: number, extra: { expiry?: number } = {}) =>
  encodeBolt11({ amountMsat: BigInt(sats) * 1000n, paymentHash, description: 'NobPay', expiry: extra.expiry ?? 3600, timestamp: Math.floor(Date.now() / 1000), network: 'mainnet' });

/** A stand-in for the SDK client: each test says what the wallet answers. */
function stubClient(overrides: Partial<Record<'getInfo' | 'getBalance' | 'makeInvoice' | 'lookupInvoice' | 'payInvoice' | 'close', unknown>> = {}) {
  const fn = (name: string) => (overrides[name as keyof typeof overrides] as ReturnType<typeof vi.fn> | undefined) ?? vi.fn(async () => { throw new Error(`${name} not stubbed`); });
  const client = { getInfo: fn('getInfo'), getBalance: fn('getBalance'), makeInvoice: fn('makeInvoice'), lookupInvoice: fn('lookupInvoice'), payInvoice: fn('payInvoice'), close: fn('close') };
  return { client, wallet: nwcWallet('nostr+walletconnect://unused', { client: client as unknown as NWCClient, now: () => Date.parse('2026-11-02T10:00:00Z') }) };
}
const rejects = async (p: Promise<unknown>) => (await p.then(() => null, (e: unknown) => e)) as WalletError;

describe('wallet information', () => {
  it.each([
    ['mainnet', 'mainnet'], ['bitcoin', 'mainnet'], ['Main', 'mainnet'], ['testnet', 'testnet'], ['testnet4', 'testnet'],
    ['signet', 'signet'], ['regtest', 'regtest'], ['', 'unknown'], ['liquid', 'unknown'],
  ])('network %j is %s', async (raw, expected) => {
    const { wallet } = stubClient({ getInfo: vi.fn(async () => ({ network: raw, alias: 'Hub', pubkey: 'ab'.repeat(32), methods: ['pay_invoice'] })) });
    await expect(wallet.info()).resolves.toMatchObject({ network: expected, alias: 'Hub', pubkey: 'ab'.repeat(32), methods: ['pay_invoice'] });
  });

  it('reads the balance in satoshis (the protocol counts in millisatoshis, never rounded up)', async () => {
    const { wallet } = stubClient({ getBalance: vi.fn(async () => ({ balance: 12_345_999 })) });
    await expect(wallet.balanceSats()).resolves.toBe(12_345);
  });
});

describe('making an invoice', () => {
  it('asks in millisatoshis and returns what the invoice itself says', async () => {
    const { paymentHash } = newSecret();
    const invoice = invoiceFor(paymentHash, 60_000);
    const makeInvoice = vi.fn(async () => ({ type: 'incoming', invoice, payment_hash: paymentHash }));
    const { wallet } = stubClient({ makeInvoice });
    const made = await wallet.makeInvoice({ amountSats: 60_000, description: 'NobPay · Essai', expirySeconds: 3600 });
    expect(makeInvoice).toHaveBeenCalledWith({ amount: 60_000_000, description: 'NobPay · Essai', expiry: 3600 });
    expect(made).toMatchObject({ bolt11: invoice, paymentHash, amountSats: 60_000 });
    expect(Date.parse(made.expiresAt) - Date.now()).toBeGreaterThan(3_500_000);
  });

  it('REFUSES an invoice for another amount than asked (a faulty or hostile wallet)', async () => {
    const { paymentHash } = newSecret();
    const { wallet } = stubClient({ makeInvoice: vi.fn(async () => ({ type: 'incoming', invoice: invoiceFor(paymentHash, 1_000), payment_hash: paymentHash })) });
    const err = await rejects(wallet.makeInvoice({ amountSats: 60_000, description: 'x', expirySeconds: 3600 }));
    expect(err).toBeInstanceOf(WalletError);
    expect(err.message).toContain('autre montant');
  });

  it('REFUSES an invoice whose payment hash differs from the one the wallet announced', async () => {
    const a = newSecret();
    const b = newSecret();
    const { wallet } = stubClient({ makeInvoice: vi.fn(async () => ({ type: 'incoming', invoice: invoiceFor(a.paymentHash, 5_000), payment_hash: b.paymentHash })) });
    const err = await rejects(wallet.makeInvoice({ amountSats: 5_000, description: 'x', expirySeconds: 3600 }));
    expect(err.message).toContain('incohérente');
  });

  it('turns a wallet error into a clear one', async () => {
    const { wallet } = stubClient({ makeInvoice: vi.fn(async () => { throw new Nip47WalletError('no', 'RESTRICTED'); }) });
    expect(await rejects(wallet.makeInvoice({ amountSats: 5_000, description: 'x', expirySeconds: 3600 }))).toMatchObject({ code: 'restricted', ambiguous: false });
  });
});

describe('looking a payment up', () => {
  const tx = (over: Record<string, unknown>) => ({ type: 'incoming', state: 'settled', invoice: '', payment_hash: 'h', amount: 60_000_000, fees_paid: 0, ...over });

  it('reads a settled incoming payment, with its proof and time', async () => {
    const { paymentHash, preimage } = newSecret();
    const { wallet } = stubClient({ lookupInvoice: vi.fn(async () => tx({ payment_hash: paymentHash, preimage, settled_at: 1_793_613_600 })) });
    expect(await wallet.lookup(paymentHash)).toEqual({
      direction: 'incoming', state: 'settled', paymentHash, amountSats: 60_000, feesSats: 0, preimage, settledAt: new Date(1_793_613_600_000).toISOString(),
    });
  });

  it('rounds the fees of a payment up (never understates what it cost)', async () => {
    const { wallet } = stubClient({ lookupInvoice: vi.fn(async () => tx({ type: 'outgoing', fees_paid: 1_001 })) });
    expect((await wallet.lookup('h'))!.feesSats).toBe(2);
  });

  it('an empty preimage is no preimage', async () => {
    const { wallet } = stubClient({ lookupInvoice: vi.fn(async () => tx({ state: 'pending', preimage: '' })) });
    expect((await wallet.lookup('h'))!.preimage).toBeUndefined();
  });

  it.each([
    ['settled', 'incoming', undefined, 'settled'],
    ['failed', 'outgoing', undefined, 'failed'],
    ['expired', 'incoming', undefined, 'expired'],
    ['pending', 'outgoing', undefined, 'pending'],
    ['pending', 'incoming', Date.parse('2026-11-02T11:00:00Z') / 1000, 'pending'],
    ['pending', 'incoming', Date.parse('2026-11-02T09:00:00Z') / 1000, 'expired'],
    [undefined, 'outgoing', Date.parse('2026-11-02T09:00:00Z') / 1000, 'pending'], // an unpaid payment never "expires" on its own
  ])('state %j (%s, expires %j) is %s', async (state, type, expiresAt, expected) => {
    const { wallet } = stubClient({ lookupInvoice: vi.fn(async () => tx({ state, type, expires_at: expiresAt })) });
    expect((await wallet.lookup('h'))!.state).toBe(expected);
  });

  it('a payment the wallet does not know is null, any other problem is an error', async () => {
    const unknown = stubClient({ lookupInvoice: vi.fn(async () => { throw new Nip47WalletError('not found', 'NOT_FOUND'); }) });
    expect(await unknown.wallet.lookup('h')).toBeNull();
    const down = stubClient({ lookupInvoice: vi.fn(async () => { throw new Nip47ReplyTimeoutError('late', 'TIMEOUT'); }) });
    expect(await rejects(down.wallet.lookup('h'))).toMatchObject({ code: 'timeout' });
  });
});

describe('paying an invoice', () => {
  it('returns the proof of payment only when it hashes to the invoice', async () => {
    const { paymentHash, preimage } = newSecret();
    const payInvoice = vi.fn(async () => ({ preimage: preimage.toUpperCase(), fees_paid: 1_500 }));
    const { wallet } = stubClient({ payInvoice });
    const bolt11 = invoiceFor(paymentHash, 5_000);
    expect(await wallet.pay(bolt11)).toEqual({ preimage, feesSats: 2 });
    expect(payInvoice).toHaveBeenCalledWith({ invoice: bolt11 });
  });

  it.each([
    ['another preimage', () => randomBytes(32).toString('hex')],
    ['no preimage', () => ''],
    ['a malformed preimage', () => 'not-hex'],
    ['a short preimage', () => 'ab'.repeat(16)],
  ])('%s is NOT a proof: the outcome stays "to look up", never "paid" and never "failed"', async (_name, fake) => {
    const { paymentHash } = newSecret();
    const { wallet } = stubClient({ payInvoice: vi.fn(async () => ({ preimage: fake(), fees_paid: 0 })) });
    const err = await rejects(wallet.pay(invoiceFor(paymentHash, 5_000)));
    expect(err).toBeInstanceOf(WalletError);
    expect(err.ambiguous).toBe(true);
  });

  it('refuses to send an unreadable invoice before asking the wallet anything', async () => {
    const { client, wallet } = stubClient();
    await expect(wallet.pay('lnbc1garbage')).rejects.toBeTruthy();
    expect(client.payInvoice).not.toHaveBeenCalled();
  });
});

describe('what a wallet error means for the money', () => {
  // A refusal the wallet states is definite: the money never left. Anything unclear on a payment is "look it up".
  it.each([
    [new Nip47WalletError('x', 'INSUFFICIENT_BALANCE'), 'insufficient_balance', false],
    [new Nip47WalletError('x', 'PAYMENT_FAILED'), 'payment_failed', false],
    [new Nip47WalletError('x', 'NOT_FOUND'), 'not_found', false],
    [new Nip47WalletError('x', 'RATE_LIMITED'), 'rate_limited', false],
    [new Nip47WalletError('x', 'QUOTA_EXCEEDED'), 'quota_exceeded', false],
    [new Nip47WalletError('x', 'RESTRICTED'), 'restricted', false],
    [new Nip47WalletError('x', 'UNAUTHORIZED'), 'unauthorized', false],
    [new Nip47WalletError('x', 'NOT_IMPLEMENTED'), 'unsupported', false],
    [new Nip47WalletError('x', 'INTERNAL'), 'internal', true],
    [new Nip47WalletError('x', 'OTHER'), 'internal', true],
    [new Nip47PublishError('no relay', 'OTHER', []), 'network', false], // never left this server
    [new Nip47NetworkError('offline', 'NETWORK_ERROR'), 'network', false],
    [new Nip47PublishTimeoutError('slow relay', 'TIMEOUT'), 'timeout', true],
    [new Nip47ReplyTimeoutError('no reply', 'TIMEOUT'), 'timeout', true],
    [new Nip47ResponseValidationError('weird answer', 'OTHER'), 'internal', true],
    [new Error('boom'), 'internal', true],
  ])('for a payment, %s -> %s (ambiguous: %s)', (err, code, ambiguous) => {
    expect(mapWalletError(err, true)).toMatchObject({ code, ambiguous });
  });

  it('a read-only request is never "ambiguous": nothing was at stake', () => {
    for (const err of [new Nip47ReplyTimeoutError('x', 'TIMEOUT'), new Nip47WalletError('x', 'INTERNAL'), new Error('boom')]) {
      expect(mapWalletError(err, false).ambiguous).toBe(false);
    }
  });

  it('an error that is already a WalletError is kept as it is', () => {
    const e = new WalletError('already', 'quota_exceeded');
    expect(mapWalletError(e, true)).toBe(e);
  });

  it('messages are in French and never repeat the wallet\'s raw text', () => {
    const msg = mapWalletError(new Nip47WalletError('secret relay detail wss://relay.example', 'PAYMENT_FAILED'), true).message;
    expect(msg).toMatch(/Le paiement Lightning a échoué/);
    expect(msg).not.toContain('wss://');
  });
});

describe('closing', () => {
  it('closes the connection it opened', () => {
    const { client, wallet } = stubClient();
    wallet.close!();
    expect(client.close).toHaveBeenCalled();
  });
});
