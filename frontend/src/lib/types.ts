// Shared domain types (used by the server and by the UI).
// All money is stored as integer USD cents to avoid floating point errors.

export type Sector = 'immobilier' | 'agricole' | 'commerce';
export type ProofKind = 'titre' | 'photos' | 'facture';
export type MobileNetwork = 'wave' | 'orange_money' | 'free_money';
export type GatewayMode = 'mock' | 'sandbox';

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
  /** raised to sign the user out everywhere (cookies carry the version they were issued with); missing = 0 */
  sessionVersion?: number;
}

export interface Supplier {
  name: string;
  network: MobileNetwork;
  phone: string;
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
}

export interface PayoutQuote {
  quoteId: string;
  reference: string;
  amountUsdCents: number;
  rate: number; // FCFA per 1 USD
  feeUsdCents: number;
  amountFcfa: number;
  expiresAt: string;
  mode: GatewayMode;
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
  mode: GatewayMode;
  startedAt: string;
  completedAt?: string;
  error?: string;
  /** `finalize` got no clear answer: the money may have moved, so the funds stay reserved until Bitnob says */
  uncertain?: boolean;
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
  managerToken: string;
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
  mode: GatewayMode;
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
  | 'payout_failed';

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

/** Money still held in escrow for the project (funded minus released/reserved). */
export function escrowCents(db: Pick<Db, 'fundings'>, project: Project): number {
  return Math.max(0, fundedCents(db, project.id) - releasedCents(project) - reservedCents(project));
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
