'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { ErrorNote, Spinner } from '@/components/ui/primitives';
import { Tc, useT } from '@/lib/i18n/client';
import { formatUsdShort } from '@/lib/money';

interface Row {
  key: string;
  /** the id of the step when it already exists */
  id?: string;
  title: string;
  /** dollars, as typed */
  amount: string;
}

interface Props {
  projectId: string;
  /** what the money has touched: shown, never editable */
  fixedCount: number;
  fixedCents: number;
  /** the steps still to come */
  upcoming: { id: string; title: string; amountCents: number }[];
  /** the largest step a payment can be (0 = no limit) */
  maxStepUsd: number;
  /** a project cannot be worth more than this (0 = the general limit) */
  maxBudgetUsd: number;
  minBudgetUsd: number;
  escrowLeftCents: number;
  /** a proof waits for a decision or a payment is on its way: the project cannot be closed yet */
  closeBlocked: boolean;
}

const MAX_STEPS = 12;
const toCents = (v: string) => Math.round((Number.parseFloat(v.replace(',', '.')) || 0) * 100);
const asInput = (cents: number) => (cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2));
let counter = 0;
const nextKey = () => `r${++counter}`;

/** "Gérer le projet": reshape the steps still to come, or close the project. */
export function ProjectManager({ projectId, fixedCount, fixedCents, upcoming, maxStepUsd, maxBudgetUsd, minBudgetUsd, escrowLeftCents, closeBlocked }: Props) {
  const t = useT();
  const router = useRouter();
  const initial = useMemo<Row[]>(() => upcoming.map((s) => ({ key: nextKey(), id: s.id, title: s.title, amount: asInput(s.amountCents) })), [upcoming]);
  const [rows, setRows] = useState<Row[]>(initial);
  const [busy, setBusy] = useState<'save' | 'close' | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [error, setError] = useState('');

  const tailCents = rows.reduce((n, r) => n + toCents(r.amount), 0);
  const budgetCents = fixedCents + tailCents;
  const dirty = JSON.stringify(rows.map((r) => [r.id, r.title.trim(), toCents(r.amount)])) !== JSON.stringify(initial.map((r) => [r.id, r.title.trim(), toCents(r.amount)]));
  const total = fixedCount + rows.length;

  const problem = (() => {
    if (total < 1) return t('Prévoyez au moins une étape');
    if (rows.some((r) => !r.title.trim())) return t('Donnez un nom à chaque étape');
    if (rows.some((r) => toCents(r.amount) < 100)) return t('Chaque étape doit valoir au moins 1 $');
    if (maxStepUsd > 0 && rows.some((r) => toCents(r.amount) > maxStepUsd * 100)) return t('Un paiement est limité à {cap} : réduisez cette étape ou ajoutez des étapes.', { cap: formatUsdShort(maxStepUsd * 100, t) });
    if (budgetCents < minBudgetUsd * 100) return t('Le budget doit être d’au moins {min}.', { min: formatUsdShort(minBudgetUsd * 100, t) });
    if (maxBudgetUsd > 0 && budgetCents > maxBudgetUsd * 100) return t('Pendant cette phase pilote, un projet est limité à {cap}.', { cap: formatUsdShort(maxBudgetUsd * 100, t) });
    return '';
  })();

  const update = (key: string, patch: Partial<Row>) => setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const call = async (what: 'save' | 'close') => {
    setBusy(what);
    setError('');
    const res =
      what === 'save'
        ? await fetch(`/api/projects/${projectId}/plan`, {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ steps: rows.map((r) => ({ ...(r.id ? { id: r.id } : {}), title: r.title.trim(), amountCents: toCents(r.amount) })) }),
          })
        : await fetch(`/api/projects/${projectId}/close`, { method: 'POST' });
    setBusy(null);
    if (!res.ok) return setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? t('Une erreur est survenue'));
    setConfirmClose(false);
    router.refresh();
  };

  return (
    <details className="group rounded-2xl bg-surface-container-low p-4 lg:p-6">
      <summary className="flex cursor-pointer list-none items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon name="tune" size={24} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-title-md text-title-md"><Tc>Gérer le projet</Tc></span>
          <span className="block font-body-sm text-body-sm text-on-surface-variant"><Tc>Revoir les étapes à venir, ou clore le projet.</Tc></span>
        </span>
        <Icon name="chevron_right" className="text-on-surface-variant transition group-open:rotate-90" />
      </summary>

      <div className="mt-4 flex flex-col gap-4">
        <div>
          <p className="mb-2 font-label-md text-label-md font-semibold text-on-surface"><Tc>Étapes à venir</Tc></p>
          <p className="mb-3 font-label-sm text-label-sm text-on-surface-variant">
            {fixedCount > 0 ? t('Les {n} premières étapes (financées, en attente de preuve, en cours de paiement ou payées) ne se modifient plus.', { n: fixedCount }) : t('Aucun argent n’a encore touché ce projet : toutes les étapes peuvent changer.')}
          </p>
          {rows.length === 0 && <p className="mb-2 rounded-xl bg-surface-container-lowest p-3 font-body-sm text-body-sm text-on-surface-variant"><Tc>Il n’y a plus d’étape à venir.</Tc></p>}
          <ul className="flex flex-col gap-2">
            {rows.map((r, i) => (
              <li key={r.key} className="flex flex-col gap-2 rounded-2xl bg-surface-container-lowest p-2.5 ring-1 ring-outline-variant/40">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 font-label-md text-label-md font-bold text-primary">{fixedCount + i + 1}</span>
                  <input
                    aria-label={t("Nom de l'étape {v}", { v: fixedCount + i + 1 })}
                    className="h-10 min-w-0 flex-1 rounded-xl bg-surface-container-low px-3 font-label-lg text-label-lg outline-none focus:ring-2 focus:ring-primary-container"
                    value={r.title}
                    maxLength={80}
                    placeholder={t("Nom de l'étape")}
                    onChange={(e) => update(r.key, { title: e.target.value })}
                  />
                </div>
                <div className="flex items-center justify-end gap-2">
                  <label className="flex h-10 w-28 items-center gap-1 rounded-xl bg-surface-container-low px-2.5 focus-within:ring-2 focus-within:ring-primary-container">
                    <input
                      aria-label={t("Montant de l'étape {v}", { v: fixedCount + i + 1 })}
                      className="w-full min-w-0 bg-transparent text-right font-label-lg text-label-lg outline-none"
                      inputMode="decimal"
                      value={r.amount}
                      onChange={(e) => update(r.key, { amount: e.target.value.replace(/[^0-9.,]/g, '').slice(0, 9) })}
                    />
                    <span className="font-label-md text-label-md text-on-surface-variant">$</span>
                  </label>
                  <button type="button" aria-label={t("Supprimer l'étape {v}", { v: fixedCount + i + 1 })} onClick={() => setRows((l) => l.filter((x) => x.key !== r.key))} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-on-surface-variant hover:bg-error-container hover:text-on-error-container">
                    <Icon name="delete" size={20} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled={total >= MAX_STEPS}
            onClick={() => setRows((l) => [...l, { key: nextKey(), title: '', amount: '' }])}
            className="mt-2 inline-flex h-10 items-center gap-1.5 rounded-full bg-surface-container px-4 font-label-md text-label-md font-semibold text-primary hover:bg-surface-container-high disabled:opacity-40"
          >
            <Icon name="add" size={18} /> <Tc>Ajouter une étape</Tc>
          </button>

          <p className="mt-3 font-body-md text-body-md">
            <Tc>Budget du projet :</Tc> <strong>{formatUsdShort(budgetCents, t)}</strong>
          </p>
          {dirty && problem && <p className="mt-1 font-label-md text-label-md text-error" role="alert">{problem}</p>}
          <button
            type="button"
            disabled={busy !== null || !dirty || !!problem}
            onClick={() => call('save')}
            className="mt-3 inline-flex h-11 items-center gap-2 rounded-full bg-primary-container px-5 font-label-lg text-label-lg font-bold text-on-primary shadow-md disabled:opacity-50"
          >
            {busy === 'save' ? <Spinner /> : <Icon name="check" size={20} />} <Tc>Enregistrer les changements</Tc>
          </button>
          <p className="mt-2 font-label-sm text-label-sm text-on-surface-variant"><Tc>Chaque changement est inscrit au registre : le dossier public explique pourquoi le plan final n’est plus celui du début.</Tc></p>
        </div>

        <div className="border-t border-outline-variant/40 pt-4">
          <p className="mb-1 font-label-md text-label-md font-semibold text-on-surface"><Tc>Clore le projet</Tc></p>
          {confirmClose ? (
            <div className="rounded-2xl bg-error-container p-4 text-on-error-container">
              <p className="mb-3 font-body-sm text-body-sm">
                {t('Plus aucun versement, aucune preuve et aucun paiement ne seront possibles. Le séquestre qui reste ({amount}) reste à vous : vous pourrez le reprendre. Cela ne peut pas être annulé.', { amount: formatUsdShort(escrowLeftCents, t) })}
              </p>
              <div className="flex gap-2">
                <button type="button" disabled={busy !== null} onClick={() => call('close')} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-error font-label-lg text-label-lg font-semibold text-on-error disabled:opacity-60">
                  {busy === 'close' ? <Spinner /> : <Icon name="lock" size={20} />} <Tc>Oui, clore le projet</Tc>
                </button>
                <button type="button" onClick={() => setConfirmClose(false)} className="h-11 rounded-full px-5 font-label-lg text-label-lg hover:bg-error/10"><Tc>Annuler</Tc></button>
              </div>
            </div>
          ) : (
            <>
              <p className="mb-2 font-body-sm text-body-sm text-on-surface-variant"><Tc>Quand le projet s’arrête : il ne reçoit plus rien et plus rien n’en sort, et vous reprenez ce qui reste en séquestre.</Tc></p>
              <button type="button" disabled={closeBlocked} onClick={() => setConfirmClose(true)} className="inline-flex h-10 items-center gap-2 rounded-full bg-surface-container-lowest px-4 font-label-md text-label-md font-semibold text-error ring-1 ring-error/30 hover:bg-error-container/40 disabled:opacity-50">
                <Icon name="lock" size={18} /> <Tc>Clore le projet</Tc>
              </button>
              {closeBlocked && <p className="mt-2 font-label-sm text-label-sm text-on-surface-variant"><Tc>Une preuve attend votre décision ou un paiement est en cours : terminez-les d’abord.</Tc></p>}
            </>
          )}
        </div>
        <ErrorNote>{error}</ErrorNote>
      </div>
    </details>
  );
}
