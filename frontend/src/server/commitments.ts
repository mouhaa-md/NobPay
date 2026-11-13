import { randomBytes } from 'node:crypto';
import type { Proof, Step } from '@/lib/types';
import { canonicalize, sha256Hex } from './crypto';

/**
 * Sealed fingerprints ("salted commitments") for what must not be published: where a phone was when it sent a proof, and the
 * free text people type (notes).
 *
 * The ledger is public: it forms the dossier that anybody with the link can download and whose SHA-256 is anchored on Bitcoin.
 * So the ledger holds only `SHA-256(domain | salt | value)`. The value and its salt (128 random bits) stay in the private proof
 * record. Nobody can find a position by trying candidates (the salt is unknown), the record cannot be changed afterwards without
 * contradicting the anchored fingerprint, and whoever holds the value and the salt (the funder) can open the commitment later to
 * prove what was recorded. Erasing the private record leaves only fingerprints that mean nothing.
 *
 * This follows what the EDPB recommends for personal data around a blockchain (Guidelines 02/2025): keep the data off-chain and
 * record only salted cryptographic evidence. Pseudonymised data remains personal data in law (Guidelines 01/2025), which is why the
 * salt is never published either.
 */

export type CommitmentKind = 'gps' | 'note';

export const newSalt = (): string => randomBytes(16).toString('hex');

/** `value` is any JSON value: it is put in canonical form first, so the same value always gives the same fingerprint. */
export function commit(kind: CommitmentKind, salt: string, value: unknown): string {
  return sha256Hex(`nobpay/commit/v1|${kind}|${salt}|${canonicalize(value)}`);
}

/** Checks a revealed value and salt against a fingerprint found in a dossier. */
export function opensCommitment(commitment: string, kind: CommitmentKind, salt: string, value: unknown): boolean {
  return typeof salt === 'string' && salt.length >= 16 && commit(kind, salt, value) === commitment;
}

/** A free-text note and its salt, ready for the private record (nothing when there is no note). */
export function sealNote(note: string | undefined): { note?: string; noteSalt?: string } {
  return note ? { note, noteSalt: newSalt() } : {};
}

/** The fingerprint of a note, as the ledger records it: it says that a note exists, never what it says. */
export function noteLedgerData(note: string | undefined, noteSalt: string | undefined): Record<string, unknown> {
  return note && noteSalt ? { hasNote: true, noteCommit: commit('note', noteSalt, note) } : {};
}

/**
 * What the public ledger records of a proof: the file fingerprints and dates, the fingerprint of each position, the fingerprint of the
 * note. Never a coordinate, never a word of free text.
 */
export function proofSubmittedData(step: Pick<Step, 'id' | 'index'>, proof: Proof): Record<string, unknown> {
  return {
    stepId: step.id,
    index: step.index,
    photos: proof.photos.map((p) => ({
      sha256: p.sha256,
      takenAt: p.takenAt,
      ...(p.gps && p.gpsSalt ? { gpsCommit: commit('gps', p.gpsSalt, p.gps) } : {}),
    })),
    invoice: proof.invoice ? { sha256: proof.invoice.sha256, amountFcfa: proof.invoiceAmountFcfa } : undefined,
    ...noteLedgerData(proof.note, proof.noteSalt),
  };
}
