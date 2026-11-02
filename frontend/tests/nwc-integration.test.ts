import { createHash, randomBytes } from 'node:crypto';
import type { NWCWalletService, NWCWalletServiceRequestHandler, Nip47Transaction } from '@getalby/sdk/nwc';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { decodeBolt11 } from '@/server/lightning/bolt11';
import { WalletError, type LightningWallet } from '@/server/lightning/wallet';
import { nwcUrlProblem } from '@/server/startup';
import { encodeBolt11 } from './helpers/bolt11';
import { FakeRelayNetwork } from './helpers/fakeRelay';

/**
 * NobPay's NWC adapter against a REAL NIP-47 wallet service (the one in Alby's SDK), talking over relay events with the
 * real encryption: only the relay and the money are simulated. It checks what the stub-client tests cannot: that the
 * messages our adapter sends are understood by a wallet, that its answers are read right, and the millisatoshi arithmetic.
 */

const RELAY = 'wss://relay.nwc-test.example';
const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');
const sha256Hex = (h: string) => createHash('sha256').update(Buffer.from(h, 'hex')).digest('hex');
const now = () => Math.floor(Date.now() / 1000);

/** A wallet with a balance and a few invoices, behind the NIP-47 request handler. */
class TestWallet {
  balanceMsat = 5_000_000_000; // 5 000 000 sats
  readonly incoming = new Map<string, Nip47Transaction & { preimage: string }>();
  readonly outgoing = new Map<string, Nip47Transaction>();
  payMode: 'ok' | 'insufficient' | 'failed' | 'internal' | 'wrong-preimage' = 'ok';
  /** preimages of invoices that other wallets made, so we can pay them */
  readonly known = new Map<string, string>();
  makeInvoiceAmountOffsetMsat = 0;

  handler(): NWCWalletServiceRequestHandler {
    return {
      getInfo: async () => ({ result: { alias: 'Test wallet', color: '#ffffff', pubkey: 'ab'.repeat(32), network: 'mainnet', block_height: 1, block_hash: '', methods: ['get_info', 'get_balance', 'make_invoice', 'lookup_invoice', 'pay_invoice'] }, error: undefined }),
      getBalance: async () => ({ result: { balance: this.balanceMsat }, error: undefined }),
      makeInvoice: async (req) => {
        const preimage = randomBytes(32).toString('hex');
        const paymentHash = sha256Hex(preimage);
        const invoice = encodeBolt11({ amountMsat: BigInt(req.amount + this.makeInvoiceAmountOffsetMsat), paymentHash, description: req.description ?? '', expiry: req.expiry ?? 3600, timestamp: now(), network: 'mainnet' });
        const tx = { type: 'incoming', state: 'pending', invoice, description: req.description ?? '', description_hash: '', preimage, payment_hash: paymentHash, amount: req.amount, fees_paid: 0, settled_at: 0, created_at: now(), expires_at: now() + (req.expiry ?? 3600) } satisfies Nip47Transaction;
        this.incoming.set(paymentHash, tx);
        return { result: tx, error: undefined };
      },
      lookupInvoice: async (req) => {
        const tx = (req.payment_hash && (this.incoming.get(req.payment_hash) ?? this.outgoing.get(req.payment_hash))) || undefined;
        return tx ? { result: tx, error: undefined } : { result: undefined, error: { code: 'NOT_FOUND', message: 'unknown payment' } };
      },
      payInvoice: async (req) => {
        const decoded = decodeBolt11(req.invoice);
        const amountMsat = Number(decoded.amountMsat ?? 0n);
        if (this.payMode === 'insufficient' || this.balanceMsat < amountMsat + 1000) return { result: undefined, error: { code: 'INSUFFICIENT_BALANCE', message: 'not enough' } };
        if (this.payMode === 'failed') return { result: undefined, error: { code: 'PAYMENT_FAILED', message: 'no route' } };
        if (this.payMode === 'internal') return { result: undefined, error: { code: 'INTERNAL', message: 'oops' } };
        const preimage = this.payMode === 'wrong-preimage' ? randomBytes(32).toString('hex') : this.known.get(decoded.paymentHash);
        if (!preimage) return { result: undefined, error: { code: 'PAYMENT_FAILED', message: 'unknown invoice' } };
        this.balanceMsat -= amountMsat + 1500;
        this.outgoing.set(decoded.paymentHash, { type: 'outgoing', state: 'settled', invoice: req.invoice, description: '', description_hash: '', preimage, payment_hash: decoded.paymentHash, amount: amountMsat, fees_paid: 1500, settled_at: now(), created_at: now(), expires_at: 0 });
        return { result: { preimage, fees_paid: 1500 }, error: undefined };
      },
    };
  }
}

