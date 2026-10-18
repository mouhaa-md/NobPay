'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { ErrorNote, Spinner } from '@/components/ui/primitives';
import { formatFcfa, formatRate, formatUsd, formatUsdShort } from '@/lib/money';
import { MOBILE_NETWORKS } from '@/lib/templates';
import type { PayoutQuote, Supplier } from '@/lib/types';

interface Props {
  projectId: string;
  stepId: string;
  stepTitle: string;
  amountCents: number;
  escrowCents: number;
  supplier: Supplier;
  mode: 'mock' | 'sandbox';
  /** the instance accepts the simulated-payment fallback (ALLOW_DEMO) */
  allowDemo: boolean;
}

const REASONS = ['Photos floues', 'Facture illisible', 'Montant incorrect', 'Ce n’est pas le bon chantier'];

function secondsLeft(iso: string): number {
  return Math.max(0, Math.floor((Date.parse(iso) - Date.now()) / 1000));
}

/** Approve (quote -> confirm) or refuse the proof of a step. */
export function ReleasePanel({ projectId, stepId, stepTitle, amountCents, escrowCents, supplier, mode, allowDemo }: Props) {
  const router = useRouter();
  const base = `/api/projects/${projectId}/steps/${stepId}`;
  const [quote, setQuote] = useState<PayoutQuote | null>(null);
  const [left, setLeft] = useState(0);
  const [busy, setBusy] = useState<'quote' | 'pay' | 'reject' | null>(null);
  const [error, setError] = useState('');
  const [canSimulate, setCanSimulate] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');

  const short = escrowCents < amountCents;

  useEffect(() => {
    if (!quote) return;
    const tick = () => setLeft(secondsLeft(quote.expiresAt));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [quote]);

  const call = async (url: string, body?: unknown) => {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(json.error ?? 'Une erreur est survenue'), { code: json.code as string | undefined });
    return json;
  };

  const getQuote = async (simulate = false) => {
    setBusy('quote');
    setError('');
    setCanSimulate(false);
    try {
      const json = await call(`${base}/quote`, { simulate });
      setQuote(json.quote);
    } catch (e) {
      setError((e as Error).message);
      if ((e as { code?: string }).code === 'gateway_error' && mode === 'sandbox' && allowDemo) setCanSimulate(true);
    } finally {
      setBusy(null);
    }
  };

  const pay = async () => {
    setBusy('pay');
    setError('');
    try {
      await call(`${base}/release`);
      setQuote(null);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
      if ((e as { code?: string }).code === 'quote_expired') setQuote(null);
    }
  };

  const reject = async () => {
    setBusy('reject');
    setError('');
    try {
      await call(`${base}/reject`, { note });
      setRejecting(false);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  };

  const expired = !!quote && left <= 0;

  return (
    <div className="flex flex-col gap-3">
      {short && (
        <div className="flex items-start gap-3 rounded-2xl bg-[#FEF3C7] p-3.5 text-[#92400E]">
          <Icon name="account_balance_wallet" size={22} className="mt-0.5 shrink-0" />
          <div className="font-body-sm text-body-sm">
            Le séquestre ({formatUsdShort(escrowCents)}) ne couvre pas cette étape ({formatUsdShort(amountCents)}).
            <Link href={`/app/projets/${projectId}/financer`} className="ml-1 font-semibold underline">
              Financer le projet
            </Link>
          </div>
        </div>
      )}

      <ErrorNote>{error}</ErrorNote>
      {canSimulate && (
        <button type="button" onClick={() => getQuote(true)} className="flex h-11 items-center justify-center gap-2 rounded-full bg-tertiary-fixed font-label-lg text-label-lg font-semibold text-on-tertiary-fixed">
          <Icon name="science" size={20} /> Continuer en simulation (démo)
        </button>
      )}

      <button
        type="button"
        disabled={short || busy !== null}
        onClick={() => getQuote(false)}
        className="flex h-12 w-full items-center justify-center gap-space-xs rounded-full bg-primary-container font-label-lg text-label-lg font-bold text-on-primary shadow-lg shadow-primary/25 transition hover:bg-primary active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy === 'quote' ? <Spinner /> : <Icon name="verified" size={22} filled />} Valider et payer {formatUsdShort(amountCents)}
      </button>
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => setRejecting(true)}
        className="flex h-12 w-full items-center justify-center gap-space-xs rounded-full bg-surface-container-lowest font-label-lg text-label-lg font-semibold text-error shadow-sm ring-1 ring-error/30 transition hover:bg-error-container/40 active:scale-[0.98] disabled:opacity-50"
      >
        <Icon name="undo" size={20} /> Refuser cette preuve
      </button>

      {/* Quote sheet */}
      {quote && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-on-surface/50 backdrop-blur-sm lg:items-center" role="presentation" onClick={() => busy !== 'pay' && setQuote(null)}>
          <div role="dialog" aria-modal="true" aria-label="Confirmer le paiement" className="nob-rise pb-safe max-h-[92vh] w-full max-w-[480px] overflow-y-auto rounded-t-3xl bg-surface-container-lowest p-space-md shadow-2xl lg:rounded-3xl lg:p-space-lg" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-outline-variant" />
            <h3 className="font-headline-md text-headline-md font-bold">Confirmer le paiement</h3>
            <p className="mb-space-md font-body-sm text-body-sm text-on-surface-variant">{stepTitle}</p>

            <div className="mb-space-md flex items-center gap-3 rounded-2xl bg-surface-container-low p-3.5">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon name="smartphone" size={22} />
              </span>
              <span className="min-w-0">
                <span className="block truncate font-title-md text-title-md">{supplier.name}</span>
                <span className="block truncate font-body-sm text-body-sm text-on-surface-variant">
                  {MOBILE_NETWORKS[supplier.network]} · {supplier.phone}
                </span>
              </span>
            </div>

            <dl className="mb-space-md flex flex-col gap-2.5 font-body-md text-body-md">
              <Row label="Débité de votre séquestre" value={formatUsd(quote.amountUsdCents)} />
              <Row label="Taux appliqué" value={`1 $ = ${formatRate(quote.rate)} FCFA`} />
              <Row label="Frais" value={quote.feeUsdCents > 0 ? formatUsd(quote.feeUsdCents) : 'Aucun frais ajouté'} />
              <div className="my-1 h-px bg-outline-variant/50" />
              <Row label="Le fournisseur reçoit" value={formatFcfa(quote.amountFcfa)} strong />
            </dl>

            <p className={`mb-space-sm flex items-center justify-center gap-1.5 font-label-md text-label-md ${expired ? 'text-error' : 'text-on-surface-variant'}`} role="status">
              <Icon name={expired ? 'timer_off' : 'timer'} size={16} />
              {expired ? 'Devis expiré' : `Devis valable encore ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`}
              {quote.mode === 'mock' && ' · simulation'}
            </p>

            <ErrorNote>{error}</ErrorNote>
            <div className="mt-space-sm flex flex-col gap-2">
              {expired ? (
                <button type="button" onClick={() => getQuote(quote.mode === 'mock' && mode === 'sandbox')} disabled={busy !== null} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary-container font-label-lg text-label-lg font-bold text-on-primary shadow-lg disabled:opacity-60">
                  {busy === 'quote' ? <Spinner /> : <Icon name="refresh" size={20} />} Actualiser le devis
                </button>
              ) : (
                <button type="button" onClick={pay} disabled={busy !== null} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary-container font-label-lg text-label-lg font-bold text-on-primary shadow-lg shadow-primary/25 transition active:scale-[0.98] disabled:opacity-60">
                  {busy === 'pay' ? <Spinner /> : <Icon name="lock_open" size={20} />} Confirmer et payer
                </button>
              )}
              <button type="button" onClick={() => setQuote(null)} disabled={busy === 'pay'} className="h-11 rounded-full font-label-lg text-label-lg text-on-surface-variant hover:bg-surface-container">
                Annuler
              </button>
            </div>
            <p className="mt-2 text-center font-label-sm text-label-sm text-on-surface-variant">Un paiement confirmé ne peut pas être annulé.</p>
          </div>
        </div>
      )}

      {/* Reject sheet */}
      {rejecting && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-on-surface/50 backdrop-blur-sm lg:items-center" role="presentation" onClick={() => busy !== 'reject' && setRejecting(false)}>
          <div role="dialog" aria-modal="true" aria-label="Refuser la preuve" className="nob-rise pb-safe w-full max-w-[480px] rounded-t-3xl bg-surface-container-lowest p-space-md shadow-2xl lg:rounded-3xl lg:p-space-lg" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-outline-variant" />
            <h3 className="font-headline-md text-headline-md font-bold">Refuser cette preuve</h3>
            <p className="mb-space-sm font-body-sm text-body-sm text-on-surface-variant">Aucun argent ne bouge. L&apos;équipe sur place devra renvoyer une preuve.</p>
            <div className="mb-3 flex flex-wrap gap-2">
              {REASONS.map((r) => (
                <button key={r} type="button" onClick={() => setNote(r)} aria-pressed={note === r} className={`h-9 rounded-full px-3.5 font-label-md text-label-md transition ${note === r ? 'bg-primary-container text-on-primary' : 'bg-surface-container-low text-on-surface hover:bg-surface-container'}`}>
                  {r}
                </button>
              ))}
            </div>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={3} placeholder="Précisez si besoin (facultatif)" className="mb-3 w-full resize-none rounded-2xl bg-surface-container-low p-3 font-body-md text-on-surface outline-none placeholder:text-outline focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary-container" />
            <ErrorNote>{error}</ErrorNote>
            <div className="mt-2 flex flex-col gap-2">
              <button type="button" onClick={reject} disabled={busy !== null} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-error font-label-lg text-label-lg font-bold text-on-error disabled:opacity-60">
                {busy === 'reject' ? <Spinner /> : <Icon name="undo" size={20} />} Refuser la preuve
              </button>
              <button type="button" onClick={() => setRejecting(false)} className="h-11 rounded-full font-label-lg text-label-lg text-on-surface-variant hover:bg-surface-container">
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-on-surface-variant">{label}</dt>
      <dd className={strong ? 'font-headline-md text-headline-md font-bold text-primary' : 'font-semibold text-on-surface'}>{value}</dd>
    </div>
  );
}
