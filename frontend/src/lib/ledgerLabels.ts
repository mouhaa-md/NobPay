import type { LedgerType } from './types';

/** Plain-French names of the ledger events, shared by the app and the public verification page. */
export const LEDGER_LABEL: Record<LedgerType, { label: string; icon: string; tone: string }> = {
  project_created: { label: 'Projet créé', icon: 'flag', tone: 'bg-surface-container text-primary' },
  funding_paid: { label: 'Fonds reçus en séquestre', icon: 'bolt', tone: 'bg-[#FFEDD5] text-[#C26700]' },
  proof_submitted: { label: 'Preuve envoyée', icon: 'photo_camera', tone: 'bg-[#FEF3C7] text-[#B45309]' },
  step_approved: { label: 'Étape validée', icon: 'verified', tone: 'bg-[#DCFCE7] text-[#15803D]' },
  step_rejected: { label: 'Preuve refusée', icon: 'undo', tone: 'bg-error-container text-on-error-container' },
  payout_started: { label: 'Paiement lancé', icon: 'send', tone: 'bg-surface-container text-primary' },
  payout_completed: { label: 'Paiement confirmé', icon: 'payments', tone: 'bg-[#DCFCE7] text-[#15803D]' },
  payout_failed: { label: 'Paiement non abouti', icon: 'error', tone: 'bg-error-container text-on-error-container' },
};

export const shortHash = (hash: string, head = 8, tail = 6): string => (hash.length > head + tail + 1 ? `${hash.slice(0, head)}…${hash.slice(-tail)}` : hash);
