'use client';

import { QRCodeSVG } from 'qrcode.react';
import { useCallback, useEffect, useState } from 'react';
import { CopyButton } from '@/components/app/CopyButton';
import { Icon } from '@/components/ui/Icon';
import { Chip, ErrorNote, Spinner } from '@/components/ui/primitives';
import { Tc, useT } from '@/lib/i18n/client';
import { formatInt, formatSats, formatUsd } from '@/lib/money';

interface Invoice {
  id: string;
  status: 'pending' | 'paid' | 'expired' | 'failed';
  amountCents: number;
  amountSats?: number;
  bolt11?: string;
  expiresAt?: string;
  mode: 'mock' | 'sandbox' | 'nwc';
}

const QUICK = [10, 25, 50, 100];

/** The family link: pick an amount, optionally a first name, pay the invoice with any Lightning wallet. */
export function ContributeFlow({ token, ownerFirstName, maxUsd, canSimulate }: { token: string; ownerFirstName: string; maxUsd: number; canSimulate: boolean }) {
  const t = useT();
  const [dollars, setDollars] = useState('25');
  const [name, setName] = useState('');
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [busy, setBusy] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [error, setError] = useState('');

  const amount = Number(dollars.replace(/\D/g, '') || 0);
  const tooLow = amount < 5;
  const tooHigh = maxUsd > 0 && amount > maxUsd;
  const base = `/api/contribute/${encodeURIComponent(token)}`;

  const create = async () => {
    setBusy(true);
    setError('');
    const res = await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ amountCents: amount * 100, name: name.trim() || undefined }) });
    const json = (await res.json().catch(() => ({}))) as { funding?: Invoice; error?: string };
    setBusy(false);
    if (!res.ok || !json.funding) return setError(json.error ?? t('Impossible de créer la facture'));
    setInvoice(json.funding);
  };

  const poll = useCallback(async () => {
    if (!invoice) return;
    const res = await fetch(`${base}/${invoice.id}`, { cache: 'no-store' }).catch(() => null);
    if (!res?.ok) return;
    const next = ((await res.json()) as { funding: Invoice }).funding;
    setInvoice((cur) => (cur && cur.status !== next.status ? { ...cur, ...next } : cur));
  }, [base, invoice]);

  useEffect(() => {
    if (!invoice || invoice.status !== 'pending') return;
    const id = setInterval(() => void poll(), 2500);
    return () => clearInterval(id);
  }, [invoice, poll]);

  const simulate = async () => {
    if (!invoice) return;
    setSimulating(true);
    setError('');
    const res = await fetch(`${base}/${invoice.id}/simulate`, { method: 'POST' });
    const json = (await res.json().catch(() => ({}))) as { funding?: Invoice; error?: string };
    setSimulating(false);
    if (!res.ok || !json.funding) return setError(json.error ?? t('Simulation impossible'));
    setInvoice({ ...invoice, ...json.funding });
  };

  if (invoice?.status === 'paid') {
    return (
      <div className="flex flex-col items-center gap-3 py-space-md text-center" role="status">
        <span className="nob-pop flex h-20 w-20 items-center justify-center rounded-full bg-[#DCFCE7] text-[#15803D] shadow-lg">
          <Icon name="check" size={48} />
        </span>
        <h2 className="font-headline-md text-headline-md font-bold">{t('{amount} reçus, merci !', { amount: formatUsd(invoice.amountCents) })}</h2>
        <p className="font-body-md text-body-md text-on-surface-variant">
          {t('Votre contribution est en séquestre dans le projet de {owner}. Elle ne sera libérée qu’étape par étape, sur preuve.', { owner: ownerFirstName })}
        </p>
      </div>
    );
  }

  if (invoice) {
    const bolt11 = invoice.bolt11 ?? '';
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        {invoice.mode === 'nwc' && <Chip tone="success" icon="bolt"><Tc>Bitcoin réel · phase pilote, montants plafonnés</Tc></Chip>}
        {invoice.mode !== 'nwc' && <Chip tone="warning" icon="science"><Tc>Facture de démonstration · non payable</Tc></Chip>}
        <p className="font-headline-md text-headline-md font-bold">{formatUsd(invoice.amountCents)}</p>
        <p className="-mt-2 font-label-md text-label-md text-on-surface-variant">≈ {formatSats(invoice.amountSats ?? 0)}</p>
        <div className="rounded-3xl bg-white p-4 shadow-md ring-1 ring-outline-variant/40">
          {bolt11 ? <QRCodeSVG value={`lightning:${bolt11}`} size={208} level="L" marginSize={0} title={t('Facture Lightning')} /> : <div className="h-52 w-52" />}
        </div>
        {invoice.status === 'pending' ? (
          <p className="flex items-center gap-2 font-label-md text-label-md text-on-surface-variant" role="status">
            <Spinner className="h-4 w-4 text-primary" /> <Tc>En attente du paiement…</Tc>
          </p>
        ) : (
          <p className="font-label-md text-label-md font-semibold text-error" role="status"><Tc>Cette facture a expiré.</Tc></p>
        )}
        <div className="flex flex-wrap justify-center gap-2">
          <CopyButton value={bolt11} label={t('Copier la facture')} doneLabel="Facture copiée" />
          <a href={`lightning:${bolt11}`} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-surface-container px-3.5 font-label-md text-label-md font-semibold text-primary transition hover:bg-surface-container-high active:scale-95">
            <Icon name="open_in_new" size={16} /> <Tc>Ouvrir mon portefeuille</Tc>
          </a>
        </div>
        {invoice.status !== 'pending' && (
          <button type="button" onClick={() => setInvoice(null)} className="inline-flex h-11 items-center gap-2 rounded-full bg-primary-container px-5 font-label-lg text-label-lg font-bold text-on-primary shadow-md">
            <Icon name="refresh" size={20} /> <Tc>Nouvelle facture</Tc>
          </button>
        )}
        {canSimulate && invoice.mode !== 'nwc' && invoice.status === 'pending' && (
          <button type="button" onClick={simulate} disabled={simulating} className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-on-tertiary-fixed font-label-lg text-label-lg font-bold text-tertiary-fixed disabled:opacity-60">
            {simulating ? <Spinner /> : <Icon name="bolt" size={20} filled />} <Tc>Simuler le paiement</Tc>
          </button>
        )}
        <ErrorNote>{error}</ErrorNote>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!tooLow && !tooHigh) void create();
      }}
    >
      <div>
        <p className="mb-2 font-label-md text-label-md text-on-surface-variant"><Tc>Combien voulez-vous ajouter ?</Tc></p>
        <div className="flex flex-wrap gap-2">
          {QUICK.filter((q) => !maxUsd || q <= maxUsd).map((q) => (
            <button key={q} type="button" onClick={() => setDollars(String(q))} className={`h-10 rounded-full px-4 font-label-lg text-label-lg font-semibold transition active:scale-95 ${amount === q ? 'bg-primary-container text-on-primary shadow-md' : 'bg-primary/10 text-primary hover:bg-primary/15'}`}>
              {q} $
            </button>
          ))}
        </div>
        <label className="mt-3 flex items-center gap-2 rounded-2xl bg-surface-container-low px-4 ring-1 ring-outline-variant/40 focus-within:ring-2 focus-within:ring-primary-container">
          <input
            inputMode="numeric"
            aria-label={t('Montant en dollars')}
            className="h-12 w-full bg-transparent font-title-lg text-title-lg outline-none"
            value={dollars}
            onChange={(e) => setDollars(e.target.value.replace(/\D/g, '').slice(0, 6))}
          />
          <span className="font-title-lg text-title-lg text-on-surface-variant">$</span>
        </label>
        {tooLow && <p className="mt-1 font-label-md text-label-md text-error"><Tc>Minimum : 5 $</Tc></p>}
        {tooHigh && <p className="mt-1 font-label-md text-label-md text-error">{t('Pendant cette phase pilote, un versement est limité à {max} $.', { max: formatInt(maxUsd) })}</p>}
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="font-label-md text-label-md text-on-surface-variant"><Tc>Votre prénom (facultatif)</Tc></span>
        <input
          className="h-12 w-full rounded-2xl bg-surface-container-low px-4 font-body-lg text-on-surface outline-none ring-1 ring-outline-variant/40 focus:ring-2 focus:ring-primary-container"
          value={name}
          maxLength={30}
          autoComplete="given-name"
          onChange={(e) => setName(e.target.value)}
          placeholder={t('Ex. Awa')}
        />
        <span className="font-label-sm text-label-sm text-on-surface-variant"><Tc>S’il est donné, il sera écrit dans le dossier public du projet, à côté du montant reçu.</Tc></span>
      </label>

      <button type="submit" disabled={busy || tooLow || tooHigh} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary-container font-label-lg text-label-lg font-bold text-on-primary shadow-lg shadow-primary/25 transition hover:bg-primary active:scale-[0.98] disabled:opacity-60">
        {busy ? <Spinner /> : <Icon name="qr_code_2" size={22} />} <Tc>Générer la facture</Tc>
      </button>
      <ErrorNote>{error}</ErrorNote>
    </form>
  );
}
