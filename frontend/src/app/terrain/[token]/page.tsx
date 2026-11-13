import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AutoRefresh } from '@/components/app/AutoRefresh';
import { FieldProofForm } from '@/components/app/FieldProofForm';
import { ReceiptCard } from '@/components/app/ReceiptCard';
import { Flag } from '@/components/ui/Flag';
import { Icon } from '@/components/ui/Icon';
import { Logo } from '@/components/ui/Logo';
import { Chip, ProgressBar } from '@/components/ui/primitives';
import { formatDate, formatDateTime, formatUsdShort, relativeDay } from '@/lib/money';
import { PROOF_LABEL, SECTORS, SUPPLIER_NETWORKS } from '@/lib/templates';
import type { LedgerType, Step } from '@/lib/types';
import { getConfig } from '@/server/config';
import { readDb } from '@/server/db';
import { ledgerFor } from '@/server/ledger';
import { findProjectByManagerToken, managerTokenState } from '@/server/managerToken';
import { receiptToken } from '@/server/receipt';
import { Tc } from '@/lib/i18n/client';
import { PushToggle } from '@/components/app/PushToggle';
import { getT } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t('Espace terrain'), robots: { index: false, follow: false } };
}

const STEP_STATE: Record<Step['status'], string> = {
  paid: 'Payée',
  releasing: 'Paiement en cours',
  proof_submitted: 'Preuve en cours de validation',
  rejected: 'À refaire',
  active: 'À envoyer maintenant',
  upcoming: 'À venir',
};

/** What the person on site may read: their own sends and the decisions on them. Never money coming in. */
const NEWS: Partial<Record<LedgerType, { icon: string; tone: string }>> = {
  proof_submitted: { icon: 'upload', tone: 'bg-surface-container text-primary' },
  step_approved: { icon: 'verified', tone: 'bg-[#DCFCE7] text-[#15803D]' },
  step_rejected: { icon: 'undo', tone: 'bg-error-container text-on-error-container' },
  payout_started: { icon: 'send', tone: 'bg-surface-container text-primary' },
  payout_completed: { icon: 'payments', tone: 'bg-[#DCFCE7] text-[#15803D]' },
  payout_failed: { icon: 'error', tone: 'bg-error-container text-on-error-container' },
};

