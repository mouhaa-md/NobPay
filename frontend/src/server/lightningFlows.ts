import { createHash } from 'node:crypto';
import { escrowCents, type Db, type Funding, type Payout, type PayoutQuote, type Project, type Refund, type Step, type Supplier, type User } from '@/lib/types';
import { formatUsdShort, usdToSats } from '@/lib/money';
import { getConfig } from './config';
import { randomId } from './crypto';
import { readDb, withDb } from './db';
import { applyFundingPaid, applyPayoutCompleted, applyPayoutFailed, findProject } from './domain';
import { HttpError } from './http';
import { appendLedger } from './ledger';
import { getPayoutWallet, getReceiveWallet, walletNetwork, WalletError } from './lightning';
import { LnurlError, normalizeLightningAddress, requestInvoice } from './lightning/lnurl';
import { getBtcUsd } from './lightning/price';
import { logger } from './logger';

/**
 * Real Bitcoin, end to end: the funder pays a Lightning invoice made by NobPay's RECEIVE wallet, the supplier is paid
 * in sats at the Lightning address they gave, and unused escrow can go back to the funder. Every amount is decided by us
 * and every answer from a wallet or from another domain is checked before it counts:
 *  - a funding is credited once the wallet says the invoice is settled (never on a screen's word);
 *  - a payment is only believed with a preimage that hashes to the invoice (done in the wallet adapter);
 *  - a payment whose outcome is unknown keeps its money reserved and is looked up by payment hash (never repeated).
 */

/** How long a payout of unknown outcome is left alone before we conclude it was never sent. */
const UNCONFIRMED_GRACE_MS = 5 * 60_000;
/** The quote of a Lightning payout is short: the dollar amount is converted at this very moment. */
const QUOTE_SECONDS = 120;
/** Routing fees we keep in the wallet beyond the amount sent (the wallet may refuse a payment it cannot cover). */
const FEE_MARGIN = (sats: number) => Math.max(10, Math.ceil(sats * 0.02));

const sha256Hex = (hex: string) => createHash('sha256').update(Buffer.from(hex, 'hex')).digest('hex');
const domainOf = (address: string) => address.split('@')[1] ?? '';

/** The user may see a clear, French message for what went wrong with a wallet or an address. */
export function lightningHttpError(err: unknown): HttpError {
  if (err instanceof HttpError) return err;
  if (err instanceof LnurlError) {
    const status = err.code === 'bad_address' ? 400 : err.code === 'unreachable' ? 502 : 409;
    return new HttpError(status, err.message, 'lightning_address');
  }
  if (err instanceof WalletError) {
    const status = err.code === 'insufficient_balance' || err.code === 'quota_exceeded' ? 409 : 502;
    return new HttpError(status, err.message, err.code === 'insufficient_balance' ? 'insufficient_balance' : 'wallet_error');
  }
  logger.error('lightning_unexpected', { error: err });
  return new HttpError(502, 'Le portefeuille Bitcoin ne répond pas comme prévu. Réessayez dans un instant.', 'wallet_error');
}

function ownedProject(db: Db, owner: User, projectId: string): Project {
  const project = findProject(db, projectId);
  if (!project || project.ownerId !== owner.id) throw new HttpError(404, 'Projet introuvable');
  return project;
}

/** What real escrow the instance holds right now (what it owes), in dollar cents, counted from the books. */
export function realLiabilityCents(db: Db): number {
  const funded = db.fundings.filter((f) => f.status === 'paid' && f.mode === 'nwc').reduce((s, f) => s + f.amountCents, 0);
  let out = 0;
  for (const p of db.projects) for (const st of p.steps) if (st.payout && st.payout.mode === 'nwc' && st.payout.status !== 'failed') out += st.payout.amountUsdCents;
  const refunded = (db.refunds ?? []).filter((r) => r.rail === 'lightning' && r.status !== 'failed').reduce((s, r) => s + r.amountCents, 0);
  return Math.max(0, funded - out - refunded);
}

/* ------------------------------------------------------------------------- *
 * Funding
 * ------------------------------------------------------------------------- */

