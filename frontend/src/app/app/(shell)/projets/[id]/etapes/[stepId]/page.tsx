import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AutoRefresh } from '@/components/app/AutoRefresh';
import { FlowHeader } from '@/components/app/AppHeader';
import { PayoutTracker } from '@/components/app/PayoutTracker';
import { ReceiptCard } from '@/components/app/ReceiptCard';
import { ProofReviewPanel } from '@/components/app/ProofReviewPanel';
import { ProofView } from '@/components/app/ProofView';
import { WitnessStatus } from '@/components/app/WitnessStatus';
import { ReleasePanel } from '@/components/app/ReleasePanel';
import { ShareManagerLink } from '@/components/app/ShareManagerLink';
import { Icon } from '@/components/ui/Icon';
import { Chip } from '@/components/ui/primitives';
import { LEDGER_LABEL, shortHash } from '@/lib/ledgerLabels';
import { formatDateTime, formatFcfa, formatUsdShort } from '@/lib/money';
import { PROOF_LABEL } from '@/lib/templates';
import { escrowCents } from '@/lib/types';
import { getSessionUser } from '@/server/auth';
import { getConfig } from '@/server/config';
import { currentUsdXof } from '@/server/lightning/price';
import { managerLinkToken } from '@/server/managerToken';
import { readDb } from '@/server/db';
import { findProject, findStep } from '@/server/domain';
import { ledgerFor } from '@/server/ledger';
import { proofChecks } from '@/server/proofChecks';
import { receiptToken } from '@/server/receipt';
import { Tc } from '@/lib/i18n/client';
import { getT } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t('Étape') };
}

const STATUS = {
  upcoming: { tone: 'neutral', label: 'À venir' },
  active: { tone: 'primary', label: 'En attente de la preuve' },
  proof_submitted: { tone: 'warning', label: 'Preuve à valider' },
  releasing: { tone: 'primary', label: 'Paiement en cours' },
  paid: { tone: 'success', label: 'Payée' },
  rejected: { tone: 'danger', label: 'Preuve à refaire' },
} as const;

