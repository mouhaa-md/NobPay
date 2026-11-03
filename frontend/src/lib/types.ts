// Shared domain types (used by the server and by the UI).
// All money is stored as integer USD cents to avoid floating point errors.

/** The three corridors of one engine: a project at home, school fees, and a merchant's restock; `commerce` is the shop itself. */
export type Sector = 'immobilier' | 'agricole' | 'commerce' | 'scolarite' | 'approvisionnement';
export type ProofKind = 'titre' | 'photos' | 'facture';
export type MobileNetwork = 'wave' | 'orange_money' | 'free_money';
/** Where a supplier is paid: a mobile money operator (Senegal), or bitcoin straight to a Lightning address. */
export type SupplierNetwork = MobileNetwork | 'lightning';
/** The Bitnob gateway mode: a local simulation or the Bitnob sandbox. */
export type GatewayMode = 'mock' | 'sandbox';
/** What a funding or a payout went through: the Bitnob gateway, or a real Lightning wallet reached with NWC. */
export type RailMode = GatewayMode | 'nwc';

export type StepStatus =
  | 'upcoming' // not started
  | 'active' // field manager must submit a proof
  | 'proof_submitted' // waiting for the funder's decision
  | 'releasing' // payout in progress
  | 'paid' // supplier paid
  | 'rejected'; // proof refused, manager must resubmit

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  country: string; // ISO alpha-2 of the residence country
  phone: string;
  createdAt: string;
  demo?: boolean;
  /** a private account created by "try without an account": no phone number, never an administrator */
  guest?: boolean;
  /** raised to sign the user out everywhere (cookies carry the version they were issued with); missing = 0 */
  sessionVersion?: number;
  /** guests only: raised to renew the recovery link, which kills every older one; missing = 0 */
  recoveryVersion?: number;
}

export interface Supplier {
  name: string;
  network: SupplierNetwork;
  /** mobile money number; empty for a Lightning supplier */
  phone: string;
  /** network === 'lightning': user@domain, the address the sats are sent to */
  lightningAddress?: string;
}

export interface StoredFile {
  id: string;
  name: string;
  mime: string;
  size: number;
  sha256: string;
  /** demo files that live in /public instead of the upload folder */
  publicPath?: string;
}

export interface ProofPhoto extends StoredFile {
  takenAt: string;
  gps?: { lat: number; lng: number; accuracy?: number };
}

export interface Proof {
  photos: ProofPhoto[];
  invoice?: StoredFile;
  invoiceAmountFcfa?: number;
  note?: string;
  supplier?: Supplier;
  submittedAt: string;
  submittedBy: 'manager' | 'owner';
  /** the advice of the AI, asked for by the funder; advisory only, it never blocks or triggers a payment */
  aiReview?: AiReview;
}

export type CheckLevel = 'ok' | 'attention' | 'info';

/** One point of the review of a proof. Computed by code from the data; `attention` asks the funder to look closer. */
export interface ProofCheck {
  id: string;
  level: CheckLevel;
  text: string;
}

export interface AiReview {
  state: 'done' | 'refused' | 'error';
  model: string;
  at: string;
  /** one or two sentences, in French */
  summary?: string;
  photos?: { index: number; matchesStep: 'yes' | 'partly' | 'no' | 'unclear'; observation: string; concerns: string[] }[];
  /** what the AI read on the invoice (extracted by the model, compared by code, see `checks`) */
  invoice?: { readable: boolean; supplierName: string | null; totalAmount: number | null; currency: string | null; date: string | null; reference: string | null; itemsSummary: string | null; concerns: string[] };
  flags?: { level: 'info' | 'attention'; text: string }[];
  /** what the code concluded by comparing the AI's reading with what was declared */
  checks?: ProofCheck[];
  /** what we did not send (too big, unreadable), and why a review failed */
  notes?: string[];
  error?: string;
}

export interface PayoutQuote {
  quoteId: string;
  reference: string;
  amountUsdCents: number;
  rate: number; // FCFA per 1 USD
  feeUsdCents: number;
  amountFcfa: number;
  expiresAt: string;
  mode: RailMode;
  /** Lightning payouts only: the invoice the supplier's domain gave us for exactly this amount, already checked */
  lightning?: {
    amountSats: number;
    btcUsd: number;
    address: string;
    bolt11: string;
    paymentHash: string;
    invoiceExpiresAt: string;
  };
}

export type PayoutStatus = 'initiated' | 'pending' | 'completed' | 'failed';

