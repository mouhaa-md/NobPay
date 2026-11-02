import { createHash, randomBytes } from 'node:crypto';
import { decodeBolt11 } from '@/server/lightning/bolt11';
import { WalletError, type LightningWallet, type WalletInvoice, type WalletNetwork, type WalletTx } from '@/server/lightning/wallet';
import { encodeBolt11 } from './bolt11';

export const sha256Hex = (hex: string) => createHash('sha256').update(Buffer.from(hex, 'hex')).digest('hex');

/**
 * 'fail-in-flight' and 'fail-but-paid': the wallet says "the payment failed" while the payment is in fact still on its way,
 * or already settled (some wallets do): NobPay must not believe the failure before looking the payment up.
 */
export type PayMode = 'ok' | 'fail' | 'insufficient' | 'timeout-not-sent' | 'timeout-sent' | 'bad-proof' | 'fail-in-flight' | 'fail-but-paid';

interface Incoming {
  amountSats: number;
  preimage: string;
  expiresAtMs: number;
  settled: boolean;
  reportedSats?: number;
  badPreimage?: boolean;
}

/** An in-memory Lightning wallet whose behaviour each test controls. It speaks the same interface as the NWC adapter. */
export class FakeWallet implements LightningWallet {
  readonly kind = 'fake';
  network: WalletNetwork = 'mainnet';
  balance = 5_000_000;
  pubkey = 'aa'.repeat(32);
  payMode: PayMode = 'ok';
  failLookups = false;
  readonly incoming = new Map<string, Incoming>();
  readonly outgoing = new Map<string, { state: 'settled' | 'pending' | 'failed'; preimage: string; feesSats: number; amountSats: number }>();
  /** preimages of invoices issued by OTHER parties (a supplier's domain): a test registers them so `pay` can prove payment */
  private readonly known = new Map<string, string>();
  readonly paid: string[] = [];
  makeInvoiceCalls = 0;
  now = () => Date.now();

  async info() {
    return { network: this.network, alias: 'fake', pubkey: this.pubkey, methods: ['make_invoice', 'lookup_invoice', 'pay_invoice', 'get_balance'] };
  }

  async balanceSats() {
    return this.balance;
  }

  async makeInvoice(input: { amountSats: number; description: string; expirySeconds: number }): Promise<WalletInvoice> {
    this.makeInvoiceCalls += 1;
    const preimage = randomBytes(32).toString('hex');
    const paymentHash = sha256Hex(preimage);
    const expiresAtMs = this.now() + input.expirySeconds * 1000;
    const bolt11 = encodeBolt11({
      amountMsat: BigInt(input.amountSats) * 1000n,
      paymentHash,
      description: input.description,
      expiry: input.expirySeconds,
      timestamp: Math.floor(this.now() / 1000),
      network: this.network === 'unknown' ? 'mainnet' : this.network,
    });
    this.incoming.set(paymentHash, { amountSats: input.amountSats, preimage, expiresAtMs, settled: false });
    return { bolt11, paymentHash, amountSats: input.amountSats, expiresAt: new Date(expiresAtMs).toISOString() };
  }

  /** Someone paid the invoice. `reportedSats` and `badPreimage` let a test make the wallet report something wrong. */
  settle(paymentHash: string, opts: { reportedSats?: number; badPreimage?: boolean } = {}) {
    const inv = this.incoming.get(paymentHash);
    if (!inv) throw new Error('unknown invoice');
    inv.settled = true;
    inv.reportedSats = opts.reportedSats;
    inv.badPreimage = opts.badPreimage;
    this.balance += inv.amountSats;
  }

  knowInvoice(paymentHash: string, preimage: string) {
    this.known.set(paymentHash, preimage);
  }

  /** The preimage a test registered for an invoice of another party (to make its payment settle later). */
  preimageFor(paymentHash: string): string | undefined {
    return this.known.get(paymentHash);
  }

  /** After `pay` has run, the wallet stops answering lookups (a wallet that went away right after a doubtful answer). */
  failLookupsAfterPay = false;

  private complete(paymentHash: string, amountSats: number) {
    const preimage = this.known.get(paymentHash);
    if (!preimage) throw new Error('test did not register this invoice');
    this.outgoing.set(paymentHash, { state: 'settled', preimage, feesSats: 1, amountSats });
    this.balance -= amountSats + 1;
    return preimage;
  }

  async lookup(paymentHash: string): Promise<WalletTx | null> {
    if (this.failLookups) throw new WalletError('Le portefeuille Lightning ne répond pas.', 'timeout');
    const inv = this.incoming.get(paymentHash);
    if (inv) {
      const state = inv.settled ? 'settled' : this.now() > inv.expiresAtMs ? 'expired' : 'pending';
      return {
        direction: 'incoming',
        state,
        paymentHash,
        amountSats: inv.reportedSats ?? inv.amountSats,
        feesSats: 0,
        preimage: inv.settled ? (inv.badPreimage ? 'ee'.repeat(32) : inv.preimage) : undefined,
        settledAt: inv.settled ? new Date().toISOString() : undefined,
      };
    }
    const out = this.outgoing.get(paymentHash);
    if (out) return { direction: 'outgoing', state: out.state, paymentHash, amountSats: out.amountSats, feesSats: out.feesSats, preimage: out.state === 'settled' ? out.preimage : undefined };
    return null;
  }

  async pay(bolt11: string) {
    const d = decodeBolt11(bolt11);
    const sats = Number((d.amountMsat ?? 0n) / 1000n);
    this.paid.push(bolt11);
    switch (this.payMode) {
      case 'fail':
        throw new WalletError('Le paiement Lightning a échoué (aucune route).', 'payment_failed');
      case 'insufficient':
        throw new WalletError('Le portefeuille Lightning n’a pas assez de fonds.', 'insufficient_balance');
      case 'fail-in-flight':
        this.outgoing.set(d.paymentHash, { state: 'pending', preimage: '', feesSats: 0, amountSats: sats });
        if (this.failLookupsAfterPay) this.failLookups = true;
        throw new WalletError('Le paiement Lightning a échoué (aucune route).', 'payment_failed');
      case 'fail-but-paid':
        this.complete(d.paymentHash, sats);
        throw new WalletError('Le paiement Lightning a échoué (aucune route).', 'payment_failed');
      case 'timeout-not-sent':
        throw new WalletError('Le portefeuille Lightning ne répond pas.', 'timeout', true);
      case 'timeout-sent':
        this.complete(d.paymentHash, sats);
        throw new WalletError('Le portefeuille Lightning ne répond pas.', 'timeout', true);
      case 'bad-proof':
        throw new WalletError('Le portefeuille n’a pas fourni de preuve de paiement valable.', 'internal', true);
      default:
        return { preimage: this.complete(d.paymentHash, sats), feesSats: 1 };
    }
  }
}