export async function createLightningFunding(owner: User, projectId: string, amountCents: number): Promise<Funding> {
  const cfg = getConfig();
  const wallet = getReceiveWallet();
  if (!wallet) throw new HttpError(503, 'Le portefeuille Bitcoin de cette instance n’est pas configuré.', 'lightning_unavailable');
  if (owner.demo) {
    throw new HttpError(403, 'Le compte de démonstration ne peut pas recevoir de vrais bitcoins. Essayez sans compte : un compte invité est privé.', 'demo_no_real_sats');
  }
  if (amountCents > cfg.lightning.maxFundingUsd * 100) {
    throw new HttpError(400, `Pendant cette phase pilote, un versement est limité à ${formatUsdShort(cfg.lightning.maxFundingUsd * 100)}.`, 'pilot_cap');
  }
  const db = await readDb();
  const project = ownedProject(db, owner, projectId);
  if (realLiabilityCents(db) + amountCents > cfg.lightning.maxEscrowUsd * 100) {
    throw new HttpError(409, `Le plafond de séquestre de la phase pilote (${formatUsdShort(cfg.lightning.maxEscrowUsd * 100)} en tout) est atteint. Réessayez plus tard.`, 'pilot_cap');
  }
  if (getWalletSolvency()?.violated) {
    throw new HttpError(503, 'Les versements sont suspendus : les soldes du portefeuille ne couvrent pas les séquestres. Contactez le support.', 'payments_paused');
  }

  const { usd: btcUsd } = await getBtcUsd();
  const amountSats = usdToSats(amountCents, btcUsd);
  let invoice;
  try {
    invoice = await wallet.makeInvoice({ amountSats, description: `NobPay · ${project.name}`.slice(0, 100), expirySeconds: cfg.fundingInvoiceTtlSeconds });
  } catch (err) {
    throw lightningHttpError(err);
  }

  const id = randomId('f', 5);
  const funding: Funding = {
    id,
    projectId,
    amountCents,
    method: 'lightning',
    status: 'pending',
    reference: `nobpay:fund:${id}`,
    mode: 'nwc',
    createdAt: new Date().toISOString(),
    invoiceId: invoice.paymentHash,
    bolt11: invoice.bolt11,
    paymentHash: invoice.paymentHash,
    amountSats,
    btcUsd,
    expiresAt: invoice.expiresAt,
  };
  await withDb((d) => {
    d.fundings.push(funding);
  });
  return funding;
}

/**
 * Asks the wallet whether a pending invoice was paid, and credits the escrow if so (once, at the amount of the invoice).
 * An invoice we already closed as `expired` is asked about too: a payment that landed in the last seconds of its life
 * can reach us after the clock closed it, and the funder's sats must not stay uncredited for that.
 */
export async function settleLightningFunding(fundingId: string): Promise<void> {
  const funding = (await readDb()).fundings.find((x) => x.id === fundingId);
  if (!funding || (funding.status !== 'pending' && funding.status !== 'expired') || funding.mode !== 'nwc' || !funding.paymentHash) return;
  const wallet = getReceiveWallet();
  if (!wallet) return;
  const tx = await wallet.lookup(funding.paymentHash);
  if (!tx || tx.direction !== 'incoming' || tx.state !== 'settled') return;
  if (funding.amountSats && tx.amountSats > 0 && tx.amountSats < funding.amountSats) {
    logger.warn('funding_amount_mismatch', { fundingId, expectedSats: funding.amountSats, reportedSats: tx.amountSats });
    await withDb((d) => {
      const x = d.fundings.find((y) => y.id === fundingId);
      if (x && (x.status === 'pending' || x.status === 'expired')) x.note = `Montant reçu différent : attendu ${funding.amountSats} sats, reçu ${tx.amountSats}.`;
    });
    return;
  }
  if (tx.preimage && sha256Hex(tx.preimage) !== funding.paymentHash) {
    logger.warn('funding_bad_preimage', { fundingId });
    return; // the wallet says "settled" with a proof that does not match the invoice: credit nothing
  }
  await withDb((d) => {
    const x = d.fundings.find((y) => y.id === fundingId);
    if (x) applyFundingPaid(d, x, { preimage: tx.preimage, at: tx.settledAt });
  });
}