let net: FakeRelayNetwork;
let service: NWCWalletService;
let unsubscribe: () => void;
let wallet: TestWallet;
let adapter: LightningWallet;
let url: string;
const realWebSocket = globalThis.WebSocket;

beforeAll(async () => {
  net = new FakeRelayNetwork();
  // The SDK takes the global WebSocket the moment it is LOADED, so the fake relay goes in first and the SDK (and our
  // adapter, which imports it) is imported after.
  vi.stubGlobal('WebSocket', net.WebSocketImpl);
  const { NWCWalletService, NWCWalletServiceKeyPair } = await import('@getalby/sdk/nwc');
  const { nwcWallet } = await import('@/server/lightning/nwc');

  const walletSecret = hex(generateSecretKey());
  const clientSecret = hex(generateSecretKey());
  const keypair = new NWCWalletServiceKeyPair(walletSecret, getPublicKey(Buffer.from(clientSecret, 'hex')));
  url = `nostr+walletconnect://${keypair.walletPubkey}?relay=${encodeURIComponent(RELAY)}&secret=${clientSecret}`;

  wallet = new TestWallet();
  service = new NWCWalletService({ relayUrls: [RELAY] });
  await service.publishWalletServiceInfoEvent(walletSecret, ['get_info', 'get_balance', 'make_invoice', 'lookup_invoice', 'pay_invoice'], []);
  unsubscribe = await service.subscribe(keypair, wallet.handler());
  adapter = nwcWallet(url);
}, 30_000);

afterAll(() => {
  adapter?.close?.();
  unsubscribe?.();
  service?.close();
  vi.stubGlobal('WebSocket', realWebSocket);
});
afterEach(() => {
  wallet.payMode = 'ok';
  wallet.makeInvoiceAmountOffsetMsat = 0;
});

describe('the connection string', () => {
  it('is one our startup check accepts', () => {
    expect(nwcUrlProblem(url)).toBeNull();
  });
});

