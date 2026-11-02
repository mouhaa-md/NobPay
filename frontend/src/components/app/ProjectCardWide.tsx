import Link from 'next/link';
import { Flag } from '@/components/ui/Flag';
import { Icon } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/primitives';
import { formatFcfa, formatUsd, formatUsdShort, relativeDay } from '@/lib/money';
import { SECTORS, SUPPLIER_NETWORKS } from '@/lib/templates';
import type { ProjectSummary } from '@/server/views';
import { lastPaidAt } from './ProjectCard';
import { Tc } from '@/lib/i18n/client';
import { getT } from '@/lib/i18n/server';

/** Computer version of a project card: photo and people on the left, money and next action on the right. */
export async function ProjectCardWide({ summary, usdXof }: { summary: ProjectSummary; usdXof: number }) {
  const t = await getT();
  const { project, current } = summary;
  const sector = SECTORS[project.sector];
  const href = `/app/projets/${project.id}`;
  const paidCount = project.steps.filter((s) => s.status === 'paid').length;
  const toFund = Math.max(0, project.budgetCents - summary.funded);
  const pct = (v: number) => (project.budgetCents > 0 ? Math.min(100, (v / project.budgetCents) * 100) : 0);
  const waiting = project.steps.find((s) => s.status === 'proof_submitted');
  const releasing = project.steps.find((s) => s.status === 'releasing');
  const [first, ...rest] = project.managerName.split(' ');
  const done = project.steps.every((s) => s.status === 'paid');
  const paidAt = lastPaidAt(summary);

  let strip: { tone: string; icon: string; text: string; cta?: { href: string; label: string } };
  if (waiting) {
    strip = { tone: 'bg-tertiary-fixed text-on-tertiary-fixed', icon: 'pending_actions', text: t('Preuve en attente de votre décision : {title}', { title: t(waiting.title) }), cta: { href: `${href}/etapes/${waiting.id}`, label: t('Examiner la preuve') } };
  } else if (done) {
    strip = { tone: 'bg-[#DCFCE7] text-[#14532D]', icon: 'check_circle', text: t('Projet terminé : toutes les étapes sont payées'), cta: { href: `/app/certificat/${project.id}`, label: t('Voir le certificat') } };
  } else if (releasing) {
    strip = { tone: 'bg-surface-container text-on-surface', icon: 'sync', text: t('Paiement en cours vers {name} ({network})', { name: releasing.payout?.supplier.name ?? t('le fournisseur'), network: releasing.payout ? SUPPLIER_NETWORKS[releasing.payout.supplier.network] : 'mobile money' }) };
  } else if (current?.status === 'rejected') {
    strip = { tone: 'bg-error-container text-on-error-container', icon: 'undo', text: t('Preuve refusée : {name} doit en renvoyer une pour « {title} »', { name: project.managerName, title: t(current.title) }) };
  } else if (current?.status === 'active') {
    strip = { tone: 'bg-surface-container text-on-surface', icon: 'hourglass_top', text: t('En attente de la preuve de {name} : {title}', { name: project.managerName, title: t(current.title) }) };
  } else if (current) {
    const missing = Math.max(0, current.amountCents - summary.escrow);
    strip = { tone: 'bg-[#FEF3C7] text-[#92400E]', icon: 'account_balance_wallet', text: missing > 0 ? t("Il manque {amount} pour débloquer l'étape {index}", { amount: formatUsdShort(missing), index: current.index }) : t("L'étape {index} va s'ouvrir", { index: current.index }), cta: missing > 0 ? { href: `${href}/financer`, label: t('Financer') } : undefined };
  } else {
    strip = { tone: 'bg-surface-container text-on-surface', icon: 'info', text: t('Aucune étape à traiter') };
  }

  return (
    <article className="grid grid-cols-12 gap-6 rounded-3xl bg-surface-container-lowest p-6 shadow-md transition-shadow hover:shadow-xl">
      {/* Photo and people */}
      <div className="col-span-4 flex flex-col gap-3">
        <Link href={href} className="group relative block h-52 overflow-hidden rounded-2xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={project.coverImage} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
          <div className="absolute inset-0 bg-gradient-to-t from-inverse-surface/70 via-transparent to-inverse-surface/10" />
          <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-surface-container-lowest/90 px-3 py-1 shadow-sm backdrop-blur-md">
            <Icon name={sector.icon} size={16} className={sector.iconColor} />
            <span className="font-label-sm text-label-sm font-bold uppercase tracking-wider text-on-surface"><Tc>{sector.label}</Tc></span>
          </span>
          <span className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-surface-container-lowest/90 px-2.5 py-1 shadow-sm backdrop-blur-md">
            <Flag code="SN" className="h-3 w-[18px]" />
            <span className="font-label-sm text-label-sm font-medium text-on-surface">{project.city}</span>
          </span>
        </Link>
        <div className="flex items-center gap-3 rounded-2xl bg-surface-container-low p-3">
          <Avatar first={first} last={rest.join(' ')} size="sm" />
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-label-md text-label-md text-on-surface">{project.managerName}</span>
            <span className="truncate font-body-sm text-body-sm text-on-surface-variant"><Tc>Personne de confiance sur place</Tc></span>
          </span>
          <Icon name="groups" size={20} className="ml-auto text-outline" />
        </div>
      </div>

      {/* Money and next action */}
      <div className="col-span-8 flex flex-col justify-between gap-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="truncate font-title-lg text-title-lg font-bold text-on-surface">{project.name}</h2>
            <p className="mt-1 flex flex-wrap items-baseline gap-x-3">
              <span className="font-headline-lg text-headline-lg font-extrabold tracking-tight text-on-surface">{formatUsd(project.budgetCents)}</span>
              <span className="font-title-md text-title-md font-medium text-on-surface-variant">≈ {formatFcfa((project.budgetCents / 100) * usdXof)}</span>
            </p>
          </div>
          <Link href={href} className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-primary-container px-6 font-label-lg text-label-lg text-on-primary shadow-sm transition hover:bg-primary active:scale-95">
            <Tc>Gérer le projet</Tc> <Icon name="arrow_forward" size={18} />
          </Link>
        </div>

        <div className="flex flex-col gap-2 rounded-2xl bg-surface-container-low p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-1.5 truncate font-label-lg text-label-lg font-bold text-on-surface">
              <Icon name={current ? 'flag' : 'task_alt'} size={20} className="text-primary" />
              {current ? t('Étape {index} sur {length} · {title}', { index: current.index, length: project.steps.length, title: current.title }) : t('Toutes les étapes sont payées')}
            </span>
            <span className="shrink-0 font-title-md text-title-md font-bold text-primary">{summary.progress} <Tc>% libérés</Tc></span>
          </div>
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-container-highest" role="img" aria-label={t('Répartition du budget : libéré, en séquestre, à financer')}>
            <span className="h-full bg-[#16A34A]" style={{ width: `${pct(summary.released)}%` }} />
            <span className="h-full bg-primary-container" style={{ width: `${pct(summary.escrow)}%` }} />
          </div>
          <div className="grid grid-cols-3 gap-2 pt-1">
            <Metric dot="bg-primary-container" label={t('En séquestre')} value={formatUsdShort(summary.escrow)} note="Libéré sur preuve" />
            <Metric dot="bg-[#16A34A]" label={t('Libéré')} value={formatUsdShort(summary.released)} note={`${paidCount} étape${paidCount > 1 ? 's' : ''} payée${paidCount > 1 ? 's' : ''}`} tone="text-[#15803D]" />
            <Metric dot="bg-outline-variant" label={t('Reste à financer')} value={formatUsdShort(toFund)} note={toFund === 0 ? 'Budget entièrement financé' : 'Pour couvrir le budget'} />
          </div>
        </div>

        <div className={`flex items-center justify-between gap-3 rounded-full px-4 py-2.5 font-label-md text-label-md ${strip.tone}`}>
          <span className="flex min-w-0 items-center gap-2 font-semibold">
            <Icon name={strip.icon} size={20} className="shrink-0" />
            <span className="truncate">{strip.text}</span>
          </span>
          {strip.cta ? (
            <Link href={strip.cta.href} className="inline-flex shrink-0 items-center gap-1 rounded-full bg-surface-container-lowest px-3 py-1 font-label-sm text-label-sm text-on-surface shadow-sm transition hover:bg-surface-container">
              {strip.cta.label} <Icon name="chevron_right" size={14} />
            </Link>
          ) : (
            paidAt && !done && <span className="shrink-0 font-label-sm text-label-sm opacity-70"><Tc>Dernier paiement :</Tc> {relativeDay(paidAt, t)}</span>
          )}
        </div>
      </div>
    </article>
  );
}

function Metric({ dot, label, value, note, tone = 'text-on-surface' }: { dot: string; label: string; value: string; note: string; tone?: string }) {
  return (
    <div className="flex min-w-0 flex-col rounded-2xl bg-surface-container-lowest p-3 shadow-sm">
      <span className="flex items-center gap-1.5 font-label-sm text-label-sm text-on-surface-variant">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        {label}
      </span>
      <span className={`truncate font-title-md text-title-md font-bold ${tone}`}>{value}</span>
      <span className="truncate font-body-sm text-body-sm text-outline">{note}</span>
    </div>
  );
}
