import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { Chip, ProgressBar } from '@/components/ui/primitives';
import { formatUsdShort, relativeDay } from '@/lib/money';
import { SECTORS } from '@/lib/templates';
import type { ProjectSummary } from '@/server/views';

/** Status shown at the top-right of a project card. */
export function projectStatus(s: ProjectSummary): { tone: 'accent' | 'success' | 'neutral' | 'warning'; label: string; ping?: boolean } {
  const { project, current } = s;
  if (s.waitingDecision > 0) return { tone: 'accent', label: `Preuve à valider (${s.waitingDecision})`, ping: true };
  if (project.steps.every((st) => st.status === 'paid')) return { tone: 'success', label: 'Terminé' };
  if (current?.status === 'releasing') return { tone: 'warning', label: 'Paiement en cours' };
  if (current?.status === 'rejected') return { tone: 'warning', label: 'Preuve à refaire' };
  if (current?.status === 'active') return { tone: 'neutral', label: 'En attente de la preuve' };
  if (current?.status === 'upcoming') return { tone: 'warning', label: 'À financer' };
  return { tone: 'neutral', label: 'En cours' };
}

export function lastPaidAt(s: ProjectSummary): string | undefined {
  return s.project.steps
    .map((st) => st.payout?.completedAt)
    .filter((x): x is string => !!x)
    .sort()
    .pop();
}

export function ProjectCard({ summary }: { summary: ProjectSummary }) {
  const { project, current } = summary;
  const sector = SECTORS[project.sector];
  const status = projectStatus(summary);
  const paidAt = lastPaidAt(summary);
  const pendingStep = project.steps.find((st) => st.status === 'proof_submitted');
  const href = `/app/projets/${project.id}`;

  return (
    <article className="flex flex-col gap-space-sm rounded-2xl bg-surface-container-lowest p-space-md shadow-sm transition-shadow hover:shadow-md" data-sector={project.sector}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`flex h-8 w-8 items-center justify-center rounded-full bg-surface-container-high ${sector.iconColor}`}>
            <Icon name={sector.icon} size={18} />
          </span>
          <span className={`rounded-full px-2.5 py-0.5 font-label-sm text-label-sm tracking-wide ${sector.chip}`}>{sector.label}</span>
        </div>
        <Chip tone={status.tone}>
          {status.ping && <span className="h-1.5 w-1.5 animate-ping rounded-full bg-tertiary-container" />}
          {status.label}
        </Chip>
      </div>

      <Link href={href} className="flex items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={project.coverImage} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover shadow-inner" />
        <span className="flex min-w-0 flex-col">
          <h3 className="truncate font-title-lg text-title-lg text-on-surface">{project.name}</h3>
          <span className="mt-0.5 truncate font-body-sm text-body-sm text-on-surface-variant">
            {project.city}, Sénégal · Sur place : <span className="font-label-md text-on-surface">{project.managerName}</span>
          </span>
        </span>
      </Link>

      <div className="flex flex-col gap-1.5 rounded-xl bg-surface-container-low p-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-label-sm text-label-sm font-medium text-on-surface-variant">
            {current ? `Étape ${current.index} sur ${project.steps.length} : ${current.title}` : 'Toutes les étapes sont payées'}
          </span>
          <span className="font-label-md text-label-md font-bold text-primary">{summary.progress}%</span>
        </div>
        <ProgressBar value={summary.progress} />
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <Metric label="En séquestre" value={formatUsdShort(summary.escrow)} tone="text-primary" />
        <Metric label="Libérés" value={formatUsdShort(summary.released)} tone="text-tertiary-container" />
        <Metric label="Budget total" value={formatUsdShort(project.budgetCents)} tone="text-on-surface" />
      </div>

      <div className="flex items-center justify-between pt-1">
        {pendingStep ? (
          <span className="flex items-center gap-1 font-label-sm text-label-sm text-on-surface-variant">
            <Icon name="photo_camera" size={16} className="text-primary" /> Preuve prête à valider
          </span>
        ) : (
          <span className="font-label-sm text-label-sm text-on-surface-variant">{paidAt ? `Dernier paiement : ${relativeDay(paidAt)}` : 'Aucun paiement pour le moment'}</span>
        )}
        <Link href={pendingStep ? `${href}/etapes/${pendingStep.id}` : href} className="inline-flex items-center gap-1 font-label-md text-label-md text-primary transition-colors hover:text-primary-container">
          {pendingStep ? 'Examiner la preuve' : 'Voir détails'}
          <Icon name={pendingStep ? 'arrow_forward' : 'chevron_right'} size={16} />
        </Link>
      </div>
    </article>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="flex min-w-0 flex-col items-start rounded-xl bg-surface-container-low p-2">
      <span className="truncate font-label-sm text-label-sm text-on-surface-variant">{label}</span>
      <span className={`mt-0.5 truncate font-label-md text-label-md font-bold ${tone}`}>{value}</span>
    </div>
  );
}