describe('NobPay\'s NWC adapter talking to a real NIP-47 wallet service', () => {
  it('reads the wallet\'s information', async () => {
    expect(await adapter.info()).toMatchObject({ network: 'mainnet', alias: 'Test wallet', pubkey: 'ab'.repeat(32), methods: expect.arrayContaining(['pay_invoice', 'make_invoice']) });
  }, 30_000);

  it('reads the balance in satoshis, from millisatoshis', async () => {
    wallet.balanceMsat = 12_345_999;
    expect(await adapter.balanceSats()).toBe(12_345);
    wallet.balanceMsat = 5_000_000_000;
  }, 30_000);

  it('makes an invoice for the amount asked, in the right unit', async () => {
    const inv = await adapter.makeInvoice({ amountSats: 60_000, description: 'NobPay · Essai', expirySeconds: 3600 });
    expect(decodeBolt11(inv.bolt11).amountMsat).toBe(60_000_000n);
    expect(inv).toMatchObject({ amountSats: 60_000 });
    expect(inv.paymentHash).toBe(decodeBolt11(inv.bolt11).paymentHash);
    expect(wallet.incoming.get(inv.paymentHash)!.amount).toBe(60_000_000); // the wallet received millisatoshis
    expect(Date.parse(inv.expiresAt) - Date.now()).toBeGreaterThan(3_500_000);
  }, 30_000);

  it('refuses an invoice for another amount than asked, even from a real wallet service', async () => {
    wallet.makeInvoiceAmountOffsetMsat = 1_000_000;
    await expect(adapter.makeInvoice({ amountSats: 5_000, description: 'x', expirySeconds: 3600 })).rejects.toMatchObject({ code: 'internal', message: expect.stringContaining('autre montant') });
  }, 30_000);

  it('looks an incoming payment up while it is pending, then once it is settled, and an unknown one as null', async () => {
    const inv = await adapter.makeInvoice({ amountSats: 10_000, description: 'x', expirySeconds: 3600 });
    expect(await adapter.lookup(inv.paymentHash)).toMatchObject({ direction: 'incoming', state: 'pending', amountSats: 10_000 });

    const tx = wallet.incoming.get(inv.paymentHash)!;
    wallet.incoming.set(inv.paymentHash, { ...tx, state: 'settled', settled_at: now() });
    const settled = await adapter.lookup(inv.paymentHash);
    expect(settled).toMatchObject({ direction: 'incoming', state: 'settled', amountSats: 10_000 });
    expect(sha256Hex(settled!.preimage!)).toBe(inv.paymentHash); // the proof of payment comes through

    expect(await adapter.lookup('00'.repeat(32))).toBeNull();
  }, 30_000);

  describe('paying an invoice', () => {
    const supplierInvoice = (sats: number) => {
      const preimage = randomBytes(32).toString('hex');
      const paymentHash = sha256Hex(preimage);
      wallet.known.set(paymentHash, preimage);
      return { bolt11: encodeBolt11({ amountMsat: BigInt(sats) * 1000n, paymentHash, description: 'Paiement à moussa', expiry: 600, timestamp: now(), network: 'mainnet' }), paymentHash, preimage };
    };

    it('pays, and returns the proof of payment with the fees rounded up to satoshis', async () => {
      const inv = supplierInvoice(60_000);
      const paid = await adapter.pay(inv.bolt11);
      expect(paid).toEqual({ preimage: inv.preimage, feesSats: 2 }); // 1 500 msat
      expect(sha256Hex(paid.preimage)).toBe(inv.paymentHash);
      expect(wallet.outgoing.get(inv.paymentHash)!.amount).toBe(60_000_000);
    }, 30_000);

    it('then finds that payment again by its hash, the way recovery does', async () => {
      const inv = supplierInvoice(5_000);
      await adapter.pay(inv.bolt11);
      expect(await adapter.lookup(inv.paymentHash)).toMatchObject({ direction: 'outgoing', state: 'settled', amountSats: 5_000, feesSats: 2, preimage: inv.preimage });
    }, 30_000);

    it.each([
      ['insufficient', 'insufficient_balance', false],
      ['failed', 'payment_failed', false],
      ['internal', 'internal', true],
    ] as const)('a wallet that answers %s is %s (ambiguous: %s)', async (mode, code, ambiguous) => {
      wallet.payMode = mode;
      const err = (await adapter.pay(supplierInvoice(1_000).bolt11).catch((e) => e)) as WalletError;
      expect(err).toBeInstanceOf(WalletError);
      expect(err).toMatchObject({ code, ambiguous });
    }, 30_000);

    it('does NOT say "paid" when the wallet returns a preimage that does not match the invoice', async () => {
      wallet.payMode = 'wrong-preimage';
      const err = (await adapter.pay(supplierInvoice(1_000).bolt11).catch((e) => e)) as WalletError;
      expect(err).toBeInstanceOf(WalletError);
      expect(err.ambiguous).toBe(true); // to be looked up, never concluded either way
    }, 30_000);
  });
});
