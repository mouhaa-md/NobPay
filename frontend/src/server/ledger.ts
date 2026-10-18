import type { Db, LedgerEvent, LedgerType, Project } from '@/lib/types';
import { canonicalize, sha256Hex } from './crypto';

/** Each event hashes the previous one: changing any past event breaks every hash after it. */
export const GENESIS = '0'.repeat(64);

export function eventHash(prevHash: string, seq: number, type: string, at: string, data: unknown): string {
  return sha256Hex(`${prevHash}|${seq}|${type}|${at}|${canonicalize(data)}`);
}

export function ledgerFor(db: Pick<Db, 'ledger'>, projectId: string): LedgerEvent[] {
  return db.ledger.filter((e) => e.projectId === projectId).sort((a, b) => a.seq - b.seq);
}

export function appendLedger(
  db: Pick<Db, 'ledger'>,
  projectId: string,
  type: LedgerType,
  data: Record<string, unknown>,
  at: string = new Date().toISOString(),
): LedgerEvent {
  const events = ledgerFor(db, projectId);
  const last = events[events.length - 1];
  const seq = (last?.seq ?? 0) + 1;
  const prevHash = last?.hash ?? GENESIS;
  const event: LedgerEvent = {
    seq,
    id: `${projectId}:${seq}`,
    projectId,
    type,
    at,
    data,
    prevHash,
    hash: eventHash(prevHash, seq, type, at, data),
  };
  db.ledger.push(event);
  return event;
}

export interface ChainCheck {
  ok: boolean;
  /** seq of the first event whose hash does not match */
  brokenAt?: number;
  headHash: string;
  count: number;
}

export function verifyChain(events: Pick<LedgerEvent, 'seq' | 'type' | 'at' | 'data' | 'prevHash' | 'hash'>[]): ChainCheck {
  let prev = GENESIS;
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.seq !== i + 1 || e.prevHash !== prev || e.hash !== eventHash(prev, e.seq, e.type, e.at, e.data)) {
      return { ok: false, brokenAt: e.seq, headHash: prev, count: events.length };
    }
    prev = e.hash;
  }
  return { ok: true, headHash: prev, count: events.length };
}

export interface Dossier {
  format: 'nobpay-dossier/1';
  project: {
    id: string;
    name: string;
    sector: string;
    city: string;
    country: string;
    budgetCents: number;
    createdAt: string;
    steps: { index: number; title: string; amountCents: number; status: string }[];
  };
  ledger: Pick<LedgerEvent, 'seq' | 'type' | 'at' | 'data' | 'prevHash' | 'hash'>[];
  headHash: string;
  generatedAt: string;
}

export interface BuiltDossier {
  dossier: Dossier;
  /** exact bytes that get hashed and anchored */
  json: string;
  digest: string;
  upToSeq: number;
}

export function buildDossier(
  db: Pick<Db, 'ledger'>,
  project: Project,
  generatedAt: string = new Date().toISOString(),
): BuiltDossier {
  const events = ledgerFor(db, project.id);
  const chain = verifyChain(events);
  const dossier: Dossier = {
    format: 'nobpay-dossier/1',
    project: {
      id: project.id,
      name: project.name,
      sector: project.sector,
      city: project.city,
      country: project.country,
      budgetCents: project.budgetCents,
      createdAt: project.createdAt,
      steps: project.steps.map((s) => ({ index: s.index, title: s.title, amountCents: s.amountCents, status: s.status })),
    },
    ledger: events.map(({ seq, type, at, data, prevHash, hash }) => ({ seq, type, at, data, prevHash, hash })),
    headHash: chain.headHash,
    generatedAt,
  };
  const json = canonicalize(dossier);
  return { dossier, json, digest: sha256Hex(json), upToSeq: events.length };
}
