'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Flag } from '@/components/ui/Flag';
import { Icon } from '@/components/ui/Icon';
import { ErrorNote, Spinner } from '@/components/ui/primitives';
import { formatFcfa, formatInt, formatUsdShort } from '@/lib/money';
import { PROOF_LABEL, PROOF_SHORT, SECTORS, STEP_TEMPLATES, allocateBudget } from '@/lib/templates';
import type { ProofKind, Sector } from '@/lib/types';

interface DraftStep {
  key: string;
  title: string;
  /** whole dollars, digits only (kept as text while the user types) */
  amount: string;
  proofKinds: ProofKind[];
}

const SECTOR_ORDER: Sector[] = ['immobilier', 'agricole', 'commerce'];
const PRESETS: Record<Sector, number[]> = {
  immobilier: [10_000, 24_000, 50_000],
  agricole: [3_000, 9_000, 20_000],
  commerce: [2_000, 5_000, 15_000],
};
const PLACEHOLDER: Record<Sector, { name: string; city: string }> = {
  immobilier: { name: 'Villa familiale', city: 'Thiès' },
  agricole: { name: "Champ d'arachide", city: 'Kaolack' },
  commerce: { name: 'Boutique de quartier', city: 'Dakar' },
};
const STEP_LABELS = ['Secteur', 'Projet', 'Étapes', 'Équipe', 'Récapitulatif'];
const MIN_BUDGET = 100;
const MAX_STEPS = 12;
/** budgets offered in sandbox, where one payout is capped (only those whose automatic split fits are shown) */
const SANDBOX_PRESETS = [100, 150, 200, 300, 500, 800];
const MAX_BUDGET = 500_000;

const nf = { format: formatInt };
const digits = (v: string) => v.replace(/\D/g, '');
const dollars = (v: string) => Number(digits(v) || 0);
let counter = 0;
const nextKey = () => `s${++counter}`;

function buildSteps(sector: Sector, budgetUsd: number): DraftStep[] {
  const template = STEP_TEMPLATES[sector];
  return allocateBudget(budgetUsd * 100, template).map((cents, i) => ({
    key: nextKey(),
    title: template[i].title,
    amount: String(Math.round(cents / 100)),
    proofKinds: [...template[i].proofKinds],
  }));
}

/** Largest step (dollars) the automatic split gives for this sector and budget. */
const largestStep = (sector: Sector, budgetUsd: number) => Math.max(0, ...buildSteps(sector, budgetUsd).map((s) => dollars(s.amount)));