export interface Payout {
  reference: string;
  quoteId: string;
  payoutId?: string;
  status: PayoutStatus;
  amountUsdCents: number;
  amountFcfa: number;
  rate: number;
  feeUsdCents: number;
  supplier: Supplier;
  mode: RailMode;
  startedAt: string;
  completedAt?: string;
  error?: string;
  /** `finalize` got no clear answer: the money may have moved, so the funds stay reserved until Bitnob says */
  uncertain?: boolean;
  /** Lightning payouts: what was sent and the proof of payment (the preimage hashes to paymentHash) */
  lightning?: {
    amountSats: number;
    btcUsd: number;
    address: string;
    bolt11: string;
    paymentHash: string;
    feesSats?: number;
    preimage?: string;
  };
}

export interface StepDecision {
  kind: 'approved' | 'rejected';
  at: string;
  note?: string;
}

export interface Step {
  id: string;
  index: number; // 1-based
  title: string;
  amountCents: number;
  proofKinds: ProofKind[];
  status: StepStatus;
  proof?: Proof;
  decision?: StepDecision;
  payout?: Payout;
  quote?: PayoutQuote;
}

export interface Project {
  id: string;
  ownerId: string;
  name: string;
  sector: Sector;
  city: string;
  country: string; // ISO alpha-2 of the destination country (SN)
  budgetCents: number;
  coverImage: string;
  managerName: string;
  managerPhone?: string;
  /**
   * LEGACY plaintext link token (demo projects and projects created before signed tokens). New projects have none:
   * their token is derived and signed, see server/managerToken.ts.
   */
  managerToken?: string;
  /** signed link tokens carry this version; rotating raises it and kills every older link */
  managerTokenVersion?: number;
  managerTokenExpiresAt?: string;
  approvalRule: 'owner';
  steps: Step[];
  createdAt: string;
  demo?: boolean;
}

export type FundingMethod = 'lightning' | 'usdt' | 'usdc';
export type FundingStatus = 'pending' | 'paid' | 'expired' | 'failed';

export interface Funding {
  id: string;
  projectId: string;
  amountCents: number;
  method: FundingMethod;
  status: FundingStatus;
  reference: string;
  mode: RailMode;
  createdAt: string;
  // Lightning
  invoiceId?: string;
  bolt11?: string;
  paymentHash?: string;
  amountSats?: number;
  btcUsd?: number;
  expiresAt?: string;
  // Settlement
  paidAt?: string;
  preimage?: string;
  /**
   * BTC -> stablecoin conversion after the invoice was paid (sandbox). `pending` = an attempt was started: if the
   * process stopped there, the next round looks for the order by reference before selling again.
   */
  conversion?: {
    status: 'pending' | 'done' | 'skipped' | 'failed';
    detail?: string;
    attempts?: number;
    /** false once we gave up (validation error, attempts exhausted): needs a person */
    retryable?: boolean;
    /** the last attempt may have reached Bitnob without an answer */
    uncertain?: boolean;
    nextAttemptAt?: string;
  };
  /** why a payment seen at Bitnob was not credited (e.g. different amount); never contains secrets */
  note?: string;
  /** credited by our own signed event (demo button), not by a payment seen at Bitnob: the ledger says so */
  simulated?: boolean;
  demo?: boolean;
}

export type LedgerType =
  | 'project_created'
  | 'funding_paid'
  | 'proof_submitted'
  | 'step_approved'
  | 'step_rejected'
  | 'payout_started'
  | 'payout_completed'
  | 'payout_failed'
  | 'refund_started'
  | 'refund_completed'
  | 'refund_failed';

export interface LedgerEvent {
  seq: number; // per project, starts at 1
  id: string;
  projectId: string;
  type: LedgerType;
  at: string;
  data: Record<string, unknown>;
  prevHash: string;
  hash: string;
}

export type AnchorStatus = 'pending' | 'confirmed' | 'failed';

export interface Anchor {
  id: string;
  projectId: string;
  upToSeq: number; // last ledger event covered
  digest: string; // sha256 of the dossier file (hex)
  dossierJson: string; // exact bytes that were hashed
  submittedAt: string;
  status: AnchorStatus;
  calendar?: string;
  otsBase64?: string; // detached .ots timestamp file
  bitcoinBlock?: number;
  confirmedAt?: string;
  error?: string;
}

export interface WebhookRecord {
  eventId: string;
  type: string;
  at: string;
  outcome: string;
  /** why the event was not applied (e.g. amount mismatch); never contains secrets */
  note?: string;
}