const lastPolled = new Map<string, number>();
export const POLL_LIGHTNING_EVERY_MS = 3_000;

/** Every pending real invoice, at most once every 3 s each (the funding screen also asks, see refreshLightningFunding). */
export async function pollPendingLightningFundings(): Promise<void> {
  if (!getReceiveWallet()) return;
  const now = Date.now();
  let firstError: unknown;
  for (const f of (await readDb()).fundings) {
    if (f.mode !== 'nwc') continue;
    // pending: every few seconds; expired within the last day: once a minute, in case a late payment slipped through
    const recentlyExpired = f.status === 'expired' && Date.parse(f.expiresAt ?? f.createdAt) > now - 24 * 3_600_000;
    if (f.status !== 'pending' && !recentlyExpired) continue;
    if (now - (lastPolled.get(f.id) ?? 0) < (recentlyExpired ? 60_000 : POLL_LIGHTNING_EVERY_MS)) continue;
    lastPolled.set(f.id, now);
    try {
      await settleLightningFunding(f.id);
    } catch (err) {
      firstError ??= err; // one failing invoice must not stop the others
    }
  }
  if (firstError) throw firstError;
}

/* ------------------------------------------------------------------------- *
 * Paying a supplier at a Lightning address
 * ------------------------------------------------------------------------- */

export function assertLightningSupplier(supplier: Supplier): string {
  const address = normalizeLightningAddress(supplier.lightningAddress ?? '');
  if (!address) throw new HttpError(400, 'Indiquez l’adresse Lightning du fournisseur (exemple : nom@domaine.com).', 'invalid_input');
  return address;
}

async function assertPayoutsOpen(amountCents: number): Promise<void> {
  const cfg = getConfig();
  if (!getPayoutWallet()) throw new HttpError(409, 'Les paiements en Bitcoin Lightning ne sont pas activés sur cette instance.', 'lightning_payout_unavailable');
  if (amountCents > cfg.lightning.maxPayoutUsd * 100) {
    throw new HttpError(409, `Pendant cette phase pilote, un paiement est limité à ${formatUsdShort(cfg.lightning.maxPayoutUsd * 100)}.`, 'pilot_cap');
  }
  if (getWalletSolvency()?.violated) {
    throw new HttpError(503, 'Les paiements sont suspendus : les soldes du portefeuille ne couvrent pas les séquestres. Contactez le support.', 'payments_paused');
  }
}

/** The quote of a Lightning payout: the invoice of the supplier's domain, checked, for the dollar amount converted now. */
export async function quoteLightningPayout(step: Step, supplier: Supplier): Promise<PayoutQuote> {
  const cfg = getConfig();
  await assertPayoutsOpen(step.amountCents);
  const wallet = getPayoutWallet()!;
  const address = assertLightningSupplier(supplier);
  const { usd: btcUsd } = await getBtcUsd();
  const amountSats = usdToSats(step.amountCents, btcUsd);
  try {
    const balance = await wallet.balanceSats();
    if (balance < amountSats + FEE_MARGIN(amountSats)) {
      throw new HttpError(409, 'Le portefeuille de paiement de NobPay ne couvre pas encore ce paiement. Réessayez dans quelques minutes.', 'insufficient_balance');
    }
    const invoice = await requestInvoice(address, amountSats, { network: await walletNetwork(wallet) });
    const expiresAt = new Date(Math.min(Date.parse(invoice.expiresAt) - 20_000, Date.now() + QUOTE_SECONDS * 1000)).toISOString();
    return {
      quoteId: `ln_${randomId('q', 6)}`,
      reference: `nobpay:pay:${step.id}:${Date.now().toString(36)}`,
      amountUsdCents: step.amountCents,
      rate: cfg.usdXof,
      feeUsdCents: 0,
      amountFcfa: Math.round((step.amountCents / 100) * cfg.usdXof),
      expiresAt,
      mode: 'nwc',
      lightning: { amountSats, btcUsd, address, bolt11: invoice.bolt11, paymentHash: invoice.paymentHash, invoiceExpiresAt: invoice.expiresAt },
    };
  } catch (err) {
    throw lightningHttpError(err);
  }
}

