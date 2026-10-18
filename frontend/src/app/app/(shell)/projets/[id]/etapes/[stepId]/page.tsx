import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AutoRefresh } from '@/components/app/AutoRefresh';
import { FlowHeader } from '@/components/app/AppHeader';
import { PayoutTracker } from '@/components/app/PayoutTracker';
import { ProofView } from '@/components/app/ProofView';
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
import { readDb } from '@/server/db';
import { findProject, findStep } from '@/server/domain';
import { ledgerFor } from '@/server/ledger';
import { reconcile } from '@/server/services';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Étape' };

const STATUS = {
  upcoming: { tone: 'neutral', label: 'À venir' },
  active: { tone: 'primary', label: 'En attente de la preuve' },
  proof_submitted: { tone: 'warning', label: 'Preuve à valider' },
  releasing: { tone: 'primary', label: 'Paiement en cours' },
  paid: { tone: 'success', label: 'Payée' },
  rejected: { tone: 'danger', label: 'Preuve à refaire' },
} as const;

export default async function StepPage({ params }: { params: { id: string; stepId: string } }) {
  const user = await getSessionUser();
  if (!user) redirect('/app/bienvenue');
  await reconcile();
  const db = await readDb();
  const project = findProject(db, params.id);
  if (!project || project.ownerId !== user.id) notFound();
  const step = findStep(project, params.stepId);
  if (!step) notFound();

  const { usdXof, mode } = getConfig();
  const escrow = escrowCents(db, project);
  const status = STATUS[step.status];
  const trail = ledgerFor(db, project.id).filter((e) => e.data.stepId === step.id);
  const lastFailure = step.status === 'proof_submitted' && step.payout?.status === 'failed' ? step.payout : undefined;
  const previous = project.steps.find((s) => s.index === step.index - 1);
  const hasProof = step.status === 'proof_submitted' || ((step.status === 'releasing' || step.status === 'paid') && !!step.payout);
  const blockedBy = step.status === 'upcoming' ? (previous && previous.status !== 'paid' ? previous : undefined) : undefined;

  return (
    <main className="min-h-screen pb-16 lg:mx-auto lg:w-full lg:max-w-[1100px] lg:px-8 lg:pb-16 lg:pt-8">
      <AutoRefresh active={step.status === 'releasing'} />
      <FlowHeader title={`Étape ${step.index} sur ${project.steps.length}`} backHref={`/app/projets/${project.id}`} />

      <div className="flex flex-col gap-space-lg px-space-md pt-space-md lg:grid lg:grid-cols-[1.4fr_1fr] lg:grid-rows-[auto_auto_auto_auto_1fr] lg:items-start lg:gap-x-8 lg:gap-y-6 lg:px-0 lg:pt-0">
        {/* Title */}
        <section className="lg:col-span-2 lg:row-start-1">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="font-label-md text-label-md text-on-surface-variant">{project.name}</p>
            <Chip tone={status.tone}>{status.label}</Chip>
          </div>
          <h2 className="font-headline-lg-mobile text-headline-lg-mobile font-bold tracking-tight lg:font-headline-xl lg:text-headline-xl">{step.title}</h2>
          <p className="mt-1 flex items-baseline gap-2">
            <span className="font-headline-md text-headline-md font-bold text-primary">{formatUsdShort(step.amountCents)}</span>
            <span className="font-label-md text-label-md text-on-surface-variant">≈ {formatFcfa((step.amountCents / 100) * usdXof)} (taux indicatif)</span>
          </p>
          <p className="mt-2 flex flex-wrap items-center gap-1.5 font-label-sm text-label-sm text-on-surface-variant">
            Preuves attendues :
            {step.proofKinds.map((k) => (
              <span key={k} className="rounded-full bg-surface-container px-2.5 py-0.5 font-label-sm text-label-sm text-on-surface">
                {PROOF_LABEL[k]}
              </span>
            ))}
          </p>
        </section>

        {/* Per-status body */}
        {step.status === 'upcoming' && (
          <section className="rounded-2xl bg-surface-container-low p-4 lg:col-start-1 lg:row-start-2 lg:p-6">
            <p className="mb-1 flex items-center gap-2 font-title-md text-title-md">
              <Icon name="lock" size={20} /> Pas encore débloquée
            </p>
            <p className="mb-3 font-body-sm text-body-sm text-on-surface-variant">
              {blockedBy
                ? `L'étape ${blockedBy.index} (« ${blockedBy.title} ») doit d'abord être payée.`
                : escrow < step.amountCents
                  ? `Le séquestre (${formatUsdShort(escrow)}) doit couvrir cette étape (${formatUsdShort(step.amountCents)}).`
                  : 'Elle se débloque automatiquement.'}
            </p>
            {escrow < step.amountCents && (
              <Link href={`/app/projets/${project.id}/financer`} className="inline-flex h-11 items-center gap-2 rounded-full bg-primary-container px-5 font-label-lg text-label-lg font-bold text-on-primary shadow-md">
                <Icon name="bolt" size={20} filled /> Financer le projet
              </Link>
            )}
          </section>
        )}

        {(step.status === 'active' || step.status === 'rejected') && (
          <section className="flex flex-col gap-3 rounded-2xl bg-surface-container-low p-4 lg:col-start-1 lg:row-start-2 lg:p-6">
            <p className="flex items-center gap-2 font-title-md text-title-md">
              <Icon name={step.status === 'rejected' ? 'undo' : 'hourglass_top'} size={20} className={step.status === 'rejected' ? 'text-error' : 'text-primary'} />
              {step.status === 'rejected' ? 'Preuve refusée : en attente d’une nouvelle preuve' : `En attente de ${project.managerName}`}
            </p>
            {step.decision?.note && <p className="rounded-xl bg-error-container/60 px-3 py-2 font-body-sm text-body-sm text-on-error-container">« {step.decision.note} »</p>}
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              L&apos;étape est financée. {project.managerName} doit maintenant envoyer les photos et la facture depuis son lien privé.
            </p>
            <ShareManagerLink token={project.managerToken} managerName={project.managerName} projectName={project.name} />
            <Link href={`/terrain/${project.managerToken}`} className="font-label-md text-label-md font-semibold text-primary hover:underline">
              Ou envoyer la preuve moi-même
            </Link>
          </section>
        )}

        {step.status === 'proof_submitted' && step.proof && (
          <>
            <div className="flex flex-col gap-space-lg lg:col-start-2 lg:row-start-2">
            <div className="flex items-start gap-3 rounded-2xl bg-[#FFFBEB] p-3.5 ring-1 ring-[#F59E0B]/30">
              <Icon name="rate_review" size={22} className="mt-0.5 shrink-0 text-[#B45309]" />
              <p className="font-body-sm text-body-sm text-[#92400E]">
                Preuve reçue {formatDateTime(step.proof.submittedAt)}. Regardez les photos et la facture, puis décidez. Rien n&apos;est payé sans votre accord.
              </p>
            </div>
            {lastFailure && (
              <div className="flex items-start gap-3 rounded-2xl bg-error-container p-3.5 text-on-error-container" role="alert">
                <Icon name="error" size={22} className="mt-0.5 shrink-0" />
                <p className="font-body-sm text-body-sm">
                  <strong>Le dernier paiement n&apos;a pas abouti</strong> {lastFailure.error ? `(${lastFailure.error})` : ''}. Vos fonds sont toujours en séquestre : vous pouvez réessayer.
                </p>
              </div>
            )}
            </div>
            <div className="lg:col-start-1 lg:row-span-4 lg:row-start-2">
              <ProofView proof={step.proof} projectId={project.id} expectedFcfa={(step.amountCents / 100) * usdXof} />
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
              />
              </div>
            )}
          </>
        )}

        {(step.status === 'releasing' || step.status === 'paid') && step.payout && (
          <>
            <div className="lg:col-start-2 lg:row-start-2">
              <PayoutTracker step={step} />
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
            {mode === 'mock' || step.payout?.mode === 'mock' ? 'Simulation : la confirmation arrive dans quelques secondes.' : 'La confirmation arrive par webhook signé de Bitnob. Cette page se met à jour toute seule.'}
          </p>
        )}

        {/* Audit trail */}
        {trail.length > 0 && (
          <section className={`lg:col-start-2 ${hasProof ? 'lg:row-start-4' : 'lg:row-start-2'}`}>
            <h3 className="mb-2 font-title-md text-title-md">Trace de cette étape</h3>
            <ol className="flex flex-col divide-y divide-outline-variant/40 overflow-hidden rounded-2xl bg-surface-container-lowest shadow-sm ring-1 ring-outline-variant/30">
              {trail.map((e) => {
                const meta = LEDGER_LABEL[e.type];
                return (
                  <li key={e.id} className="flex items-center gap-3 px-3.5 py-3">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${meta.tone}`}>
                      <Icon name={meta.icon} size={17} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-label-lg text-label-lg">{meta.label}</span>
                      <span className="block font-label-sm text-label-sm text-on-surface-variant">
                        N° {e.seq} · {formatDateTime(e.at)}
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
              <Icon name="workspace_premium" size={18} /> Voir le certificat et l&apos;ancrage Bitcoin
            </Link>
          </section>
        )}
      </div>
    </main>
  );
}