/** A pending SMS sign-in code. Only a hash is stored (HMAC of phone + code). */
export interface OtpRecord {
  phone: string;
  codeHash: string;
  createdAt: string;
  expiresAt: string;
  attempts: number;
  usedAt?: string;
}

export type RefundStatus = 'pending' | 'completed' | 'failed';

/** Unused escrow given back to the funder. While `pending` the amount is already out of the escrow. */
export interface Refund {
  id: string;
  projectId: string;
  amountCents: number;
  status: RefundStatus;
  reference: string;
  /** `lightning`: real sats sent through the payout wallet; `simulated`: no money moved (mock and sandbox) */
  rail: 'lightning' | 'simulated';
  address: string;
  createdAt: string;
  completedAt?: string;
  error?: string;
  /** the wallet gave no clear answer: the sats may have left, the amount stays reserved until a lookup says */
  uncertain?: boolean;
  lightning?: { amountSats: number; btcUsd: number; bolt11: string; paymentHash: string; feesSats?: number; preimage?: string };
}

export interface Db {
  version: 1;
  users: User[];
  projects: Project[];
  fundings: Funding[];
  ledger: LedgerEvent[];
  anchors: Anchor[];
  webhooks: WebhookRecord[];
  /** missing in databases created before real SMS codes existed */
  otps?: OtpRecord[];
  /** missing in databases created before refunds existed */
  refunds?: Refund[];
  /** where each ledger event stands on the Nostr relays; missing in databases created before commitments existed */
  nostr?: NostrCommit[];
}

/** One ledger event published (or being published) on Nostr relays as a signed commitment. */
export interface NostrCommit {
  projectId: string;
  seq: number;
  /** the exact signed event: a retry sends the very same one */
  event: { id: string; pubkey: string; created_at: number; kind: number; tags: string[][]; content: string; sig: string };
  /** relays that accepted it */
  relays: string[];
  attempts: number;
  lastAttemptAt?: string;
  /** what the relays that refused it said */
  lastError?: string;
  /** enough relays have it */
  confirmedAt?: string;
  /** NIP-03: the id of this event stamped on Bitcoin through OpenTimestamps, for the events where money moved */
  attest?: NostrAttestation;
}

export interface NostrAttestation {
  /** the .ots file of the event id (pending, then upgraded) */
  otsBase64: string;
  status: 'pending' | 'confirmed' | 'failed';
  submittedAt: string;
  lastCheckAt?: string;
  bitcoinBlock?: number;
  /** the kind 1040 event carrying the proof, signed once and sent again as is */
  proofEvent?: NostrCommit['event'];
  /** relays that accepted the proof event */
  proofRelays: string[];
  error?: string;
}

// ---- Derived helpers (pure) -------------------------------------------------

export function fundedCents(db: Pick<Db, 'fundings'>, projectId: string): number {
  return db.fundings
    .filter((f) => f.projectId === projectId && f.status === 'paid')
    .reduce((sum, f) => sum + f.amountCents, 0);
}

export function releasedCents(project: Project): number {
  return project.steps.filter((s) => s.status === 'paid').reduce((sum, s) => sum + s.amountCents, 0);
}

export function reservedCents(project: Project): number {
  return project.steps.filter((s) => s.status === 'releasing').reduce((sum, s) => sum + s.amountCents, 0);
}

/** Escrow handed back to the funder (a refund that failed gave nothing back; a pending one already left the escrow). */
export function refundedCents(db: { refunds?: Refund[] }, projectId: string): number {
  return (db.refunds ?? []).filter((r) => r.projectId === projectId && r.status !== 'failed').reduce((sum, r) => sum + r.amountCents, 0);
}

/** Money still held in escrow for the project (funded minus released, reserved and refunded). */
export function escrowCents(db: Pick<Db, 'fundings'> & { refunds?: Refund[] }, project: Project): number {
  return Math.max(0, fundedCents(db, project.id) - releasedCents(project) - reservedCents(project) - refundedCents(db, project.id));
}

export function currentStep(project: Project): Step | undefined {
  return (
    project.steps.find((s) => s.status === 'proof_submitted' || s.status === 'releasing') ??
    project.steps.find((s) => s.status === 'active' || s.status === 'rejected') ??
    project.steps.find((s) => s.status === 'upcoming')
  );
}

export function progressPercent(project: Project): number {
  if (project.budgetCents <= 0) return 0;
  return Math.round((releasedCents(project) / project.budgetCents) * 100);
}