/** The payout record written while the escrow is reserved, before any sat moves. */
export function buildLightningPayout(quote: PayoutQuote, supplier: Supplier, startedAt: string): Payout {
  const ln = quote.lightning!;
  return {
    reference: quote.reference,
    quoteId: quote.quoteId,
    payoutId: ln.paymentHash,
    status: 'initiated',
    amountUsdCents: quote.amountUsdCents,
    amountFcfa: quote.amountFcfa,
    rate: quote.rate,
    feeUsdCents: 0,
    supplier,
    mode: 'nwc',
    startedAt,
    lightning: { amountSats: ln.amountSats, btcUsd: ln.btcUsd, address: ln.address, bolt11: ln.bolt11, paymentHash: ln.paymentHash },
  };
}

/** What the public ledger says about a Lightning payout that started (the address itself stays private: only its domain). */
export function lightningPayoutLedger(payout: Payout): Record<string, unknown> {
  const ln = payout.lightning!;
  return { rail: 'lightning', amountSats: ln.amountSats, btcUsd: Math.round(ln.btcUsd), paymentHash: ln.paymentHash, lightningDomain: domainOf(ln.address) };
}

export type LightningSent = { kind: 'paid'; preimage: string; feesSats: number } | { kind: 'unconfirmed' };

/** Pays the invoice. A refusal throws (the money never left); an answer we cannot read says `unconfirmed` (look it up). */
export async function sendLightningPayment(quote: PayoutQuote): Promise<LightningSent> {
  const wallet = getPayoutWallet();
  if (!wallet || !quote.lightning) throw new WalletError('Les paiements Lightning ne sont pas activés.', 'unsupported');
  try {
    const paid = await wallet.pay(quote.lightning.bolt11);
    return { kind: 'paid', ...paid };
  } catch (err) {
    if (err instanceof WalletError && err.ambiguous) return { kind: 'unconfirmed' };
    throw err;
  }
}

/**
 * Finishes a Lightning payout still in flight, by asking the wallet about its payment hash:
 *  settled -> paid; failed -> back to "proof submitted"; unknown to the wallet for long enough -> it was never sent.
 * A payment the wallet still shows as pending keeps its money reserved: we never conclude "failed" while it may complete.
 */
export async function reconcileLightningPayout(projectId: string, stepId: string, payout: Payout, ageMs: number): Promise<void> {
  const wallet = getPayoutWallet();
  if (!wallet || !payout.lightning) return;
  const tx = await wallet.lookup(payout.lightning.paymentHash);
  const never = tx === null && ageMs > UNCONFIRMED_GRACE_MS;
  const proofOk = tx?.state === 'settled' && tx.direction === 'outgoing' && !!tx.preimage && sha256Hex(tx.preimage) === payout.lightning.paymentHash;
  await withDb((d) => {
    const p = findProject(d, projectId);
    const s = p?.steps.find((x) => x.id === stepId);
    if (!p || !s || s.status !== 'releasing' || s.payout?.reference !== payout.reference) return; // the step moved on meanwhile
    if (proofOk && tx) {
      applyPayoutCompleted(d, p, s, { payoutId: payout.payoutId, preimage: tx.preimage, feesSats: tx.feesSats });
    } else if (tx?.state === 'failed') {
      applyPayoutFailed(d, p, s, 'Paiement Lightning refusé par le réseau. Votre séquestre est intact : vous pouvez réessayer.');
    } else if (never) {
      applyPayoutFailed(d, p, s, 'Le paiement Lightning n’a pas été envoyé (la réponse du portefeuille a été perdue). Votre séquestre est intact : vous pouvez réessayer.');
    }
  });
}

/* ------------------------------------------------------------------------- *
 * Refund of unused escrow
 * ------------------------------------------------------------------------- */

export interface RefundInput {
  amountCents: number;
  address: string;
}

/**
 * Gives unused escrow back. The amount leaves the escrow first (a pending refund counts), then the sats are sent; a
 * failure puts the money back, an unknown outcome keeps it reserved until a lookup says. Simulated rails (mock and the
 * Bitnob sandbox) move no money and say so.
 */