export default async function FieldPage(props: { params: Promise<{ token: string }> }) {
  const t = await getT();
  const params = await props.params;
  const db = await readDb();
  const project = findProjectByManagerToken(db, params.token);
  if (!project) notFound();
  const owner = db.users.find((u) => u.id === project.ownerId);
  const ownerName = owner?.firstName ?? 'Le financeur';
  const sector = SECTORS[project.sector];

  const closed = !!project.closedAt;
  const todo = closed ? undefined : project.steps.find((s) => s.status === 'active' || s.status === 'rejected');
  const waiting = project.steps.find((s) => s.status === 'proof_submitted' || s.status === 'releasing');
  const paidCount = project.steps.filter((s) => s.status === 'paid').length;
  const allDone = paidCount === project.steps.length;
  const next = project.steps.find((s) => s.status === 'upcoming');
  const lastPaid = [...project.steps].reverse().find((s) => s.payout && (s.status === 'paid' || s.status === 'releasing'));
  const lastReceipt = lastPaid ? receiptToken(lastPaid) : null;
  const tokenState = managerTokenState(project);

  const stepById = new Map(project.steps.map((s) => [s.id, s]));
  // the reason of a refusal is not in the public ledger (only its fingerprint is): it is read from the private record, for the latest refusal of a step
  const reasonShown = new Set<string>();
  const news = ledgerFor(db, project.id)
    .filter((e) => NEWS[e.type] && typeof e.data.stepId === 'string')
    .reverse()
    .slice(0, 6)
    .map((e) => {
      const step = stepById.get(String(e.data.stepId));
      const title = step ? t('« {title} »', { title: t(step.title) }) : t('une étape');
      const supplier = (e.data.supplier as { name?: string } | undefined)?.name ?? step?.payout?.supplier.name ?? t('Le fournisseur');
      let reason: string | undefined;
      if (e.type === 'step_rejected' && step && !reasonShown.has(step.id)) {
        reasonShown.add(step.id);
        reason = step.status === 'rejected' ? step.decision?.note : undefined;
      }
      const text: Record<string, string> = {
        proof_submitted: t('Preuve envoyée pour {title}', { title }),
        step_approved: t('{owner} a validé {title}', { owner: ownerName, title }),
        step_rejected: t('Preuve refusée pour {title}', { title }) + (reason ? ` : « ${reason} »` : ''),
        payout_started: t('Paiement lancé vers {supplier}', { supplier }),
        payout_completed: t('{supplier} a été payé ({title})', { supplier, title }),
        payout_failed: t('Paiement non abouti pour {title}', { title }),
      };
      return { id: e.id, at: e.at, type: e.type, text: text[e.type] };
    });

  return (
    <div className="app-shell min-h-screen bg-surface-container lg:bg-background">
      <main id="contenu" className="relative mx-auto min-h-screen w-full max-w-[480px] bg-background pb-16 shadow-2xl lg:max-w-none lg:shadow-none">
        <AutoRefresh active={!!waiting} everyMs={4000} />

        <header className="bg-gradient-to-br from-[#0A0F24] via-[#0B132B] to-[#1E40AF] px-space-md pb-6 pt-[max(1.25rem,env(safe-area-inset-top))] text-white lg:px-8 lg:pb-10 lg:pt-6">
          <div className="mx-auto lg:max-w-[1000px]">
            <div className="mb-4 flex items-center justify-between lg:mb-8">
              <Logo tone="light" className="text-[18px] lg:text-[22px]" />
              <Chip tone="dark" icon="badge">
                <Tc>Espace terrain</Tc>
              </Chip>
            </div>
            <p className="font-label-md text-label-md text-surface-variant"><Tc>Bonjour</Tc> {project.managerName.split(' ')[0]}</p>
            <h1 className="mt-0.5 font-headline-lg-mobile text-headline-lg-mobile font-bold tracking-tight lg:font-headline-xl lg:text-headline-xl">{project.name}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-body-sm text-body-sm text-surface-variant">
              <Flag code="SN" className="h-3 w-[18px]" /> {project.city} · <Icon name={sector.icon} size={16} /> <Tc>{sector.label}</Tc>
              {owner ? t(' · vous êtes la personne de confiance de {firstName}', { firstName: owner.firstName }) : ''}
            </p>
          </div>
        </header>

        <div className="mx-auto flex flex-col gap-space-lg px-space-md pt-space-md lg:grid lg:max-w-[1000px] lg:grid-cols-[1.2fr_1fr] lg:items-start lg:gap-8 lg:px-8 lg:pt-8">
          {/* ---- left: what to do now ---- */}
          <div className="flex flex-col gap-space-lg">
            {closed && (
              <section className="flex flex-col items-center gap-3 rounded-3xl bg-surface-container-low p-space-lg text-center" role="status">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant">
                  <Icon name="lock" size={28} />
                </span>
                <p className="font-title-lg text-title-lg"><Tc>Projet clos</Tc></p>
                <p className="font-body-md text-body-md text-on-surface-variant">{t('{ownerName} a clos ce projet : plus aucune preuve n’est attendue. Merci pour votre travail.', { ownerName })}</p>
              </section>
            )}

            {todo && (
              <section className="flex flex-col gap-3">
                <div className="rounded-2xl bg-primary/5 p-4 ring-1 ring-primary-container/30">
                  <p className="font-label-sm text-label-sm uppercase tracking-wider text-primary">
                    <Tc>Étape</Tc> {todo.index} <Tc>sur</Tc> {project.steps.length} · {formatUsdShort(todo.amountCents, t)}
                  </p>
                  <h2 className="mt-0.5 font-title-lg text-title-lg"><Tc>{todo.title}</Tc></h2>
                  <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant"><Tc>À envoyer :</Tc> {todo.proofKinds.map((k) => t(PROOF_LABEL[k])).join(' + ')}</p>
                  {todo.status === 'rejected' && (
                    <p className="mt-2 flex items-start gap-2 rounded-xl bg-error-container px-3 py-2 font-body-sm text-body-sm text-on-error-container" role="alert">
                      <Icon name="undo" size={18} className="mt-px shrink-0" />
                      <span>
                        <strong><Tc>Preuve refusée.</Tc></strong> {todo.decision?.note ? `« ${todo.decision.note} ». ` : ''}<Tc>Merci d&apos;en renvoyer une nouvelle.</Tc>
                      </span>
                    </p>
                  )}
                </div>
                <FieldProofForm token={params.token} projectId={project.id} step={{ id: todo.id, index: todo.index, title: todo.title, proofKinds: todo.proofKinds }} previous={todo.proof?.supplier} payTo={getConfig().lightning.rail === 'nwc' ? 'lightning' : 'mobile'} />
              </section>
            )}

            {!todo && waiting && (
              <section className="flex flex-col items-center gap-3 rounded-3xl bg-surface-container-low p-space-lg text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#FEF3C7] text-[#B45309]">
                  <Icon name={waiting.status === 'releasing' ? 'sync' : 'hourglass_top'} size={28} />
                </span>
                <p className="font-title-lg text-title-lg">{waiting.status === 'releasing' ? t('Paiement en cours') : t('Preuve reçue')}</p>
                <p className="font-body-md text-body-md text-on-surface-variant">
                  {waiting.status === 'releasing'
                    ? t('{name} va recevoir son paiement sur son mobile money.', { name: waiting.payout?.supplier.name ?? t('Le fournisseur') })
                    : t('{ownerName} regarde votre envoi{s}. Cette page se met à jour toute seule.', { ownerName, s: waiting.proof ? ` du ${formatDateTime(waiting.proof.submittedAt, t)}` : '' })}
                </p>
              </section>
            )}

            {!closed && !todo && !waiting && !allDone && (
              <section className="flex flex-col items-center gap-3 rounded-3xl bg-surface-container-low p-space-lg text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant">
                  <Icon name="lock" size={28} />
                </span>
                <p className="font-title-lg text-title-lg"><Tc>Prochaine étape pas encore ouverte</Tc></p>
                <p className="font-body-md text-body-md text-on-surface-variant">{next ? t('« {title} » s’ouvrira dès que {ownerName} aura alimenté le séquestre.', { title: t(next.title), ownerName }) : t('Patientez.')}</p>
              </section>
            )}

            {allDone && (
              <section className="nob-pop flex flex-col items-center gap-3 rounded-3xl bg-[#DCFCE7] p-space-lg text-center text-[#14532D]">
                <Icon name="celebration" size={40} filled />
                <p className="font-title-lg text-title-lg"><Tc>Projet terminé</Tc></p>
                <p className="font-body-md text-body-md"><Tc>Toutes les étapes sont payées. Merci pour votre travail.</Tc></p>
              </section>
            )}

            {lastPaid?.payout && lastReceipt && (
              <div>
                <p className="mb-2 font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant"><Tc>Dernier paiement : «</Tc> {t(lastPaid.title)} »</p>
                <ReceiptCard token={lastReceipt} supplierName={lastPaid.payout.supplier.name} />
              </div>
            )}
          </div>

          {/* ---- right: where things stand ---- */}
          <div className="flex flex-col gap-space-lg">
            <section className="rounded-2xl bg-surface-container-lowest p-4 shadow-sm ring-1 ring-outline-variant/30">
              <div className="mb-2 flex items-end justify-between">
                <p className="font-title-md text-title-md"><Tc>Avancement</Tc></p>
                <p className="font-label-md text-label-md text-on-surface-variant">
                  {t(paidCount > 1 ? '{paidCount} étapes payées sur {total}' : '{paidCount} étape payée sur {total}', { paidCount, total: project.steps.length })}
                </p>
              </div>
              <ProgressBar value={Math.round((paidCount / project.steps.length) * 100)} />
            </section>

            {news.length > 0 && (
              <section>
                <h2 className="mb-2 font-title-md text-title-md"><Tc>Dernières nouvelles</Tc></h2>
                <ul className="flex flex-col divide-y divide-outline-variant/40 overflow-hidden rounded-2xl bg-surface-container-lowest shadow-sm ring-1 ring-outline-variant/30">
                  {news.map((n) => (
                    <li key={n.id} className="flex items-start gap-3 px-3.5 py-3">
                      <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${NEWS[n.type]!.tone}`}>
                        <Icon name={NEWS[n.type]!.icon} size={17} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-label-lg text-label-lg">{n.text}</span>
                        <span className="block font-label-sm text-label-sm text-on-surface-variant">{relativeDay(n.at, t)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <h2 className="mb-2 font-title-md text-title-md"><Tc>Les étapes et mes envois</Tc></h2>
              <ol className="flex flex-col divide-y divide-outline-variant/40 overflow-hidden rounded-2xl bg-surface-container-lowest shadow-sm ring-1 ring-outline-variant/30">
                {project.steps.map((s) => {
                  const receipt = receiptToken(s);
                  return (
                    <li key={s.id} className="flex gap-3 px-3.5 py-3">
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${s.status === 'paid' ? 'bg-[#16A34A] text-white' : s === todo ? 'bg-primary-container text-on-primary' : 'bg-surface-container-high text-on-surface-variant'}`}>
                        {s.status === 'paid' ? <Icon name="check" size={18} /> : <span className="font-label-md text-label-md font-bold">{s.index}</span>}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-label-lg text-label-lg"><Tc>{s.title}</Tc></span>
                        <span className={`block font-label-sm text-label-sm ${s.status === 'rejected' ? 'font-semibold text-error' : 'text-on-surface-variant'}`}><Tc>{STEP_STATE[s.status]}</Tc></span>

                        {s.proof && (
                          <span className="mt-1.5 block font-label-sm text-label-sm text-on-surface-variant">
                            <Tc>Envoyée le</Tc> {formatDate(s.proof.submittedAt, t)} · {s.proof.photos.length} <Tc>photo</Tc>{s.proof.photos.length > 1 ? 's' : ''}
                            {s.proof.invoice ? t(' + facture') : ''}
                            {s.proof.supplier ? t(' · à payer : {name}', { name: s.proof.supplier.name }) : ''}
                          </span>
                        )}
                        {s.proof && s.proof.photos.length > 0 && (
                          <span className="mt-1.5 flex gap-1.5">
                            {s.proof.photos.slice(0, 4).map((p) => (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img key={p.id} src={`/api/files/${project.id}/${p.id}?t=${encodeURIComponent(params.token)}`} alt="" loading="lazy" className="h-10 w-10 rounded-lg object-cover ring-1 ring-outline-variant/40" />
                            ))}
                          </span>
                        )}
                        {s.status === 'rejected' && s.decision?.note && <span className="mt-1 block font-label-sm text-label-sm text-error">« {s.decision.note} »</span>}
                        {s.payout && (
                          <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-label-sm text-label-sm text-on-surface-variant">
                            <Icon name="payments" size={14} />
                            {s.payout.supplier.name} · {SUPPLIER_NETWORKS[s.payout.supplier.network]} ·{' '}
                            {s.payout.status === 'completed' ? t('payé') : s.payout.status === 'failed' ? t('paiement refusé') : t('en cours')}
                            {receipt && (
                              <a href={`/recu/${receipt}`} className="font-semibold text-primary hover:underline">
                                <Tc>Reçu</Tc>
                              </a>
                            )}
                          </span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </section>

            {getConfig().push.enabled && <PushToggle scope={{ kind: 'manager', token: params.token }} publicKey={getConfig().push.publicKey} />}

            <p className="flex items-start gap-2 rounded-2xl bg-surface-container-low p-3.5 font-label-sm text-label-sm text-on-surface-variant">
              <Icon name="lock" size={16} className="mt-px shrink-0" />
              <span>
                <Tc>Ce lien est personnel : ne le partagez pas. Vous ne voyez pas le solde du financeur et vous ne pouvez pas débloquer d&apos;argent.</Tc>
                {!tokenState.legacy && tokenState.expiresAt && !tokenState.expired && t(' Il est valable jusqu’au {formatDate} ; {ownerName} peut le renouveler.', { formatDate: formatDate(tokenState.expiresAt, t), ownerName })}
              </span>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
