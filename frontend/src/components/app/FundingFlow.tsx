'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AmountKeypad } from '@/components/app/AmountKeypad';
import { CopyButton } from '@/components/app/CopyButton';
import { Icon } from '@/components/ui/Icon';
import { Chip, ErrorNote, Spinner } from '@/components/ui/primitives';
import { formatFcfa, formatInt, formatSats, formatUsd, formatUsdShort, usdToSats } from '@/lib/money';
import type { Funding } from '@/lib/types';
import { Tc, useT } from '@/lib/i18n/client';

interface Props {
  projectId: string;
  projectName: string;
  mode: 'mock' | 'sandbox';
  /** demo conveniences are allowed on this instance (ALLOW_DEMO) */
  allowDemo?: boolean;
  /** real bitcoin: the invoice comes from a real wallet, nothing is simulated */
  real?: boolean;
  btcUsd: number;
  usdXof: number;
  /** quick amounts computed on the server (cents) */
  suggestions: { label: string; cents: number }[];
  /** id -> label of the steps, to say which one got unlocked */
  steps: { id: string; index: number; title: string }[];
}

type Stage = 'amount' | 'method' | 'invoice' | 'paid';
const MAX_SATS = 20_000_000;
const nf = { format: formatInt };

function useCountdown(iso?: string): string {
  const [left, setLeft] = useState(() => (iso ? Date.parse(iso) - Date.now() : 0));
  useEffect(() => {
    if (!iso) return;
    const tick = () => setLeft(Date.parse(iso) - Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [iso]);
  if (!iso) return '';
  if (left <= 0) return 'expirée';
  const s = Math.floor(left / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${m}:${String(s % 60).padStart(2, '0')}`;
}

export function FundingFlow({ projectId, projectName, mode, allowDemo = false, real = false, btcUsd, usdXof, suggestions, steps }: Props) {
  const t = useT();
  const router = useRouter();
  const [stage, setStage] = useState<Stage>('amount');
  const [digits, setDigits] = useState('');
  const [funding, setFunding] = useState<Funding | null>(null);
  const [busy, setBusy] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [error, setError] = useState('');
  const [unlocked, setUnlocked] = useState<{ escrowCents: number; activeIndex?: number } | null>(null);
  const settled = useRef(false);

  const dollars = Number(digits || 0);
  const cents = dollars * 100;
  const maxUsd = Math.floor((MAX_SATS / 1e8) * btcUsd);
  const sats = cents > 0 ? usdToSats(cents, btcUsd) : 0;
  const tooLow = dollars > 0 && dollars < 5;
  const tooHigh = sats > MAX_SATS;
  const countdown = useCountdown(funding?.status === 'pending' ? funding.expiresAt : undefined);

  // Physical keyboard on desktop.
  useEffect(() => {
    if (stage !== 'amount') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      if (/^\d$/.test(e.key)) setDigits((d) => `${d}${e.key}`.replace(/^0+/, '').slice(0, 6));
      else if (e.key === 'Backspace') setDigits((d) => d.slice(0, -1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stage]);

  const onPaid = useCallback(async () => {
    if (settled.current) return;
    settled.current = true;
    setStage('paid');
    try {
      const res = await fetch(`/api/projects/${projectId}/state`, { cache: 'no-store' });
      const json = await res.json();
      const active = (json.steps as { id: string; status: string }[] | undefined)?.find((s) => s.status === 'active');
      setUnlocked({ escrowCents: json.escrowCents, activeIndex: steps.find((s) => s.id === active?.id)?.index });
    } catch {
      /* the success screen works without it */
    }
    router.refresh();
  }, [projectId, router, steps]);

  // Poll the invoice while it waits for the payment.
  useEffect(() => {
    if (stage !== 'invoice' || !funding || funding.status !== 'pending') return;
    let stopped = false;
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/fundings/${funding.id}`, { cache: 'no-store' });
        const json = await res.json();
        if (stopped || !res.ok) return;
        const next = json.funding as Funding;
        if (next.status === 'paid') onPaid();
        else if (next.status !== 'pending') setFunding(next);
      } catch {
        /* network blip: next tick */
      }
    }, 2500);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [stage, funding, onPaid]);

  const createInvoice = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/fundings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountCents: cents, method: 'lightning' }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? t('Impossible de créer la facture'));
      settled.current = false;
      setFunding(json.funding);
      setStage('invoice');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const simulate = async () => {
    if (!funding) return;
    setSimulating(true);
    setError('');
    try {
      const res = await fetch(`/api/fundings/${funding.id}/simulate`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? t('Simulation impossible'));
      if ((json.funding as Funding).status === 'paid') onPaid();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSimulating(false);
    }
  };

  const back = () => {
    setError('');
    if (stage === 'method') setStage('amount');
    else if (stage === 'invoice') setStage('method');
    else router.push(`/app/projets/${projectId}`);
  };

  const canContinue = dollars >= 5 && !tooHigh;
  const bolt11 = funding?.bolt11 ?? '';

  return (
    <div className="flex min-h-screen flex-col lg:mx-auto lg:my-8 lg:min-h-[680px] lg:w-full lg:max-w-[560px] lg:overflow-hidden lg:rounded-3xl lg:bg-surface-container-lowest lg:shadow-xl">
      <header className="pt-safe sticky top-0 z-40 bg-surface-container-lowest/85 backdrop-blur-xl">
        <div className="flex h-16 items-center justify-between px-space-md">
          {stage === 'paid' ? (
            <span className="h-11 w-11" />
          ) : (
            <button type="button" onClick={back} aria-label={t('Retour')} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-surface-container">
              <Icon name="arrow_back" />
            </button>
          )}
          <h1 className="min-w-0 truncate px-2 font-title-md text-title-md">{stage === 'paid' ? t('Versement reçu') : t('Financer · {projectName}', { projectName })}</h1>
          <span className="h-11 w-11" />
        </div>
      </header>

      <main id="contenu" className="flex flex-1 flex-col px-space-md pb-8 pt-space-sm" key={stage}>
        <div className="nob-rise flex flex-1 flex-col">
          {stage === 'amount' && (
            <>
              <div className="flex flex-col items-center py-space-md text-center">
                <p className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant"><Tc>Montant à mettre en séquestre</Tc></p>
                <p className={`mt-2 font-headline-xl-mobile text-[44px] font-bold leading-none tracking-tight ${dollars ? 'text-on-surface' : 'text-outline'}`}>
                  {nf.format(dollars)} <span className="text-on-surface-variant">$</span>
                </p>
                <p className="mt-2 min-h-5 font-label-md text-label-md text-on-surface-variant" aria-live="polite">
                  {dollars > 0 && !tooHigh ? `≈ ${formatSats(sats)} · ${formatFcfa(dollars * usdXof)}` : ''}
                </p>
                {tooLow && <p className="mt-1 font-label-md text-label-md text-error"><Tc>Minimum : 5 $</Tc></p>}
                {tooHigh && <p className="mt-1 font-label-md text-label-md text-error"><Tc>Une facture Lightning est limitée à environ</Tc> {nf.format(maxUsd)} <Tc>$. Faites plusieurs versements.</Tc></p>}
              </div>

              {suggestions.length > 0 && (
                <div className="mb-space-md flex flex-wrap justify-center gap-2">
                  {suggestions.map((s) => (
                    <button key={s.label} type="button" onClick={() => setDigits(String(Math.round(s.cents / 100)))} className="flex h-10 items-center gap-1.5 rounded-full bg-primary/10 px-4 font-label-md text-label-md font-semibold text-primary transition hover:bg-primary/15 active:scale-95">
                      {s.label} · {formatUsdShort(s.cents)}
                    </button>
                  ))}
                </div>
              )}

              <div className="mt-auto flex flex-col gap-space-md">
                <AmountKeypad value={digits} onChange={setDigits} />
                <button
                  type="button"
                  disabled={!canContinue}
                  onClick={() => setStage('method')}
                  className="flex h-12 w-full items-center justify-center gap-space-xs rounded-full bg-primary-container font-label-lg text-label-lg font-bold text-on-primary shadow-lg shadow-primary/25 transition hover:bg-primary active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Tc>Continuer</Tc> <Icon name="arrow_forward" size={20} />
                </button>
              </div>
            </>
          )}

          {stage === 'method' && (
            <>
              <div className="py-space-md">
                <h2 className="font-headline-lg-mobile text-headline-lg-mobile font-bold tracking-tight"><Tc>Comment payer ?</Tc></h2>
                <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
                  {formatUsd(cents)} · ≈ {formatSats(sats)}
                </p>
              </div>
              <div className="flex flex-col gap-3">
                <button type="button" aria-pressed="true" className="flex items-center gap-4 rounded-3xl bg-primary/5 p-4 text-left ring-2 ring-primary-container">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#F7931A] text-white">
                    <Icon name="bolt" size={26} filled />
                  </span>
                  <span className="flex-1">
                    <span className="block font-title-md text-title-md"><Tc>Bitcoin Lightning</Tc></span>
                    <span className="block font-body-sm text-body-sm text-on-surface-variant"><Tc>Scannez ou collez une facture depuis n&apos;importe quel portefeuille Lightning.</Tc></span>
                  </span>
                  <Icon name="check_circle" filled className="text-primary" />
                </button>
              </div>
              <div className="mt-space-md flex items-start gap-3 rounded-2xl bg-surface-container-low p-3.5">
                <Icon name="shield_lock" size={22} className="mt-0.5 text-primary" />
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  {real
                    ? t('Les sats arrivent dans le portefeuille Lightning de NobPay et sont comptés pour ce projet. Ils ne sont libérés qu’à votre validation, et vous pouvez reprendre ce qui n’est pas utilisé.')
                    : t('Les fonds arrivent dans un portefeuille Bitnob et sont comptés pour ce projet. Ils ne sont libérés qu’à votre validation.')}
                </p>
              </div>
              <div className="mt-auto flex flex-col gap-3 pt-space-md">
                <ErrorNote>{error}</ErrorNote>
                <button
                  type="button"
                  disabled={busy}
                  onClick={createInvoice}
                  className="flex h-12 w-full items-center justify-center gap-space-xs rounded-full bg-primary-container font-label-lg text-label-lg font-bold text-on-primary shadow-lg shadow-primary/25 transition hover:bg-primary active:scale-[0.98] disabled:opacity-60"
                >
                  {busy ? <Spinner /> : <Icon name="qr_code_2" size={22} />} <Tc>Générer la facture</Tc>
                </button>
              </div>
            </>
          )}

          {stage === 'invoice' && funding && (
            <>
              <div className="flex flex-col items-center gap-3 py-space-sm text-center">
                {mode === 'mock' && funding.mode === 'mock' && <Chip tone="warning" icon="science"><Tc>Facture de démonstration · non payable</Tc></Chip>}
                {funding.mode === 'nwc' && <Chip tone="success" icon="bolt"><Tc>Bitcoin réel · phase pilote, montants plafonnés</Tc></Chip>}
                <p className="font-headline-md text-headline-md font-bold">{formatUsd(funding.amountCents)}</p>
                <p className="-mt-2 font-label-md text-label-md text-on-surface-variant">≈ {formatSats(funding.amountSats ?? 0)}</p>
              </div>

              <div className="mx-auto rounded-3xl bg-white p-4 shadow-md ring-1 ring-outline-variant/40">
                {bolt11 ? <QRCodeSVG value={`lightning:${bolt11}`} size={224} level="L" marginSize={0} title={t('Facture Lightning')} /> : <div className="h-56 w-56" />}
              </div>

              <div className="mt-space-md flex flex-col items-center gap-2">
                {funding.status === 'pending' ? (
                  <p className="flex items-center gap-2 font-label-md text-label-md text-on-surface-variant" role="status">
                    <Spinner className="h-4 w-4 text-primary" /> <Tc>En attente du paiement · expire dans</Tc> {countdown}
                  </p>
                ) : (
                  <p className="font-label-md text-label-md font-semibold text-error" role="status">
                    <Tc>Cette facture a expiré.</Tc>
                  </p>
                )}
                <div className="flex flex-wrap justify-center gap-2">
                  <CopyButton value={bolt11} label={t('Copier la facture')} doneLabel="Facture copiée" />
                  <a href={`lightning:${bolt11}`} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-surface-container px-3.5 font-label-md text-label-md font-semibold text-primary transition hover:bg-surface-container-high active:scale-95">
                    <Icon name="open_in_new" size={16} /> <Tc>Ouvrir mon portefeuille</Tc>
                  </a>
                </div>
                <p className="max-w-xs break-all text-center font-mono text-[11px] leading-snug text-outline">{bolt11.slice(0, 28)}…{bolt11.slice(-10)}</p>
                <details className="mt-1 w-full max-w-sm rounded-2xl bg-surface-container-low p-3 text-left">
                  <summary className="cursor-pointer font-label-md text-label-md font-semibold text-primary"><Tc>Comment payer avec Lightning ?</Tc></summary>
                  <ol className="mt-2 list-decimal space-y-1 pl-5 font-body-sm text-body-sm text-on-surface-variant">
                    <li><Tc>Ouvrez un portefeuille Lightning (n’importe lequel : le paiement ne passe pas par une application imposée).</Tc></li>
                    <li><Tc>Scannez ce code, ou collez la facture copiée.</Tc></li>
                    <li><Tc>Confirmez le montant. Cette page se met à jour toute seule dès que le portefeuille de NobPay a reçu les sats.</Tc></li>
                  </ol>
                  <p className="mt-2 font-label-sm text-label-sm text-outline"><Tc>Lightning est le réseau de paiement de Bitcoin : rapide et sans intermédiaire bancaire.</Tc></p>
                </details>
              </div>

              <div className="mt-auto flex flex-col gap-3 pt-space-lg">
                <ErrorNote>{error}</ErrorNote>
                {funding.status !== 'pending' && (
                  <button type="button" onClick={createInvoice} disabled={busy} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary-container font-label-lg text-label-lg font-bold text-on-primary shadow-lg disabled:opacity-60">
                    {busy ? <Spinner /> : <Icon name="refresh" size={20} />} <Tc>Nouvelle facture</Tc>
                  </button>
                )}
                {(funding.mode === 'mock' || (funding.mode === 'sandbox' && allowDemo)) && funding.status === 'pending' && (
                  <div className="rounded-2xl bg-tertiary-fixed/50 p-3.5 text-on-tertiary-fixed">
                    <p className="mb-2 flex items-start gap-2 font-body-sm text-body-sm">
                      <Icon name="info" size={18} className="mt-0.5 shrink-0" />
                      <span>
                        {funding.mode === 'mock' ? (
                          <>
                            <strong><Tc>Mode démonstration.</Tc></strong> <Tc>Cette facture n&apos;existe pas sur le réseau Lightning. Le bouton ci-dessous envoie à NobPay un événement signé, comme le ferait Bitnob après un vrai paiement.</Tc>
                          </>
                        ) : (
                          <>
                            <strong><Tc>Démonstration.</Tc></strong> <Tc>Cette facture existe chez Bitnob (réseau de test) mais n&apos;a pas été payée. Le bouton ci-dessous crédite le séquestre par un événement signé par NobPay : ce versement sera marqué « simulé » dans le registre.</Tc>
                          </>
                        )}
                      </span>
                    </p>
                    <button type="button" onClick={simulate} disabled={simulating} className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-on-tertiary-fixed font-label-lg text-label-lg font-bold text-tertiary-fixed transition active:scale-[0.98] disabled:opacity-60">
                      {simulating ? <Spinner /> : <Icon name="bolt" size={20} filled />} <Tc>Simuler le paiement</Tc>
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

          {stage === 'paid' && (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 py-space-xl text-center">
              <span className="nob-pop flex h-24 w-24 items-center justify-center rounded-full bg-[#DCFCE7] text-[#15803D] shadow-lg">
                <Icon name="check" size={56} />
              </span>
              <div>
                <h2 className="font-headline-lg-mobile text-headline-lg-mobile font-bold tracking-tight">{funding ? formatUsd(funding.amountCents) : ''} <Tc>reçus</Tc></h2>
                <p className="mt-1 font-body-md text-body-md text-on-surface-variant"><Tc>Votre argent est en séquestre. Il ne bougera qu&apos;avec votre accord.</Tc></p>
              </div>
              {unlocked && (
                <div className="w-full rounded-2xl bg-surface-container-low p-4 text-left">
                  <p className="flex items-center justify-between font-body-md text-body-md">
                    <span className="text-on-surface-variant"><Tc>Séquestre du projet</Tc></span>
                    <strong>{formatUsd(unlocked.escrowCents)}</strong>
                  </p>
                  {unlocked.activeIndex && (
                    <p className="mt-2 flex items-center gap-2 font-label-md text-label-md text-[#15803D]">
                      <Icon name="lock_open" size={18} /> <Tc>L&apos;étape</Tc> {unlocked.activeIndex} <Tc>est débloquée : l&apos;équipe sur place peut envoyer sa preuve.</Tc>
                    </p>
                  )}
                </div>
              )}
              <div className="mt-4 flex w-full flex-col gap-3">
                <Link href={`/app/projets/${projectId}`} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary-container font-label-lg text-label-lg font-bold text-on-primary shadow-lg shadow-primary/25">
                  <Tc>Voir le projet</Tc>
                </Link>
                <Link href="/app/portefeuille" className="flex h-12 w-full items-center justify-center rounded-full bg-surface-container-low font-label-lg text-label-lg font-semibold text-on-surface hover:bg-surface-container">
                  <Tc>Voir le portefeuille</Tc>
                </Link>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