export async function requestRefund(owner: User, projectId: string, input: RefundInput): Promise<Refund> {
  const cfg = getConfig();
  const real = cfg.lightning.rail === 'nwc';
  const address = normalizeLightningAddress(input.address);
  if (!address) throw new HttpError(400, 'Indiquez votre adresse Lightning (exemple : nom@domaine.com).', 'invalid_input');
  const amountCents = Math.round(input.amountCents);
  if (!Number.isFinite(amountCents) || amountCents < 100) throw new HttpError(400, 'Le remboursement minimum est de 1 $.', 'invalid_input');
  if (real) await assertPayoutsOpen(amountCents);

  const id = randomId('rf', 5);
  const startedAt = new Date().toISOString();
  // Phase 1: take the amount out of the escrow, in the books, before anything else
  await withDb((db) => {
    const project = ownedProject(db, owner, projectId);
    if (project.steps.some((s) => s.status === 'proof_submitted' || s.status === 'releasing')) {
      throw new HttpError(409, 'Une preuve attend votre décision ou un paiement est en cours : terminez-les avant de reprendre le séquestre.', 'decision_pending');
    }
    const escrow = escrowCents(db, project);
    if (amountCents > escrow) throw new HttpError(409, `Le séquestre disponible est de ${formatUsdShort(escrow)}.`, 'insufficient_escrow');
    const r: Refund = { id, projectId, amountCents, status: 'pending', reference: `nobpay:refund:${id}`, rail: real ? 'lightning' : 'simulated', address, createdAt: startedAt };
    (db.refunds ??= []).push(r);
    appendLedger(db, projectId, 'refund_started', { refundId: id, amountCents, rail: r.rail, lightningDomain: domainOf(address), ...(real ? {} : { simulated: true }) }, startedAt);
    return structuredClone(r);
  });

  if (!real) return finishRefund(projectId, id, { ok: true });

  // Phase 2: the invoice of the funder's domain for exactly this amount, then the payment
  const wallet = getPayoutWallet()!;
  let btcUsd = 0;
  try {
    ({ usd: btcUsd } = await getBtcUsd());
    const amountSats = usdToSats(amountCents, btcUsd);
    const invoice = await requestInvoice(address, amountSats, { network: await walletNetwork(wallet) });
    await withDb((d) => {
      const r = d.refunds?.find((x) => x.id === id);
      if (r) r.lightning = { amountSats, btcUsd, bolt11: invoice.bolt11, paymentHash: invoice.paymentHash }; // written BEFORE paying: a lookup needs it
    });
    const paid = await wallet.pay(invoice.bolt11);
    return finishRefund(projectId, id, { ok: true, preimage: paid.preimage, feesSats: paid.feesSats });
  } catch (err) {
    if (err instanceof WalletError && err.ambiguous) {
      await withDb((d) => {
        const r = d.refunds?.find((x) => x.id === id);
        if (r) r.uncertain = true; // stays pending and reserved: reconcileRefunds looks the payment up
      });
      return (await readDb()).refunds!.find((x) => x.id === id)!;
    }
    const e = lightningHttpError(err);
    await finishRefund(projectId, id, { ok: false, error: e.message });
    throw e;
  }
}

async function finishRefund(
  projectId: string,
  id: string,
  result: { ok: true; preimage?: string; feesSats?: number } | { ok: false; error: string },
): Promise<Refund> {
  return withDb((db) => {
    const r = db.refunds?.find((x) => x.id === id);
    if (!r) throw new HttpError(404, 'Remboursement introuvable');
    if (r.status !== 'pending') return structuredClone(r); // already settled by someone else (idempotent)
    const at = new Date().toISOString();
    if (result.ok) {
      r.status = 'completed';
      r.completedAt = at;
      r.uncertain = undefined;
      if (r.lightning) {
        r.lightning.preimage = result.preimage;
        r.lightning.feesSats = result.feesSats;
      }
      appendLedger(
        db,
        projectId,
        'refund_completed',
        { refundId: id, amountCents: r.amountCents, rail: r.rail, ...(r.lightning ? { amountSats: r.lightning.amountSats, paymentHash: r.lightning.paymentHash, preimage: result.preimage } : { simulated: true }) },
        at,
      );
    } else {
      r.status = 'failed';
      r.error = result.error;
      r.uncertain = undefined;
      appendLedger(db, projectId, 'refund_failed', { refundId: id, amountCents: r.amountCents, rail: r.rail, error: result.error.slice(0, 200) }, at);
    }
    return structuredClone(r);
  });
}

