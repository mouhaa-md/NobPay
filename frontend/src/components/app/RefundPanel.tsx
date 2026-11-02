'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { ErrorNote, Spinner } from '@/components/ui/primitives';
import { formatUsd, formatUsdShort, parseUsdToCents } from '@/lib/money';
import { Tc, useT } from '@/lib/i18n/client';

interface Props {
  projectId: string;
  escrowCents: number;
  /** no money moves here (demonstration or Bitnob sandbox) */
  simulated: boolean;
  /** why the refund cannot be asked right now (a proof waits for a decision, a payment is in flight) */
  blockedReason?: string;
}

/** The funder takes the unused escrow back, to a Lightning address. Without an exit, an escrow looks like a trap. */
export function RefundPanel({ projectId, escrowCents, simulated, blockedReason }: Props) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState((escrowCents / 100).toFixed(2));
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ amountCents: number; uncertain: boolean; simulated: boolean } | null>(null);

  if (escrowCents < 100) return null;
  const cents = parseUsdToCents(amount);
  const invalid = cents < 100 || cents > escrowCents;

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountCents: cents, address: address.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? t('Le remboursement a échoué.'));
      setDone({ amountCents: json.refund.amountCents, uncertain: !!json.refund.uncertain, simulated: json.refund.rail === 'simulated' });
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3">
      <button
        type="button"
        disabled={!!blockedReason}
        onClick={() => setOpen(true)}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-surface-container font-label-lg text-label-lg font-semibold text-primary transition hover:bg-surface-container-high active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Icon name="undo" size={18} /> <Tc>Reprendre le séquestre inutilisé</Tc>
      </button>
      {blockedReason && <p className="mt-1.5 text-center font-label-sm text-label-sm text-on-surface-variant">{blockedReason}</p>}

      {open && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-on-surface/50 backdrop-blur-sm lg:items-center" role="presentation" onClick={() => !busy && setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label={t('Reprendre le séquestre')} className="nob-rise pb-safe max-h-[92vh] w-full max-w-[480px] overflow-y-auto rounded-t-3xl bg-surface-container-lowest p-space-md shadow-2xl lg:rounded-3xl lg:p-space-lg" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-outline-variant" />
            {done ? (
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <span className="nob-pop flex h-16 w-16 items-center justify-center rounded-full bg-[#DCFCE7] text-[#15803D]">
                  <Icon name="check" size={36} />
                </span>
                <h3 className="font-headline-md text-headline-md font-bold">{done.uncertain ? t('Remboursement en cours') : t('Séquestre remboursé')}</h3>
                <p className="font-body-md text-body-md text-on-surface-variant">
                  {done.uncertain
                    ? t('{formatUsd} sont réservés. Le portefeuille n’a pas encore confirmé : NobPay vérifie, la page se met à jour toute seule. Ne refaites pas la demande.', { formatUsd: formatUsd(done.amountCents) })
                    : done.simulated
                      ? t('{formatUsd} sortent du séquestre. Démonstration : aucun argent réel n’a bougé.', { formatUsd: formatUsd(done.amountCents) })
                      : t('{formatUsd} ont été envoyés en sats à votre adresse Lightning.', { formatUsd: formatUsd(done.amountCents) })}
                </p>
                <button type="button" onClick={() => setOpen(false)} className="mt-2 h-11 w-full rounded-full bg-primary-container font-label-lg text-label-lg font-bold text-on-primary">
                  <Tc>Fermer</Tc>
                </button>
              </div>
            ) : (
              <>
                <h3 className="font-headline-md text-headline-md font-bold"><Tc>Reprendre le séquestre</Tc></h3>
                <p className="mb-space-md font-body-sm text-body-sm text-on-surface-variant">
                  <Tc>Disponible :</Tc> <strong>{formatUsdShort(escrowCents)}</strong><Tc>. Les fonds déjà libérés ou réservés ne peuvent pas être repris.</Tc>
                </p>
                <label className="mb-3 flex flex-col gap-1.5 font-label-md text-label-md text-on-surface-variant">
                  <Tc>Montant à reprendre ($)</Tc>
                  <input className="h-12 w-full rounded-2xl bg-surface-container-low px-space-md font-body-lg text-on-surface outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary-container" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
                </label>
                <label className="mb-3 flex flex-col gap-1.5 font-label-md text-label-md text-on-surface-variant">
                  <Tc>Votre adresse Lightning</Tc>
                  <input
                    className="h-12 w-full rounded-2xl bg-surface-container-low px-space-md font-body-lg text-on-surface outline-none placeholder:text-outline focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary-container"
                    type="email"
                    inputMode="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder={t('vous@portefeuille.com')}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    maxLength={130}
                  />
                  <span className="font-body-sm text-body-sm font-normal text-outline">
                    {simulated ? t('Démonstration : saisissez une adresse quelconque, aucun argent réel ne bouge.') : t('Elle ressemble à une adresse e-mail et se trouve dans votre portefeuille Lightning.')}
                  </span>
                </label>
                <p className="mb-2 font-label-sm text-label-sm text-on-surface-variant">
                  <Tc>Le montant est converti en sats au prix du bitcoin au moment du remboursement. Un remboursement confirmé ne peut pas être annulé.</Tc>
                </p>
                <ErrorNote>{error}</ErrorNote>
                <div className="mt-2 flex flex-col gap-2">
                  <button type="button" disabled={busy || invalid || address.trim().length < 3} onClick={submit} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary-container font-label-lg text-label-lg font-bold text-on-primary shadow-lg shadow-primary/25 transition active:scale-[0.98] disabled:opacity-50">
                    {busy ? <Spinner /> : <Icon name="undo" size={20} />} <Tc>Reprendre</Tc> {invalid ? '' : formatUsdShort(cents)}
                  </button>
                  <button type="button" onClick={() => setOpen(false)} disabled={busy} className="h-11 rounded-full font-label-lg text-label-lg text-on-surface-variant hover:bg-surface-container">
                    <Tc>Annuler</Tc>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
