import { canonicalize } from './canonical';
import { sha256Hex } from './sha256';

/**
 * Independent re-check of a NobPay dossier, runs in the browser (or in tests).
 * It needs nothing from the server except the dossier file itself.
 */

export const GENESIS = '0'.repeat(64);

export interface DossierEventLike {
  seq: number;
  type: string;
  at: string;
  data: Record<string, unknown>;
  prevHash: string;
  hash: string;
}

export interface DossierLike {
  format: string;
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
  ledger: DossierEventLike[];
  headHash: string;
  generatedAt: string;
}

export interface DossierReport {
  /** SHA-256 of the exact file content */
  digest: string;
  /** compared with the anchored digest when one is given */
  digestMatches: boolean | null;
  formatOk: boolean;
  chainOk: boolean;
  brokenAt?: number;
  headOk: boolean;
  eventCount: number;
  dossier?: DossierLike;
  error?: string;
}

export async function verifyDossier(json: string, expectedDigest?: string): Promise<DossierReport> {
  const digest = await sha256Hex(json);
  const base: DossierReport = {
    digest,
    digestMatches: expectedDigest ? digest === expectedDigest.toLowerCase() : null,
    formatOk: false,
    chainOk: false,
    headOk: false,
    eventCount: 0,
  };

  let dossier: DossierLike;
  try {
    dossier = JSON.parse(json) as DossierLike;
  } catch {
    return { ...base, error: "Ce fichier n'est pas un dossier NobPay lisible (JSON invalide)." };
  }
  if (dossier?.format !== 'nobpay-dossier/1' || !Array.isArray(dossier.ledger) || !dossier.project) {
    return { ...base, error: "Ce fichier n'est pas un dossier NobPay (format inconnu)." };
  }

  let prev = GENESIS;
  let brokenAt: number | undefined;
  for (let i = 0; i < dossier.ledger.length; i++) {
    const e = dossier.ledger[i];
    const expected = await sha256Hex(`${prev}|${e.seq}|${e.type}|${e.at}|${canonicalize(e.data)}`);
    if (e.seq !== i + 1 || e.prevHash !== prev || e.hash !== expected) {
      brokenAt = e.seq;
      break;
    }
    prev = e.hash;
  }
  const chainOk = brokenAt === undefined;
  return {
    ...base,
    formatOk: true,
    chainOk,
    brokenAt,
    headOk: chainOk && dossier.headHash === prev,
    eventCount: dossier.ledger.length,
    dossier,
  };
}
