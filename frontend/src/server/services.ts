import {
  escrowCents,
  type Db,
  type Funding,
  type FundingMethod,
  type Payout,
  type PayoutQuote,
  type Project,
  type ProofKind,
  type ProofPhoto,
  type Sector,
  type Step,
  type StoredFile,
  type Supplier,
  type User,
} from '@/lib/types';
import { formatInt, formatUsdShort, usdToSats } from '@/lib/money';
import { SECTORS } from '@/lib/templates';
import { gatewayFor, getGateway } from './bitnob';
import type { PayoutStart } from './bitnob/types';
import { getConfig } from './config';
import { randomId, randomToken } from './crypto';
import { readDb, withDb } from './db';
import { activateSteps, applyFundingPaid, applyPayoutCompleted, applyPayoutFailed, findProject, findStep } from './domain';
import { HttpError } from './http';
import { appendLedger } from './ledger';
import { simulateInvoicePaid, simulatePayoutCompleted } from './mockEvents';
import { amountMatches } from './webhooks';

const MAX_LIGHTNING_SATS = 20_000_000; // per-invoice limit documented by Bitnob

/* ------------------------------------------------------------------------- *
 * Access helpers
 * ------------------------------------------------------------------------- */

function ownedProject(db: Db, user: User, projectId: string): Project {
  const project = findProject(db, projectId);
  if (!project || project.ownerId !== user.id) throw new HttpError(404, 'Projet introuvable');
  return project;
}

function stepOf(project: Project, stepId: string): Step {
  const step = findStep(project, stepId);
  if (!step) throw new HttpError(404, 'Étape introuvable');
  return step;
}

/* ------------------------------------------------------------------------- *
 * Projects
 * ------------------------------------------------------------------------- */

export interface ProjectInput {
  name: string;
  sector: Sector;
  city: string;
  budgetCents: number;
  managerName: string;
  managerPhone?: string;
  steps: { title: string; amountCents: number; proofKinds: ProofKind[] }[];
}

export async function createProject(owner: User, input: ProjectInput): Promise<Project> {
  const name = String(input.name ?? '').trim();
  const city = String(input.city ?? '').trim();
  const managerName = String(input.managerName ?? '').trim();
  if (name.length < 2 || name.length > 80) throw new HttpError(400, 'Donnez un nom au projet (2 à 80 caractères)');
  if (!SECTORS[input.sector]) throw new HttpError(400, 'Secteur invalide');
  if (!city) throw new HttpError(400, 'Indiquez la ville');
  if (!managerName) throw new HttpError(400, 'Indiquez la personne de confiance sur place');
  if (!Number.isInteger(input.budgetCents) || input.budgetCents < 10_000 || input.budgetCents > 50_000_000) {
    throw new HttpError(400, 'Le budget doit être compris entre 100 $ et 500 000 $');
  }
  if (!Array.isArray(input.steps) || input.steps.length < 1 || input.steps.length > 12) {
    throw new HttpError(400, 'Prévoyez entre 1 et 12 étapes');
  }
  const steps = input.steps.map((s, i) => {
    const title = String(s.title ?? '').trim();
    if (!title) throw new HttpError(400, `Donnez un nom à l'étape ${i + 1}`);
    if (!Number.isInteger(s.amountCents) || s.amountCents < 100) throw new HttpError(400, `Montant invalide pour l'étape ${i + 1}`);
    return { title: title.slice(0, 80), amountCents: s.amountCents, proofKinds: s.proofKinds?.length ? s.proofKinds : (['photos', 'facture'] as ProofKind[]) };
  });
  if (steps.reduce((sum, s) => sum + s.amountCents, 0) !== input.budgetCents) {
    throw new HttpError(400, 'La somme des étapes doit être égale au budget');
  }

  const id = randomId('p', 4);
  const project: Project = {
    id,
    ownerId: owner.id,
    name,
    sector: input.sector,
    city,
    country: 'SN',
    budgetCents: input.budgetCents,
    coverImage: SECTORS[input.sector].cover,
    managerName,
    managerPhone: input.managerPhone?.trim() || undefined,
    managerToken: randomToken(12),
    approvalRule: 'owner',
    steps: steps.map((s, i) => ({
      id: `${id}_s${i + 1}`,
      index: i + 1,
      title: s.title,
      amountCents: s.amountCents,
      proofKinds: s.proofKinds,
      status: 'upcoming' as const,
    })),
    createdAt: new Date().toISOString(),
  };

  await withDb((db) => {
    db.projects.push(project);
    appendLedger(db, id, 'project_created', {
      name,
      sector: project.sector,
      city,
      budgetCents: project.budgetCents,
      steps: project.steps.map((s) => ({ index: s.index, title: s.title, amountCents: s.amountCents })),
    });
  });
  return project;
}

