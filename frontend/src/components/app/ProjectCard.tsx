import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { Chip, ProgressBar } from '@/components/ui/primitives';
import { formatUsdShort, relativeDay } from '@/lib/money';
import { SECTORS } from '@/lib/templates';
import type { ProjectSummary } from '@/server/views';
import { Tc } from '@/lib/i18n/client';
import { getT } from '@/lib/i18n/server';

/** Status shown at the top-right of a project card, already in the reader's language. */
export function projectStatus(s: ProjectSummary, t: (fr: string, vars?: Record<string, string | number>) => string): { tone: 'accent' | 'success' | 'neutral' | 'warning'; label: string; ping?: boolean } {
  const { project, current } = s;
  if (project.closedAt) return { tone: 'neutral', label: t('Clos') };
  if (s.waitingDecision > 0) return { tone: 'accent', label: t('Preuve à valider ({n})', { n: s.waitingDecision }), ping: true };
  if (project.steps.every((st) => st.status === 'paid')) return { tone: 'success', label: t('Terminé') };
  if (current?.status === 'releasing') return { tone: 'warning', label: t('Paiement en cours') };
  if (current?.status === 'rejected') return { tone: 'warning', label: t('Preuve à refaire') };
  if (current?.status === 'active') return { tone: 'neutral', label: t('En attente de la preuve') };
  if (current?.status === 'upcoming') return { tone: 'warning', label: t('À financer') };
  return { tone: 'neutral', label: t('En cours') };
}

export function lastPaidAt(s: ProjectSummary): string | undefined {
  return s.project.steps
    .map((st) => st.payout?.completedAt)
    .filter((x): x is string => !!x)
    .sort()
    .pop();
}

export async function ProjectCard({ summary }: { summary: ProjectSummary }) {
  const t = await getT();
  const { project, current } = summary;
  const sector = SECTORS[project.sector];
  const status = projectStatus(summary, t);
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
          <span className={`rounded-full px-2.5 py-0.5 font-label-sm text-label-sm tracking-wide ${sector.chip}`}><Tc>{sector.label}</Tc></span>
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
            {project.city}<Tc>, Sénégal · Sur place :</Tc> <span className="font-label-md text-on-surface">{project.managerName}</span>
          </span>
        </span>
      </Link>

      <div className="flex flex-col gap-1.5 rounded-xl bg-surface-container-low p-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-label-sm text-label-sm font-medium text-on-surface-variant">
            {current ? t('Étape {index} sur {length} : {title}', { index: current.index, length: project.steps.length, title: t(current.title) }) : t('Toutes les étapes sont payées')}
          </span>
          <span className="font-label-md text-label-md font-bold text-primary">{summary.progress}%</span>
        </div>
        <ProgressBar value={summary.progress} />
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <Metric label={t('En séquestre')} value={formatUsdShort(summary.escrow, t)} tone="text-primary" />
        <Metric label={t('Libérés')} value={formatUsdShort(summary.released, t)} tone="text-tertiary-container" />
        <Metric label={t('Budget total')} value={formatUsdShort(project.budgetCents, t)} tone="text-on-surface" />
      </div>

      <div className="flex items-center justify-between pt-1">
        {pendingStep ? (
          <span className="flex items-center gap-1 font-label-sm text-label-sm text-on-surface-variant">
            <Icon name="photo_camera" size={16} className="text-primary" /> <Tc>Preuve prête à valider</Tc>
          </span>
        ) : (
          <span className="font-label-sm text-label-sm text-on-surface-variant">{paidAt ? t('Dernier paiement : {relativeDay}', { relativeDay: relativeDay(paidAt, t) }) : t('Aucun paiement pour le moment')}</span>
        )}
        <Link href={pendingStep ? `${href}/etapes/${pendingStep.id}` : href} className="inline-flex items-center gap-1 font-label-md text-label-md text-primary transition-colors hover:text-primary-container">
          {pendingStep ? t('Examiner la preuve') : t('Voir détails')}
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