/** Refunds whose payment outcome was unknown: ask the wallet by payment hash, like payouts. */
export async function reconcileRefunds(): Promise<void> {
  const wallet = getPayoutWallet();
  if (!wallet) return;
  for (const r of (await readDb()).refunds ?? []) {
    if (r.status !== 'pending' || r.rail !== 'lightning') continue;
    const age = Date.now() - Date.parse(r.createdAt);
    if (!r.lightning) {
      // stopped before an invoice existed: nothing could have been paid
      if (age > UNCONFIRMED_GRACE_MS) await finishRefund(r.projectId, r.id, { ok: false, error: 'Le remboursement n’a pas démarré. Votre séquestre est intact.' });
      continue;
    }
    try {
      const tx = await wallet.lookup(r.lightning.paymentHash);
      if (tx?.state === 'settled' && tx.preimage && sha256Hex(tx.preimage) === r.lightning.paymentHash) {
        await finishRefund(r.projectId, r.id, { ok: true, preimage: tx.preimage, feesSats: tx.feesSats });
      } else if (tx?.state === 'failed' || (tx === null && age > UNCONFIRMED_GRACE_MS)) {
        await finishRefund(r.projectId, r.id, { ok: false, error: 'Le remboursement Lightning n’a pas abouti. Votre séquestre est intact : vous pouvez réessayer.' });
      }
    } catch {
      /* wallet unreachable: next round */
    }
  }
}

/* ------------------------------------------------------------------------- *
 * Do the books add up? What we owe against what the wallets hold.
 * ------------------------------------------------------------------------- */

export interface WalletSolvency {
  checkedAt: string;
  liabilityCents: number;
  assetsCents: number;
  btcUsd: number;
  violated: boolean;
}

const gs = globalThis as unknown as { __nobpayWalletSolvency?: WalletSolvency };
export const getWalletSolvency = (): WalletSolvency | undefined => gs.__nobpayWalletSolvency;

/** Invariant: the escrow NobPay owes never exceeds what its wallets hold (3 % + 5 $ of slack for the price moving). */
export async function checkWalletSolvency(): Promise<WalletSolvency | null> {
  const receive = getReceiveWallet();
  if (!receive) return null;
  const payout = getPayoutWallet();
  let sats = await receive.balanceSats();
  if (payout && payout !== receive) {
    // two connections to the same wallet must not be counted twice
    const [a, b] = await Promise.all([receive.info(), payout.info()]);
    if (!(a.pubkey && a.pubkey === b.pubkey)) sats += await payout.balanceSats();
  }
  const [{ usd: btcUsd }, db] = await Promise.all([getBtcUsd(), readDb()]);
  const assetsCents = Math.round((sats / 1e8) * btcUsd * 100);
  const liabilityCents = realLiabilityCents(db);
  const violated = liabilityCents > assetsCents * 1.03 + 500;
  const was = gs.__nobpayWalletSolvency?.violated ?? false;
  gs.__nobpayWalletSolvency = { checkedAt: new Date().toISOString(), liabilityCents, assetsCents, btcUsd, violated };
  if (violated && !was) logger.error('wallet_solvency_violated', { liabilityUsd: liabilityCents / 100, assetsUsd: assetsCents / 100, effect: 'nouveaux versements et paiements suspendus' });
  if (!violated && was) logger.info('wallet_solvency_restored', { liabilityUsd: liabilityCents / 100, assetsUsd: assetsCents / 100 });
  return gs.__nobpayWalletSolvency;
}

/** Tests only. */
export function resetLightningStateForTests(): void {
  lastPolled.clear();
  gs.__nobpayWalletSolvency = undefined;
}