export function NewProjectWizard({ usdXof, maxStepUsd = 0 }: { usdXof: number; /** sandbox: Bitnob refuses a payout above this (0 = no limit) */ maxStepUsd?: number }) {
  const router = useRouter();
  const [stage, setStage] = useState(0);
  const [sector, setSector] = useState<Sector | null>(null);
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [budget, setBudget] = useState('');
  const [steps, setSteps] = useState<DraftStep[]>([]);
  const [generatedFor, setGeneratedFor] = useState('');
  const [managerName, setManagerName] = useState('');
  const [managerPhone, setManagerPhone] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const budgetUsd = dollars(budget);
  const sum = steps.reduce((n, s) => n + dollars(s.amount), 0);
  const remaining = budgetUsd - sum;
  const meta = sector ? SECTORS[sector] : null;

  const stepsProblem = useMemo(() => {
    if (steps.length < 1) return 'Prévoyez au moins une étape';
    if (steps.some((s) => !s.title.trim())) return 'Donnez un nom à chaque étape';
    if (steps.some((s) => dollars(s.amount) < 1)) return 'Chaque étape doit valoir au moins 1 $';
    if (steps.some((s) => s.proofKinds.length === 0)) return 'Choisissez au moins une preuve par étape';
    if (maxStepUsd > 0) {
      const big = steps.find((s) => dollars(s.amount) > maxStepUsd);
      if (big) return `En mode sandbox, un paiement est limité à ${formatUsdShort(maxStepUsd * 100)} : réduisez l'étape « ${big.title.trim()} » ou ajoutez des étapes.`;
    }
    if (remaining !== 0) return remaining > 0 ? `Il reste ${formatUsdShort(remaining * 100)} à répartir` : `Les étapes dépassent le budget de ${formatUsdShort(-remaining * 100)}`;
    return '';
  }, [steps, remaining, maxStepUsd]);

  const problem = (): string => {
    if (stage === 0) return sector ? '' : 'Choisissez un secteur';
    if (stage === 1) {
      if (name.trim().length < 2) return 'Donnez un nom au projet';
      if (!city.trim()) return 'Indiquez la ville';
      if (budgetUsd < MIN_BUDGET || budgetUsd > MAX_BUDGET) return `Le budget doit être compris entre ${nf.format(MIN_BUDGET)} $ et ${nf.format(MAX_BUDGET)} $`;
      if (maxStepUsd > 0 && budgetUsd > MAX_STEPS * maxStepUsd) {
        return `En mode sandbox, un paiement est limité à ${formatUsdShort(maxStepUsd * 100)} : un projet ne peut pas dépasser ${formatUsdShort(MAX_STEPS * maxStepUsd * 100)} (${MAX_STEPS} étapes au plus).`;
      }
    }
    if (stage === 2) return stepsProblem;
    if (stage === 3 && !managerName.trim()) return 'Indiquez la personne de confiance sur place';
    return '';
  };

  const next = async () => {
    const issue = problem();
    if (issue) return setError(issue);
    setError('');
    if (stage === 1) {
      const signature = `${sector}:${budgetUsd}`;
      if (signature !== generatedFor) {
        setSteps(buildSteps(sector!, budgetUsd));
        setGeneratedFor(signature);
      }
    }
    if (stage < 4) return setStage(stage + 1);

    setBusy(true);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          sector,
          city: city.trim(),
          budgetCents: budgetUsd * 100,
          managerName: managerName.trim(),
          managerPhone: managerPhone ? `+221${digits(managerPhone).replace(/^0+/, '')}` : undefined,
          steps: steps.map((s) => ({ title: s.title.trim(), amountCents: dollars(s.amount) * 100, proofKinds: s.proofKinds })),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'Impossible de créer le projet');
      router.push(`/app/projets/${json.id}?cree=1`);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const back = () => {
    setError('');
    if (stage === 0) router.push('/app/projets');
    else setStage(stage - 1);
  };

  const updateStep = (key: string, patch: Partial<DraftStep>) => setSteps((list) => list.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const toggleProof = (key: string, kind: ProofKind) =>
    setSteps((list) => list.map((s) => (s.key === key ? { ...s, proofKinds: s.proofKinds.includes(kind) ? s.proofKinds.filter((k) => k !== kind) : [...s.proofKinds, kind] } : s)));

  const input =
    'h-12 w-full rounded-2xl bg-surface-container-low px-space-md font-body-md text-on-surface outline-none transition placeholder:text-outline focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary-container';

  return (
    <div className="flex min-h-screen flex-col lg:mx-auto lg:my-8 lg:min-h-[680px] lg:w-full lg:max-w-[560px] lg:overflow-hidden lg:rounded-3xl lg:bg-surface-container-lowest lg:shadow-xl">
      <header className="pt-safe sticky top-0 z-40 bg-surface-container-lowest/85 backdrop-blur-xl">
        <div className="flex h-16 items-center justify-between px-space-md">
          <button type="button" onClick={back} aria-label="Retour" className="flex h-11 w-11 items-center justify-center rounded-full text-on-surface hover:bg-surface-container">
            <Icon name="arrow_back" />
          </button>
          <h1 className="font-title-md text-title-md">Nouveau projet</h1>
          <Link href="/app/projets" aria-label="Annuler" className="flex h-11 w-11 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container">
            <Icon name="close" />
          </Link>
        </div>
        <div className="px-space-md pb-3">
          <div className="mb-1.5 flex items-center justify-between font-label-sm text-label-sm text-on-surface-variant">
            <span className="font-semibold text-primary">{STEP_LABELS[stage]}</span>
            <span>
              {stage + 1} / {STEP_LABELS.length}
            </span>
          </div>
          <div className="flex gap-1.5" aria-hidden="true">
            {STEP_LABELS.map((_, i) => (
              <span key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i <= stage ? 'bg-primary-container' : 'bg-surface-container-high'}`} />
            ))}
          </div>
        </div>
      </header>

      <main className="flex-1 px-space-md pb-40 pt-space-md lg:pb-6" key={stage}>
        <div className="nob-rise flex flex-col gap-space-md">
          {stage === 0 && (
            <>
              <div>
                <h2 className="font-headline-lg-mobile text-headline-lg-mobile font-bold tracking-tight">Que voulez-vous financer ?</h2>
                <p className="mt-1 font-body-md text-body-md text-on-surface-variant">Nous préparons des étapes adaptées. Vous pourrez tout modifier.</p>
              </div>
              <div className="flex flex-col gap-3">
                {SECTOR_ORDER.map((id) => {
                  const s = SECTORS[id];
                  const on = sector === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => {
                        setSector(id);
                        setError('');
                      }}
                      className={`flex items-center gap-4 rounded-3xl p-4 text-left transition active:scale-[0.99] ${on ? 'bg-primary/5 ring-2 ring-primary-container' : 'bg-surface-container-lowest shadow-sm ring-1 ring-outline-variant/40 hover:shadow-md'}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={s.cover} alt="" className="h-16 w-16 shrink-0 rounded-2xl object-cover" />
                      <span className="flex-1">
                        <span className="flex items-center gap-2 font-title-lg text-title-lg">
                          <Icon name={s.icon} size={22} className={s.iconColor} /> {s.label}
                        </span>
                        <span className="mt-0.5 block font-body-sm text-body-sm text-on-surface-variant">{s.tagline}</span>
                      </span>
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${on ? 'bg-primary-container text-on-primary' : 'ring-2 ring-outline-variant'}`}>{on && <Icon name="check" size={16} />}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {stage === 1 && sector && (
            <>
              <div>
                <h2 className="font-headline-lg-mobile text-headline-lg-mobile font-bold tracking-tight">Parlez-nous du projet</h2>
                <p className="mt-1 font-body-md text-body-md text-on-surface-variant">Au Sénégal pour l&apos;instant ; d&apos;autres pays d&apos;Afrique suivront.</p>
              </div>
              <label className="flex flex-col gap-1.5 font-label-md text-label-md text-on-surface-variant">
                Nom du projet
                <input className={input} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder={PLACEHOLDER[sector].name} />
              </label>
              <label className="flex flex-col gap-1.5 font-label-md text-label-md text-on-surface-variant">
                Ville
                <span className="flex items-center gap-2 rounded-2xl bg-surface-container-low p-1.5 focus-within:bg-surface-container-lowest focus-within:ring-2 focus-within:ring-primary-container">
                  <span className="flex h-9 items-center gap-1.5 rounded-xl bg-surface-container px-3 font-label-lg text-label-lg text-on-surface">
                    <Flag code="SN" className="h-3.5 w-5" /> Sénégal
                  </span>
                  <input className="w-full bg-transparent py-2 pr-3 font-body-lg text-on-surface outline-none placeholder:text-outline" value={city} onChange={(e) => setCity(e.target.value)} placeholder={PLACEHOLDER[sector].city} autoComplete="off" />
                </span>
              </label>
              <div className="flex flex-col gap-1.5 font-label-md text-label-md text-on-surface-variant">
                <label htmlFor="budget">Budget total</label>
                <span className="flex items-center rounded-2xl bg-surface-container-low px-space-md focus-within:bg-surface-container-lowest focus-within:ring-2 focus-within:ring-primary-container">
                  <input
                    id="budget"
                    className="h-14 w-full bg-transparent font-headline-md text-headline-md font-bold text-on-surface outline-none placeholder:font-normal placeholder:text-outline"
                    inputMode="numeric"
                    value={budgetUsd ? nf.format(budgetUsd) : ''}
                    onChange={(e) => setBudget(digits(e.target.value).slice(0, 6))}
                    placeholder="0"
                  />
                  <span className="font-headline-md text-headline-md font-bold text-on-surface-variant">$</span>
                </span>
                <span className="font-label-sm text-label-sm">
                  {budgetUsd > 0 ? `≈ ${formatFcfa(budgetUsd * usdXof)} (taux indicatif)` : `Entre ${nf.format(MIN_BUDGET)} $ et ${nf.format(MAX_BUDGET)} $`}
                </span>
                <div className="mt-1 flex flex-wrap gap-2">
                  {(maxStepUsd > 0 ? SANDBOX_PRESETS.filter((b) => largestStep(sector, b) <= maxStepUsd) : PRESETS[sector]).map((p) => (
                    <button key={p} type="button" onClick={() => setBudget(String(p))} className={`h-9 rounded-full px-4 font-label-md text-label-md transition ${budgetUsd === p ? 'bg-primary-container text-on-primary' : 'bg-surface-container-low text-on-surface hover:bg-surface-container'}`}>
                      {nf.format(p)} $
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {stage === 2 && (
            <>
              <div>
                <h2 className="font-headline-lg-mobile text-headline-lg-mobile font-bold tracking-tight">Découpez en étapes</h2>
                <p className="mt-1 font-body-md text-body-md text-on-surface-variant">Chaque étape n&apos;est payée qu&apos;après preuve. Modifiez les noms, les montants et les preuves demandées.</p>
              </div>
              <div className={`sticky top-[104px] z-30 flex items-center justify-between rounded-2xl px-4 py-2.5 font-label-md text-label-md shadow-sm ${remaining === 0 ? 'bg-[#DCFCE7] text-[#15803D]' : 'bg-[#FEF3C7] text-[#B45309]'}`} role="status">
                <span className="flex items-center gap-1.5">
                  <Icon name={remaining === 0 ? 'check_circle' : 'balance'} size={18} filled />
                  {remaining === 0 ? 'Le budget est réparti' : remaining > 0 ? `Reste ${formatUsdShort(remaining * 100)} à répartir` : `Dépassement de ${formatUsdShort(-remaining * 100)}`}
                </span>
                <span>
                  {formatUsdShort(sum * 100)} / {formatUsdShort(budgetUsd * 100)}
                </span>
              </div>

              <ol className="flex flex-col gap-3">
                {steps.map((s, i) => (
                  <li key={s.key} className="rounded-2xl bg-surface-container-lowest p-3.5 shadow-sm ring-1 ring-outline-variant/40">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 font-label-md text-label-md font-bold text-primary">{i + 1}</span>
                      <input
                        aria-label={`Nom de l'étape ${i + 1}`}
                        className="h-10 min-w-0 flex-1 rounded-xl bg-surface-container-low px-3 font-label-lg text-label-lg text-on-surface outline-none focus:ring-2 focus:ring-primary-container"
                        value={s.title}
                        maxLength={80}
                        onChange={(e) => updateStep(s.key, { title: e.target.value })}
                      />
                      <button type="button" aria-label={`Supprimer l'étape ${i + 1}`} disabled={steps.length <= 1} onClick={() => setSteps((l) => l.filter((x) => x.key !== s.key))} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-on-surface-variant hover:bg-error-container hover:text-on-error-container disabled:opacity-30">
                        <Icon name="delete" size={20} />
                      </button>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-32 shrink-0 items-center rounded-xl bg-surface-container-low px-3 focus-within:ring-2 focus-within:ring-primary-container">
                        <input
                          aria-label={`Montant de l'étape ${i + 1}`}
                          className="w-full bg-transparent text-right font-label-lg text-label-lg font-bold text-on-surface outline-none"
                          inputMode="numeric"
                          value={s.amount ? nf.format(dollars(s.amount)) : ''}
                          placeholder="0"
                          onChange={(e) => updateStep(s.key, { amount: digits(e.target.value).slice(0, 6) })}
                        />
                        <span className="pl-1.5 font-label-lg text-label-lg text-on-surface-variant">$</span>
                      </span>
                      <div className="flex flex-1 flex-wrap justify-end gap-1.5">
                        {(Object.keys(PROOF_LABEL) as ProofKind[]).map((k) => {
                          const on = s.proofKinds.includes(k);
                          return (
                            <button key={k} type="button" aria-pressed={on} aria-label={PROOF_LABEL[k]} title={PROOF_LABEL[k]} onClick={() => toggleProof(s.key, k)} className={`h-7 rounded-full px-2.5 font-label-sm text-label-sm transition ${on ? 'bg-primary-container text-on-primary' : 'bg-surface-container text-on-surface-variant'}`}>
                              {PROOF_SHORT[k]}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={steps.length >= 12}
                  onClick={() => setSteps((l) => [...l, { key: nextKey(), title: '', amount: remaining > 0 ? String(remaining) : '', proofKinds: ['photos', 'facture'] }])}
                  className="flex h-10 items-center gap-1.5 rounded-full bg-surface-container-low px-4 font-label-md text-label-md font-semibold text-primary hover:bg-surface-container disabled:opacity-40"
                >
                  <Icon name="add" size={18} /> Ajouter une étape
                </button>
                {remaining !== 0 && steps.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      setSteps((l) => {
                        const last = l[l.length - 1];
                        return l.map((x) => (x.key === last.key ? { ...x, amount: String(Math.max(0, dollars(x.amount) + remaining)) } : x));
                      })
                    }
                    className="flex h-10 items-center gap-1.5 rounded-full bg-surface-container-low px-4 font-label-md text-label-md font-semibold text-on-surface hover:bg-surface-container"
                  >
                    <Icon name="balance" size={18} /> Ajuster la dernière
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setSteps(buildSteps(sector!, budgetUsd));
                    setError('');
                  }}
                  className="flex h-10 items-center gap-1.5 rounded-full px-4 font-label-md text-label-md text-on-surface-variant hover:bg-surface-container"
                >
                  <Icon name="restart_alt" size={18} /> Rétablir le modèle
                </button>
              </div>
            </>
          )}

          {stage === 3 && (
            <>
              <div>
                <h2 className="font-headline-lg-mobile text-headline-lg-mobile font-bold tracking-tight">Qui est vos yeux sur place ?</h2>
                <p className="mt-1 font-body-md text-body-md text-on-surface-variant">Un proche ou un chef de chantier de confiance enverra les photos et les factures. Il ne touche jamais l&apos;argent : le fournisseur est payé directement.</p>
              </div>
              <label className="flex flex-col gap-1.5 font-label-md text-label-md text-on-surface-variant">
                Nom de la personne de confiance
                <input className={input} value={managerName} onChange={(e) => setManagerName(e.target.value)} maxLength={60} placeholder="Mamadou Diop" autoComplete="off" />
              </label>
              <label className="flex flex-col gap-1.5 font-label-md text-label-md text-on-surface-variant">
                Son téléphone <span className="font-normal text-outline">(facultatif)</span>
                <span className="flex items-center gap-2 rounded-2xl bg-surface-container-low p-1.5 focus-within:bg-surface-container-lowest focus-within:ring-2 focus-within:ring-primary-container">
                  <span className="flex h-9 items-center gap-1.5 rounded-xl bg-surface-container px-3 font-title-md text-title-md font-bold text-on-surface">
                    <Flag code="SN" className="h-3.5 w-5" /> +221
                  </span>
                  <input className="w-full bg-transparent py-2 pr-3 font-body-lg text-on-surface outline-none placeholder:text-outline" value={managerPhone} onChange={(e) => setManagerPhone(e.target.value)} type="tel" inputMode="tel" placeholder="77 123 45 67" />
                </span>
              </label>

              <div className="flex flex-col gap-2">
                <span className="font-label-md text-label-md text-on-surface-variant">Qui valide les paiements ?</span>
                <div className="flex items-center gap-3 rounded-2xl bg-primary/5 p-3.5 ring-2 ring-primary-container">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-container text-on-primary">
                    <Icon name="person" size={22} />
                  </span>
                  <span className="flex-1">
                    <span className="block font-title-md text-title-md">Moi seul</span>
                    <span className="block font-body-sm text-body-sm text-on-surface-variant">Rien n&apos;est payé sans votre accord.</span>
                  </span>
                  <Icon name="check_circle" filled className="text-primary" />
                </div>
                <div className="flex items-center gap-3 rounded-2xl bg-surface-container-low p-3.5 opacity-70" aria-disabled="true">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant">
                    <Icon name="groups" size={22} />
                  </span>
                  <span className="flex-1">
                    <span className="block font-title-md text-title-md">2 personnes sur 3</span>
                    <span className="block font-body-sm text-body-sm text-on-surface-variant">Validation partagée avec des proches.</span>
                  </span>
                  <span className="rounded-full bg-surface-container-high px-2.5 py-0.5 font-label-sm text-label-sm font-semibold text-on-surface-variant">Bientôt</span>
                </div>
              </div>
            </>
          )}

          {stage === 4 && meta && (
            <>
              <div>
                <h2 className="font-headline-lg-mobile text-headline-lg-mobile font-bold tracking-tight">Tout est bon ?</h2>
                <p className="mt-1 font-body-md text-body-md text-on-surface-variant">Vous pourrez financer le projet juste après. Rien n&apos;est débité maintenant.</p>
              </div>
              <div className="overflow-hidden rounded-3xl bg-surface-container-lowest shadow-sm ring-1 ring-outline-variant/40">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={meta.cover} alt="" className="h-32 w-full object-cover" />
                <div className="flex flex-col gap-2 p-4">
                  <span className={`w-fit rounded-full px-2.5 py-0.5 font-label-sm text-label-sm ${meta.chip}`}>{meta.label}</span>
                  <p className="font-title-lg text-title-lg">{name}</p>
                  <p className="flex items-center gap-1.5 font-body-sm text-body-sm text-on-surface-variant">
                    <Flag code="SN" className="h-3 w-[18px]" /> {city}, Sénégal · sur place : {managerName}
                  </p>
                  <p className="font-headline-md text-headline-md font-bold text-primary">{formatUsdShort(budgetUsd * 100)}</p>
                  <p className="font-label-sm text-label-sm text-on-surface-variant">≈ {formatFcfa(budgetUsd * usdXof)} (taux indicatif)</p>
                </div>
              </div>
              <ol className="flex flex-col divide-y divide-outline-variant/40 overflow-hidden rounded-2xl bg-surface-container-lowest shadow-sm">
                {steps.map((s, i) => (
                  <li key={s.key} className="flex items-center gap-3 px-3.5 py-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 font-label-md text-label-md font-bold text-primary">{i + 1}</span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-label-lg text-label-lg">{s.title}</span>
                      <span className="truncate font-label-sm text-label-sm text-on-surface-variant">{s.proofKinds.map((k) => PROOF_LABEL[k]).join(' · ')}</span>
                    </span>
                    <span className="shrink-0 font-label-lg text-label-lg font-bold">{formatUsdShort(dollars(s.amount) * 100)}</span>
                  </li>
                ))}
              </ol>
              <div className="flex items-start gap-3 rounded-2xl bg-surface-container-low p-3.5">
                <Icon name="shield_lock" size={22} className="mt-0.5 text-primary" />
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  Votre argent reste en séquestre dans un portefeuille Bitnob. Il n&apos;est libéré, étape par étape, que si vous validez la preuve. Chaque décision est ensuite ancrée sur Bitcoin.
                </p>
              </div>
            </>
          )}

          <ErrorNote>{error}</ErrorNote>
        </div>
      </main>

      <footer className="pb-safe fixed bottom-0 left-1/2 z-40 w-full max-w-[480px] -translate-x-1/2 bg-surface-container-lowest/90 px-space-md pt-3 shadow-[0_-4px_20px_-2px_rgba(10,15,36,0.08)] backdrop-blur-xl lg:static lg:max-w-none lg:translate-x-0 lg:bg-transparent lg:pb-6 lg:shadow-none lg:backdrop-blur-none">
        <button
          type="button"
          onClick={next}
          disabled={busy}
          className="mb-3 flex h-12 w-full items-center justify-center gap-space-xs rounded-full bg-primary-container font-label-lg text-label-lg font-bold text-on-primary shadow-lg shadow-primary/25 transition hover:bg-primary active:scale-[0.98] disabled:opacity-60"
        >
          {busy ? <Spinner /> : null}
          {stage === 4 ? 'Créer le projet' : 'Continuer'}
          {!busy && <Icon name={stage === 4 ? 'check' : 'arrow_forward'} size={20} />}
        </button>
      </footer>
    </div>
  );
}