/* ------------------------------------------------------------------------- *
 * Funding (Lightning)
 * ------------------------------------------------------------------------- */

export async function createFunding(
  owner: User,
  projectId: string,
  input: { amountCents: number; method: FundingMethod },
): Promise<Funding> {
  const db = await readDb();
  const project = ownedProject(db, owner, projectId);
  const amountCents = Math.round(Number(input.amountCents));
  if (!Number.isFinite(amountCents) || amountCents < 500) throw new HttpError(400, 'Montant minimum : 5 $');
  const remainingBudget = project.budgetCents - db.fundings.filter((f) => f.projectId === projectId && f.status === 'paid').reduce((s, f) => s + f.amountCents, 0);
  if (amountCents > Math.max(remainingBudget, 0) + 500_00) {
    throw new HttpError(400, `Le projet est déjà financé à presque 100 % (reste ${formatUsdShort(Math.max(remainingBudget, 0))}).`);
  }
  if (input.method !== 'lightning') {
    throw new HttpError(400, 'Le dépôt en USDT/USDC arrive bientôt. Utilisez Bitcoin Lightning.', 'method_unavailable');
  }

  const gateway = getGateway();
  const id = randomId('f', 5);
  const reference = `nobpay:fund:${id}`;
  const btcUsd = await gateway.btcUsd();
  const amountSats = usdToSats(amountCents, btcUsd);
  if (amountSats > MAX_LIGHTNING_SATS) {
    const maxUsd = Math.floor((MAX_LIGHTNING_SATS / 1e8) * btcUsd);
    throw new HttpError(400, `Une facture Lightning est limitée à environ ${formatInt(maxUsd)} $. Faites plusieurs versements.`, 'too_large');
  }
  const invoice = await gateway.createInvoice({
    amountSats,
    description: `NobPay · ${project.name}`.slice(0, 100),
    reference,
    expirySeconds: 86_400,
  });

  const funding: Funding = {
    id,
    projectId,
    amountCents,
    method: 'lightning',
    status: 'pending',
    reference,
    mode: gateway.mode,
    createdAt: new Date().toISOString(),
    invoiceId: invoice.id,
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
 * Asks Bitnob whether a pending sandbox invoice was paid and credits it. The webhook is the main path; this is the
 * polling fallback. The amount Bitnob reports must match the invoice, like for webhooks (a mismatch credits nothing).
 */
export async function settleFromGateway(fundingId: string): Promise<void> {
  const f = (await readDb()).fundings.find((x) => x.id === fundingId);
  if (!f || f.status !== 'pending' || f.mode !== 'sandbox' || !f.invoiceId) return;
  const status = await gatewayFor('sandbox').invoiceStatus(f.invoiceId);
  if (status.status !== 'paid') return;
  if (status.amountSats !== undefined && f.amountSats && !amountMatches(status.amountSats, f.amountSats)) {
    console.warn(`[funding] amount mismatch on ${f.id}: expected ${f.amountSats} sats, Bitnob reports ${status.amountSats}`);
    await withDb((d) => {
      const x = d.fundings.find((y) => y.id === fundingId);
      if (x && x.status === 'pending') x.note = `Montant reçu différent : attendu ${f.amountSats} sats, reçu ${status.amountSats}.`;
    });
    return;
  }
  await withDb((d) => {
    const x = d.fundings.find((y) => y.id === fundingId);
    if (x) applyFundingPaid(d, x, { preimage: status.preimage });
  });
}

/** Invoices that went past their expiry are closed. Called by the background job and by the funding screen. */
export async function expireFundings(): Promise<void> {
  const now = Date.now();
  const late = (await readDb()).fundings.filter((f) => f.status === 'pending' && f.expiresAt && Date.parse(f.expiresAt) < now);
  if (late.length === 0) return;
  await withDb((d) => {
    for (const f of d.fundings) if (f.status === 'pending' && f.expiresAt && Date.parse(f.expiresAt) < now) f.status = 'expired';
  });
}

const lastPolled = new Map<string, number>();
export const POLL_FUNDING_EVERY_MS = 10_000;

/** Polling fallback for every pending sandbox invoice, at most once every 10 s each. */
export async function pollPendingFundings(): Promise<void> {
  const now = Date.now();
  let firstError: unknown;
  for (const f of (await readDb()).fundings) {
    if (f.status !== 'pending' || f.mode !== 'sandbox' || !f.invoiceId) continue;
    if (now - (lastPolled.get(f.id) ?? 0) < POLL_FUNDING_EVERY_MS) continue;
    lastPolled.set(f.id, now);
    try {
      await settleFromGateway(f.id);
    } catch (err) {
      firstError ??= err; // one failing invoice must not stop the others; the caller logs the error
    }
  }
  if (firstError) throw firstError;
}

/** Current state of a funding. In sandbox mode a still-pending invoice is also checked on the API (polling fallback). */
export async function refreshFunding(owner: User, fundingId: string): Promise<Funding> {
  let db = await readDb();
  let funding = db.fundings.find((f) => f.id === fundingId);
  if (!funding) throw new HttpError(404, 'Versement introuvable');
  ownedProject(db, owner, funding.projectId);

  if (funding.status === 'pending') {
    await expireFundings();
    try {
      await settleFromGateway(fundingId);
    } catch {
      /* the webhook remains the source of truth; try again on the next poll */
    }
    db = await readDb();
    funding = db.fundings.find((f) => f.id === fundingId)!;
  }

  return funding;
}

/* ------------------------------------------------------------------------- *
 * BTC -> stablecoin conversion, balances and solvency
 *
 * The escrow is credited when the BTC arrive (decision to confirm with the project lead, see B0.6), but payouts are
 * paid from the stablecoin balance. So: convert after the credit, retry safely, and refuse a payout the wallet
 * cannot cover yet.
 * ------------------------------------------------------------------------- */

export const CONVERSION_BACKOFF_MS = [30_000, 120_000, 600_000, 1_800_000, 7_200_000];
export const CONVERSION_MAX_ATTEMPTS = 6;

/** Converts every paid sandbox funding that is not converted yet. Idempotent: reference `nobpay:conv:<fundingId>`. */
export async function convertPaidFundings(now = Date.now()): Promise<void> {
  let firstError: unknown;
  for (const f of (await readDb()).fundings) {
    if (f.status !== 'paid' || f.mode !== 'sandbox' || !f.amountSats) continue;
    const c = f.conversion;
    if (c && (c.status === 'done' || c.status === 'skipped')) continue;
    if (c?.status === 'failed' && !c.retryable) continue; // gave up: a person must look
    if (c?.nextAttemptAt && Date.parse(c.nextAttemptAt) > now) continue;
    try {
      await attemptConversion(f.id, now);
    } catch (err) {
      firstError ??= err;
    }
  }
  if (firstError) throw firstError;
}

async function attemptConversion(fundingId: string, now: number): Promise<void> {
  const gateway = gatewayFor('sandbox');
  const f = (await readDb()).fundings.find((x) => x.id === fundingId);
  if (!f || !f.amountSats || f.status !== 'paid') return;
  const reference = `nobpay:conv:${f.id}`;
  const previous = f.conversion;
  const attempts = (previous?.attempts ?? 0) + 1;

  // An earlier attempt may have reached Bitnob without an answer (or the process stopped mid-attempt, status
  // `pending`): look for the order before selling the same bitcoin twice. If the lookup fails, wait for the next round.
  if (previous?.uncertain || previous?.status === 'pending') {
    if (await gateway.findConversionByReference(reference)) {
      await withDb((d) => {
        const x = d.fundings.find((y) => y.id === fundingId);
        if (x) x.conversion = { status: 'done', detail: 'Ordre retrouvé chez Bitnob', attempts: previous.attempts };
      });
      return;
    }
  }

  await withDb((d) => {
    const x = d.fundings.find((y) => y.id === fundingId);
    if (x) x.conversion = { status: 'pending', attempts, detail: previous?.detail };
  });
  const result = await gateway.convertBtcToStable({ sats: f.amountSats, reference });
  await withDb((d) => {
    const x = d.fundings.find((y) => y.id === fundingId);
    if (!x) return;
    if (result.status !== 'failed') {
      x.conversion = { status: result.status, detail: result.detail, attempts };
      return;
    }
    const retryable = result.retryable === true && attempts < CONVERSION_MAX_ATTEMPTS;
    x.conversion = {
      status: 'failed',
      detail: result.detail,
      attempts,
      retryable,
      uncertain: result.uncertain === true,
      ...(retryable ? { nextAttemptAt: new Date(now + CONVERSION_BACKOFF_MS[Math.min(attempts - 1, CONVERSION_BACKOFF_MS.length - 1)]).toISOString() } : {}),
    };
  });
}

export interface Solvency {
  checkedAt: string;
  /** what NobPay owes in sandbox: paid funding not yet paid out, in USD cents */
  liabilityCents: number;
  /** what the Bitnob wallets hold: stablecoins plus bitcoin at the market price, in USD cents */
  assetsCents: number;
  violated: boolean;
}

const gs = globalThis as unknown as { __nobpaySolvency?: Solvency };

/** Real (non-demo, sandbox) money NobPay owes: paid fundings minus payouts completed or in flight. */
export function sandboxLiabilityCents(db: Db): number {
  const funded = db.fundings.filter((f) => f.status === 'paid' && f.mode === 'sandbox' && !f.demo).reduce((s, f) => s + f.amountCents, 0);
  let out = 0;
  for (const p of db.projects) {
    for (const st of p.steps) {
      const po = st.payout;
      if (po && po.mode === 'sandbox' && po.status !== 'failed') out += po.amountUsdCents;
    }
  }
  return funded - out;
}

/** Invariant: what we owe never exceeds what the wallets hold (3 % + 5 $ of slack for the bitcoin price moving). */
export async function checkSolvency(): Promise<Solvency> {
  const gateway = gatewayFor('sandbox');
  const [bal, btcUsd, db] = await Promise.all([gateway.balances(), gateway.btcUsd(), readDb()]);
  const assetsCents = Math.round(((bal.USDT ?? 0) + (bal.USDC ?? 0) + (bal.BTC ?? 0) * btcUsd) * 100);
  const liabilityCents = sandboxLiabilityCents(db);
  const violated = liabilityCents > assetsCents * 1.03 + 500;
  const was = gs.__nobpaySolvency?.violated ?? false;
  gs.__nobpaySolvency = { checkedAt: new Date().toISOString(), liabilityCents, assetsCents, violated };
  if (violated && !was) console.error(`[solvency] ALERTE : NobPay doit ${liabilityCents / 100} $ mais les portefeuilles Bitnob en contiennent ${assetsCents / 100} $. Nouveaux paiements suspendus.`);
  if (!violated && was) console.info('[solvency] retour à la normale : les paiements reprennent.');
  return gs.__nobpaySolvency;
}

export const getSolvency = (): Solvency | undefined => gs.__nobpaySolvency;

/** Before a sandbox payout: payments are paused if the books do not add up, and the wallet must cover this one. */
async function assertPayoutCovered(amountCents: number): Promise<void> {
  if (getSolvency()?.violated) {
    throw new HttpError(503, 'Les paiements sont suspendus : les soldes Bitnob ne couvrent pas les séquestres. Contactez le support.', 'payments_paused');
  }
  const asset = getConfig().payoutAsset;
  let held: number;
  try {
    held = (await gatewayFor('sandbox').balances())[asset] ?? 0;
  } catch {
    return; // Bitnob unreachable: it will refuse the payout itself if it cannot pay
  }
  if (held + 0.005 < amountCents / 100) {
    throw new HttpError(
      409,
      `Le portefeuille ${asset} de Bitnob (${formatUsdShort(Math.round(held * 100))}) ne couvre pas encore ce paiement (${formatUsdShort(amountCents)}). Si le versement vient d'arriver, la conversion est en cours : réessayez dans quelques minutes.`,
      'insufficient_balance',
    );
  }
}

/** Mock mode only: pays the invoice by sending a signed event to the real webhook handler. */
export async function simulateFundingPaid(owner: User, fundingId: string): Promise<Funding> {
  if (getConfig().mode !== 'mock') throw new HttpError(403, 'La simulation est désactivée en mode sandbox');
  if (!getConfig().allowDemo) throw new HttpError(403, 'Le mode démonstration est désactivé sur cette instance', 'demo_disabled');
  const db = await readDb();
  const funding = db.fundings.find((f) => f.id === fundingId);
  if (!funding) throw new HttpError(404, 'Versement introuvable');
  ownedProject(db, owner, funding.projectId);
  if (funding.status === 'pending') await simulateInvoicePaid(funding);
  return (await readDb()).fundings.find((f) => f.id === fundingId)!;
}

/* ------------------------------------------------------------------------- *
 * Proofs (submitted by the person on site)
 * ------------------------------------------------------------------------- */

export type Actor = { kind: 'owner'; user: User } | { kind: 'manager'; token: string };

export interface ProofInput {
  photos: (StoredFile & { takenAt?: string; gps?: ProofPhoto['gps'] })[];
  invoice?: StoredFile;
  invoiceAmountFcfa?: number;
  note?: string;
  supplier: Supplier;
}

/** Throws unless the actor (owner session or field-manager link) may act on the project. */
export async function assertProjectAccess(actor: Actor, projectId: string): Promise<Project> {
  const db = await readDb();
  const project = findProject(db, projectId);
  if (!project) throw new HttpError(404, 'Projet introuvable');
  if (actor.kind === 'owner' ? project.ownerId !== actor.user.id : project.managerToken !== actor.token) {
    throw new HttpError(403, "Vous n'avez pas accès à ce projet");
  }
  return project;
}

export async function submitProof(actor: Actor, projectId: string, stepId: string, input: ProofInput): Promise<Step> {
  const project = await assertProjectAccess(actor, projectId);
  const current = stepOf(project, stepId);
  if (current.status !== 'active' && current.status !== 'rejected') {
    throw new HttpError(409, current.status === 'upcoming' ? "Cette étape n'est pas encore débloquée : le séquestre doit la couvrir." : 'Une preuve a déjà été envoyée pour cette étape');
  }
  const supplier = input.supplier;
  if (!supplier?.name?.trim() || !supplier.phone?.trim() || !supplier.network) {
    throw new HttpError(400, 'Indiquez qui sera payé (nom, numéro et opérateur mobile money)');
  }
  const needsPhoto = current.proofKinds.includes('photos') || current.proofKinds.includes('titre');
  if (needsPhoto && input.photos.length === 0) throw new HttpError(400, 'Ajoutez au moins une photo');
  if (current.proofKinds.includes('facture') && !input.invoice) throw new HttpError(400, 'Ajoutez la facture du fournisseur');

  const submittedAt = new Date().toISOString();
  return withDb((d) => {
    const p = findProject(d, projectId)!;
    const step = stepOf(p, stepId);
    step.proof = {
      photos: input.photos.map((f) => ({ ...f, takenAt: f.takenAt ?? submittedAt })),
      invoice: input.invoice,
      invoiceAmountFcfa: input.invoiceAmountFcfa,
      note: input.note?.trim().slice(0, 500) || undefined,
      supplier: { name: supplier.name.trim().slice(0, 80), phone: supplier.phone.trim(), network: supplier.network },
      submittedAt,
      submittedBy: actor.kind === 'owner' ? 'owner' : 'manager',
    };
    step.status = 'proof_submitted';
    step.decision = undefined;
    step.quote = undefined;
    appendLedger(
      d,
      projectId,
      'proof_submitted',
      {
        stepId,
        index: step.index,
        photos: step.proof.photos.map((f) => ({ sha256: f.sha256, takenAt: f.takenAt, gps: f.gps })),
        invoice: step.proof.invoice ? { sha256: step.proof.invoice.sha256, amountFcfa: step.proof.invoiceAmountFcfa } : undefined,
        note: step.proof.note,
      },
      submittedAt,
    );
    return structuredClone(step);
  });
}

export async function rejectProof(owner: User, projectId: string, stepId: string, note?: string): Promise<Step> {
  return withDb((db) => {
    const project = ownedProject(db, owner, projectId);
    const step = stepOf(project, stepId);
    if (step.status !== 'proof_submitted') throw new HttpError(409, 'Aucune preuve à refuser');
    step.status = 'rejected';
    step.decision = { kind: 'rejected', at: new Date().toISOString(), note: note?.trim().slice(0, 300) || undefined };
    step.quote = undefined;
    appendLedger(db, projectId, 'step_rejected', { stepId, index: step.index, note: step.decision.note });
    return structuredClone(step);
  });
}

/* ------------------------------------------------------------------------- *
 * Release: quote -> confirm (-> payout webhook)
 * ------------------------------------------------------------------------- */

export async function quoteRelease(owner: User, projectId: string, stepId: string, opts: { simulate?: boolean } = {}): Promise<PayoutQuote> {
  const db = await readDb();
  const project = ownedProject(db, owner, projectId);
  const step = stepOf(project, stepId);
  if (step.status !== 'proof_submitted') throw new HttpError(409, 'Aucune preuve à valider pour cette étape');
  if (!step.proof?.supplier) throw new HttpError(409, 'Le fournisseur à payer est manquant');
  const escrow = escrowCents(db, project);
  if (escrow < step.amountCents) {
    throw new HttpError(409, `Le séquestre (${formatUsdShort(escrow)}) ne couvre pas cette étape (${formatUsdShort(step.amountCents)}). Financez le projet.`, 'insufficient_escrow');
  }
  if (opts.simulate && !getConfig().allowDemo) {
    throw new HttpError(403, 'Le mode démonstration est désactivé sur cette instance', 'demo_disabled');
  }
  if (getGateway(opts.simulate).mode === 'sandbox') await assertPayoutCovered(step.amountCents);
  const gateway = getGateway(opts.simulate);
  const reference = `nobpay:pay:${step.id}:${Date.now().toString(36)}`;
  let quote: PayoutQuote;
  try {
    quote = await gateway.quotePayout({ amountUsdCents: step.amountCents, reference });
  } catch (err) {
    throw new HttpError(502, `Devis de paiement refusé : ${(err as Error).message}`, 'gateway_error');
  }
  await withDb((d) => {
    const s = stepOf(findProject(d, projectId)!, stepId);
    s.quote = quote;
  });
  return quote;
}

export async function confirmRelease(owner: User, projectId: string, stepId: string): Promise<Step> {
  const snapshot = await readDb();
  const project0 = ownedProject(snapshot, owner, projectId);
  const step0 = stepOf(project0, stepId);
  const quote = step0.quote;
  if (step0.status !== 'proof_submitted') throw new HttpError(409, 'Aucune preuve à valider pour cette étape');
  if (!quote) throw new HttpError(409, "Demandez d'abord un devis de paiement", 'no_quote');
  if (Date.parse(quote.expiresAt) < Date.now()) throw new HttpError(409, 'Le devis a expiré. Demandez-en un nouveau.', 'quote_expired');
  const supplier = step0.proof!.supplier!;
  if (escrowCents(snapshot, project0) < step0.amountCents) throw new HttpError(409, 'Séquestre insuffisant', 'insufficient_escrow');
  if (quote.mode === 'sandbox') await assertPayoutCovered(step0.amountCents);

  // Phase 1: record the decision and reserve the funds.
  const startedAt = new Date().toISOString();
  await withDb((db) => {
    const project = ownedProject(db, owner, projectId);
    const step = stepOf(project, stepId);
    if (step.status !== 'proof_submitted') throw new HttpError(409, 'Cette étape a déjà été traitée');
    const payout: Payout = {
      reference: quote.reference,
      quoteId: quote.quoteId,
      status: 'initiated',
      amountUsdCents: quote.amountUsdCents,
      amountFcfa: quote.amountFcfa,
      rate: quote.rate,
      feeUsdCents: quote.feeUsdCents,
      supplier,
      mode: quote.mode,
      startedAt,
    };
    step.status = 'releasing';
    step.decision = { kind: 'approved', at: startedAt };
    step.payout = payout;
    step.quote = undefined;
    appendLedger(db, projectId, 'step_approved', { stepId, index: step.index, amountCents: step.amountCents }, startedAt);
    appendLedger(
      db,
      projectId,
      'payout_started',
      {
        stepId,
        index: step.index,
        reference: payout.reference,
        quoteId: payout.quoteId,
        amountUsdCents: payout.amountUsdCents,
        amountFcfa: payout.amountFcfa,
        rate: payout.rate,
        supplier: { name: supplier.name, network: supplier.network },
      },
      startedAt,
    );
  });

  // Phase 2: ask the gateway to move the money (outside the database lock).
  const { publicBaseUrl } = getConfig();
  let start: PayoutStart;
  try {
    start = await gatewayFor(quote.mode).startPayout({
      quote,
      reference: quote.reference,
      supplier,
      sender: { name: `${owner.firstName} ${owner.lastName}`.trim(), country: owner.country },
      reason: 'vendor_payment',
      callbackUrl: publicBaseUrl.startsWith('https://') ? `${publicBaseUrl}/api/webhooks/bitnob` : undefined,
    });
  } catch (err) {
    // Only a definite refusal gets here (an unconfirmed finalize comes back as start.uncertain, not as an error).
    const message = (err as Error).message;
    await withDb((db) => {
      const project = findProject(db, projectId)!;
      applyPayoutFailed(db, project, stepOf(project, stepId), message);
    });
    throw new HttpError(502, `Paiement non exécuté : ${message}`, 'gateway_error');
  }

  // Phase 3: store the gateway's answer. Completion arrives by webhook (or polling). This write is OUTSIDE the
  // try above on purpose: if it fails the money may have moved, so the step stays `releasing` and reconcile()
  // finds the payout again by its reference instead of declaring a failure.
  return withDb((db) => {
    const project = findProject(db, projectId)!;
    const step = stepOf(project, stepId);
    if (step.payout) {
      step.payout.payoutId = start.payoutId;
      step.payout.status = start.status === 'initiated' ? 'pending' : start.status;
      if (start.uncertain) step.payout.uncertain = true; // reconcile() decides, the funds stay reserved
    }
    if (start.status === 'completed') applyPayoutCompleted(db, project, step, { payoutId: start.payoutId });
    if (start.status === 'failed') applyPayoutFailed(db, project, step, 'Paiement refusé par le réseau');
    return structuredClone(step);
  });
}

/* ------------------------------------------------------------------------- *
 * Reconciliation: finish payouts that are still in flight.
 *  - mock: the simulator "receives" the payout webhook shortly after the request
 *  - sandbox: poll the payout status (the webhook normally arrives first)
 * ------------------------------------------------------------------------- */

/** How long an unconfirmed payout is left alone before we conclude Bitnob never started it (quotes live ~16 min). */
export const UNCONFIRMED_GRACE_MS = 5 * 60_000;

export async function reconcile(): Promise<void> {
  const db = await readDb();
  for (const project of db.projects) {
    for (const step of project.steps) {
      const payout = step.payout;
      if (!payout || (payout.status !== 'pending' && payout.status !== 'initiated')) continue;
      const age = Date.now() - Date.parse(payout.startedAt);
      if (payout.mode === 'mock') {
        if (age > 2500) await simulatePayoutCompleted(step);
      } else if (age > 4000) {
        try {
          await reconcileSandboxPayout(project.id, step.id, payout, age);
        } catch {
          /* try again on the next poll */
        }
      }
    }
  }
}

/**
 * Finishes a sandbox payout that is still in flight. Money safety rules:
 *  - funds stay reserved while Bitnob may have moved them (status processing, or finalize unconfirmed);
 *  - a payout is only declared failed when Bitnob says so, or when it provably never started: still not
 *    finalized (INITIATED/QUOTE) or unknown by reference after UNCONFIRMED_GRACE_MS;
 *  - the decision is re-checked inside the transaction: if the step moved on (retried, paid) nothing is touched.
 */
async function reconcileSandboxPayout(projectId: string, stepId: string, payout: Payout, ageMs: number): Promise<void> {
  const gateway = gatewayFor('sandbox');
  const settled = ageMs > UNCONFIRMED_GRACE_MS;
  let payoutId = payout.payoutId;
  let seen: { status: Payout['status']; error?: string } | null;

  if (payoutId) {
    seen = await gateway.payoutStatus(payoutId);
  } else {
    // The process stopped between the two database writes of confirmRelease (or Bitnob returned no id):
    // look the payout up by the reference we gave it.
    if (!settled) return; // the original request may still be on its way
    const found = await gateway.findPayoutByReference(payout.reference);
    payoutId = found?.payoutId;
    seen = found;
  }

  const neverStarted =
    settled && (seen === null || (seen.status === 'initiated' && (payout.uncertain === true || !payout.payoutId)));

  await withDb((d) => {
    const p = findProject(d, projectId)!;
    const s = stepOf(p, stepId);
    if (s.status !== 'releasing' || s.payout?.reference !== payout.reference) return; // the step moved on meanwhile
    if (payoutId && !s.payout.payoutId) s.payout.payoutId = payoutId;
    if (seen?.status === 'completed') {
      applyPayoutCompleted(d, p, s, { payoutId });
    } else if (seen?.status === 'failed') {
      applyPayoutFailed(d, p, s, seen.error ?? 'Paiement refusé par le réseau');
    } else if (neverStarted) {
      applyPayoutFailed(d, p, s, "Le paiement n'a pas démarré chez Bitnob (la réponse a été perdue). Votre séquestre est intact : vous pouvez réessayer.");
    }
  });
}

/** Used by the UI to re-evaluate which step can be started after a funding or a payout. */
export async function refreshActivation(projectId: string): Promise<void> {
  await withDb((db) => {
    const project = findProject(db, projectId);
    if (project) activateSteps(db, project);
  });
}