export default async function StepPage(props: { params: Promise<{ id: string; stepId: string }> }) {
  const t = await getT();
  const params = await props.params;
  const user = await getSessionUser();
  if (!user) redirect('/app/bienvenue');
  const db = await readDb();
  const project = findProject(db, params.id);
  if (!project || project.ownerId !== user.id) notFound();
  const step = findStep(project, params.stepId);
  if (!step) notFound();

  const { mode, allowDemo } = getConfig();
  const usdXof = currentUsdXof();
  const escrow = escrowCents(db, project);
  const status = STATUS[step.status];
  const trail = ledgerFor(db, project.id).filter((e) => e.data.stepId === step.id);
  const lastFailure = step.status === 'proof_submitted' && step.payout?.status === 'failed' ? step.payout : undefined;
  const previous = project.steps.find((s) => s.index === step.index - 1);
  const receipt = receiptToken(step);
  const hasProof = step.status === 'proof_submitted' || ((step.status === 'releasing' || step.status === 'paid') && !!step.payout);
  const blockedBy = step.status === 'upcoming' ? (previous && previous.status !== 'paid' ? previous : undefined) : undefined;

  return (
    <main id="contenu" className="min-h-screen pb-16 lg:mx-auto lg:w-full lg:max-w-[1100px] lg:px-8 lg:pb-16 lg:pt-8">
      <AutoRefresh active={step.status === 'releasing'} />
      <FlowHeader title={t('Étape {index} sur {length}', { index: step.index, length: project.steps.length })} backHref={`/app/projets/${project.id}`} />

      <div className="flex flex-col gap-space-lg px-space-md pt-space-md lg:grid lg:grid-cols-[1.4fr_1fr] lg:grid-rows-[auto_auto_auto_auto_1fr] lg:items-start lg:gap-x-8 lg:gap-y-6 lg:px-0 lg:pt-0">
        {/* Title */}
        <section className="lg:col-span-2 lg:row-start-1">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="font-label-md text-label-md text-on-surface-variant">{project.name}</p>
            <Chip tone={status.tone}><Tc>{status.label}</Tc></Chip>
          </div>
          <h2 className="font-headline-lg-mobile text-headline-lg-mobile font-bold tracking-tight lg:font-headline-xl lg:text-headline-xl"><Tc>{step.title}</Tc></h2>
          <p className="mt-1 flex items-baseline gap-2">
            <span className="font-headline-md text-headline-md font-bold text-primary">{formatUsdShort(step.amountCents, t)}</span>
            <span className="font-label-md text-label-md text-on-surface-variant">≈ {formatFcfa((step.amountCents / 100) * usdXof, t)} <Tc>(taux indicatif)</Tc></span>
          </p>
          <p className="mt-2 flex flex-wrap items-center gap-1.5 font-label-sm text-label-sm text-on-surface-variant">
            <Tc>Preuves attendues :</Tc>
            {step.proofKinds.map((k) => (
              <span key={k} className="rounded-full bg-surface-container px-2.5 py-0.5 font-label-sm text-label-sm text-on-surface">
                <Tc>{PROOF_LABEL[k]}</Tc>
              </span>
            ))}
          </p>
        </section>

        {/* Per-status body */}
        {step.status === 'upcoming' && (
          <section className="rounded-2xl bg-surface-container-low p-4 lg:col-start-1 lg:row-start-2 lg:p-6">
            <p className="mb-1 flex items-center gap-2 font-title-md text-title-md">
              <Icon name="lock" size={20} /> <Tc>Pas encore débloquée</Tc>
            </p>
            <p className="mb-3 font-body-sm text-body-sm text-on-surface-variant">
              {blockedBy
                ? t('L\'étape {index} (« {title} ») doit d\'abord être payée.', { index: blockedBy.index, title: t(blockedBy.title) })
                : escrow < step.amountCents
                  ? t('Le séquestre ({formatUsdShort}) doit couvrir cette étape ({formatUsdShort2}).', { formatUsdShort: formatUsdShort(escrow, t), formatUsdShort2: formatUsdShort(step.amountCents, t) })
                  : t('Elle se débloque automatiquement.')}
            </p>
            {escrow < step.amountCents && (
              <Link href={`/app/projets/${project.id}/financer`} className="inline-flex h-11 items-center gap-2 rounded-full bg-primary-container px-5 font-label-lg text-label-lg font-bold text-on-primary shadow-md">
                <Icon name="bolt" size={20} filled /> <Tc>Financer le projet</Tc>
              </Link>
            )}
          </section>
        )}

        {(step.status === 'active' || step.status === 'rejected') && (
          <section className="flex flex-col gap-3 rounded-2xl bg-surface-container-low p-4 lg:col-start-1 lg:row-start-2 lg:p-6">
            <p className="flex items-center gap-2 font-title-md text-title-md">
              <Icon name={step.status === 'rejected' ? 'undo' : 'hourglass_top'} size={20} className={step.status === 'rejected' ? 'text-error' : 'text-primary'} />
              {step.status === 'rejected' ? t('Preuve refusée : en attente d’une nouvelle preuve') : t('En attente de {managerName}', { managerName: project.managerName })}
            </p>
            {step.decision?.note && <p className="rounded-xl bg-error-container/60 px-3 py-2 font-body-sm text-body-sm text-on-error-container">« {step.decision.note} »</p>}
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              <Tc>L&apos;étape est financée.</Tc> {project.managerName} <Tc>doit maintenant envoyer les photos et la facture depuis son lien privé.</Tc>
            </p>
            <ShareManagerLink token={managerLinkToken(project)} managerName={project.managerName} projectName={project.name} projectId={project.id} />
            <Link href={`/terrain/${managerLinkToken(project)}`} className="font-label-md text-label-md font-semibold text-primary hover:underline">
              <Tc>Ou envoyer la preuve moi-même</Tc>
            </Link>
          </section>
        )}

        {step.status === 'proof_submitted' && step.proof && (
          <>
            <div className="flex flex-col gap-space-lg lg:col-start-2 lg:row-start-2">
            <div className="flex items-start gap-3 rounded-2xl bg-[#FFFBEB] p-3.5 ring-1 ring-[#F59E0B]/30">
              <Icon name="rate_review" size={22} className="mt-0.5 shrink-0 text-[#B45309]" />
              <p className="font-body-sm text-body-sm text-[#92400E]">
                <Tc>Preuve reçue</Tc> {formatDateTime(step.proof.submittedAt, t)}<Tc>. Regardez les photos et la facture, puis décidez. Rien n&apos;est payé sans votre accord.</Tc>
              </p>
            </div>
            <WitnessStatus project={project} step={step} />
            {lastFailure && (
              <div className="flex items-start gap-3 rounded-2xl bg-error-container p-3.5 text-on-error-container" role="alert">
                <Icon name="error" size={22} className="mt-0.5 shrink-0" />
                <p className="font-body-sm text-body-sm">
                  <strong><Tc>Le dernier paiement n&apos;a pas abouti</Tc></strong> {lastFailure.error ? `(${lastFailure.error})` : ''}<Tc>. Vos fonds sont toujours en séquestre : vous pouvez réessayer.</Tc>
                </p>
              </div>
            )}
            </div>
            <div className="flex flex-col gap-space-lg lg:col-start-1 lg:row-span-4 lg:row-start-2">
              <ProofView proof={step.proof} projectId={project.id} expectedFcfa={(step.amountCents / 100) * usdXof} />
              <ProofReviewPanel
                projectId={project.id}
                stepId={step.id}
                checks={proofChecks({ db, project, step, usdXof, t })}
                aiEnabled={getConfig().ai.enabled}
                review={step.proof.aiReview}
              />
            </div>
            {step.proof.supplier && (
              <div className="lg:col-start-2 lg:row-start-3">
              <ReleasePanel
                projectId={project.id}
                stepId={step.id}
                stepTitle={step.title}
                amountCents={step.amountCents}
                escrowCents={escrow}
                supplier={step.proof.supplier}
                mode={mode}
                allowDemo={allowDemo}
              />
              </div>
            )}
          </>
        )}

        {(step.status === 'releasing' || step.status === 'paid') && step.payout && (
          <>
            <div className="flex flex-col gap-space-md lg:col-start-2 lg:row-start-2">
              <PayoutTracker step={step} />
              {receipt && <ReceiptCard token={receipt} supplierName={step.payout.supplier.name} />}
            </div>
            {step.proof && (
              <div className="lg:col-start-1 lg:row-span-4 lg:row-start-2">
                <ProofView proof={step.proof} projectId={project.id} expectedFcfa={(step.amountCents / 100) * usdXof} />
              </div>
            )}
          </>
        )}

        {step.status === 'releasing' && (
          <p className="text-center font-label-sm text-label-sm text-on-surface-variant lg:col-start-2 lg:row-start-3" role="status">
            {mode === 'mock' || step.payout?.mode === 'mock' ? t('Simulation : la confirmation arrive dans quelques secondes.') : t('La confirmation arrive par webhook signé de Bitnob. Cette page se met à jour toute seule.')}
          </p>
        )}

        {/* Audit trail */}
        {trail.length > 0 && (
          <section className={`lg:col-start-2 ${hasProof ? 'lg:row-start-4' : 'lg:row-start-2'}`}>
            <h3 className="mb-2 font-title-md text-title-md"><Tc>Trace de cette étape</Tc></h3>
            <ol className="flex flex-col divide-y divide-outline-variant/40 overflow-hidden rounded-2xl bg-surface-container-lowest shadow-sm ring-1 ring-outline-variant/30">
              {trail.map((e) => {
                const meta = LEDGER_LABEL[e.type];
                return (
                  <li key={e.id} className="flex items-center gap-3 px-3.5 py-3">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${meta.tone}`}>
                      <Icon name={meta.icon} size={17} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-label-lg text-label-lg"><Tc>{meta.label}</Tc></span>
                      <span className="block font-label-sm text-label-sm text-on-surface-variant">
                        <Tc>N°</Tc> {e.seq} · {formatDateTime(e.at, t)}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-outline" title={e.hash}>
                      {shortHash(e.hash, 6, 4)}
                    </span>
                  </li>
                );
              })}
            </ol>
            <Link href={`/app/certificat/${project.id}`} className="mt-3 flex items-center justify-center gap-2 font-label-md text-label-md font-semibold text-primary hover:underline">
              <Icon name="workspace_premium" size={18} /> <Tc>Voir le certificat et l&apos;ancrage Bitcoin</Tc>
            </Link>
          </section>
        )}
      </div>
    </main>
  );
}
