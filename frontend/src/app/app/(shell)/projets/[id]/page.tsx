import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AutoRefresh } from '@/components/app/AutoRefresh';
import { FlowHeader } from '@/components/app/AppHeader';
import { ShareManagerLink } from '@/components/app/ShareManagerLink';
import { StepTimeline } from '@/components/app/StepTimeline';
import { projectStatus } from '@/components/app/ProjectCard';
import { Flag } from '@/components/ui/Flag';
import { Icon } from '@/components/ui/Icon';
import { Avatar, Chip, ProgressBar, SectionTitle } from '@/components/ui/primitives';
import { formatFcfa, formatUsd, formatUsdShort } from '@/lib/money';
import { SECTORS } from '@/lib/templates';
import { getSessionUser } from '@/server/auth';
import { getConfig } from '@/server/config';
import { managerLinkToken } from '@/server/managerToken';
import { readDb } from '@/server/db';
import { findProject } from '@/server/domain';
import { ledgerFor } from '@/server/ledger';
import { summarize } from '@/server/views';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Projet' };

// explicit rows for the two-column layout on computers (written out so Tailwind keeps the classes)
const ROW = ['lg:row-start-1', 'lg:row-start-2', 'lg:row-start-3', 'lg:row-start-4', 'lg:row-start-5'];

export default async function ProjectPage({ params, searchParams }: { params: { id: string }; searchParams: { cree?: string } }) {
  const user = await getSessionUser();
  if (!user) redirect('/app/bienvenue');
  const db = await readDb();
  const project = findProject(db, params.id);
  if (!project || project.ownerId !== user.id) notFound();

  const s = summarize(db, project);
  const status = projectStatus(s);
  const sector = SECTORS[project.sector];
  const { usdXof } = getConfig();
  const anchors = db.anchors.filter((a) => a.projectId === project.id && a.status !== 'failed');
  const confirmed = anchors.filter((a) => a.status === 'confirmed').length;
  const events = ledgerFor(db, project.id).length;
  const toFund = Math.max(0, project.budgetCents - s.funded);
  const nextLocked = project.steps.find((st) => st.status === 'upcoming');
  const missingForNext = nextLocked && s.escrow < nextLocked.amountCents && !project.steps.some((st) => st.status === 'active' || st.status === 'proof_submitted' || st.status === 'rejected' || st.status === 'releasing') ? nextLocked.amountCents - s.escrow : 0;
  const inFlight = project.steps.some((st) => st.status === 'releasing');
  const base = searchParams.cree ? 1 : 0;
  const done = project.steps.every((st) => st.status === 'paid');

  return (
    <main className="min-h-screen pb-12 lg:mx-auto lg:w-full lg:max-w-[1100px] lg:px-8 lg:pb-16 lg:pt-8">
      <AutoRefresh active={inFlight} />
      <FlowHeader title={project.name} backHref="/app/projets" />

      {/* Cover */}
      <div className="relative h-44 w-full overflow-hidden lg:h-64 lg:rounded-3xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={project.coverImage} alt="" className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0A0F24]/80 via-[#0A0F24]/10 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-space-md text-white">
          <div className="min-w-0">
            <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-0.5 font-label-sm text-label-sm backdrop-blur">
              <Icon name={sector.icon} size={14} /> {sector.label}
            </span>
            <p className="flex items-center gap-1.5 truncate font-body-md text-body-md">
              <Flag code="SN" className="h-3 w-[18px]" /> {project.city}, Sénégal
            </p>
          </div>
          <Chip tone={status.tone}>{status.label}</Chip>
        </div>
      </div>

      <div className={`flex flex-col gap-space-lg px-space-md pt-space-md lg:grid lg:grid-cols-[1.5fr_1fr] lg:items-start lg:gap-x-8 lg:gap-y-6 lg:px-0 lg:pt-6 ${base ? 'lg:grid-rows-[auto_auto_auto_auto_1fr]' : 'lg:grid-rows-[auto_auto_auto_1fr]'}`}>
        {searchParams.cree && (
          <section className="nob-pop flex flex-col gap-3 rounded-2xl bg-[#DCFCE7] p-4 text-[#14532D] lg:col-span-2 lg:row-start-1">
            <p className="flex items-center gap-2 font-title-md text-title-md">
              <Icon name="check_circle" filled /> Projet créé
            </p>
            <p className="font-body-sm text-body-sm">Deux gestes pour démarrer : alimenter le séquestre, et donner à {project.managerName} son lien pour envoyer les preuves.</p>
            <Link href={`/app/projets/${project.id}/financer`} className="flex h-11 items-center justify-center gap-2 rounded-full bg-primary-container font-label-lg text-label-lg font-bold text-on-primary shadow-md">
              <Icon name="bolt" size={20} filled /> Financer maintenant
            </Link>
          </section>
        )}

        {/* Money */}
        <section className={`rounded-3xl bg-surface-container-lowest p-4 shadow-sm ring-1 ring-outline-variant/30 lg:col-start-2 lg:p-6 ${ROW[base]}`}>
          <div className="mb-3 flex items-end justify-between gap-2">
            <div>
              <p className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">En séquestre</p>
              <p className="font-headline-lg-mobile text-headline-lg-mobile font-bold text-primary">{formatUsd(s.escrow)}</p>
              <p className="font-label-sm text-label-sm text-on-surface-variant">≈ {formatFcfa((s.escrow / 100) * usdXof)} (taux indicatif)</p>
            </div>
            <div className="text-right">
              <p className="font-label-sm text-label-sm text-on-surface-variant">Avancement</p>
              <p className="font-headline-md text-headline-md font-bold">{s.progress}%</p>
            </div>
          </div>
          <ProgressBar value={s.progress} className="mb-3" />
          <div className="grid grid-cols-3 gap-2 text-center">
            <Figure label="Budget" value={formatUsdShort(project.budgetCents)} />
            <Figure label="Déposé" value={formatUsdShort(s.funded)} />
            <Figure label="Libéré" value={formatUsdShort(s.released)} tone="text-[#15803D]" />
          </div>
          {!done && (
            <div className="mt-4 flex flex-col gap-2">
              {missingForNext > 0 && nextLocked && (
                <p className="rounded-xl bg-[#FEF3C7] px-3 py-2 font-label-md text-label-md text-[#B45309]">
                  Il manque {formatUsdShort(missingForNext)} pour débloquer l&apos;étape {nextLocked.index}.
                </p>
              )}
              <Link href={`/app/projets/${project.id}/financer`} className="flex h-12 items-center justify-center gap-2 rounded-full bg-primary-container font-label-lg text-label-lg font-bold text-on-primary shadow-lg shadow-primary/25 transition hover:bg-primary active:scale-[0.98]">
                <Icon name="bolt" size={20} filled /> {toFund > 0 ? 'Financer ce projet' : 'Ajouter des fonds'}
              </Link>
            </div>
          )}
        </section>

        {/* Steps */}
        <section className={`lg:col-start-1 lg:row-span-4 ${ROW[base]}`}>
          <SectionTitle action={<span className="font-label-sm text-label-sm text-on-surface-variant">{project.steps.filter((x) => x.status === 'paid').length} / {project.steps.length} payées</span>}>Étapes</SectionTitle>
          <StepTimeline projectId={project.id} steps={project.steps} />
        </section>

        {/* Field manager */}
        <section className={`rounded-2xl bg-surface-container-low p-4 lg:col-start-2 lg:p-6 ${ROW[base + 1]}`}>
          <div className="mb-3 flex items-center gap-3">
            <Avatar first={project.managerName.split(' ')[0]} last={project.managerName.split(' ').slice(1).join(' ')} />
            <div className="min-w-0">
              <p className="truncate font-title-md text-title-md">{project.managerName}</p>
              <p className="font-body-sm text-body-sm text-on-surface-variant">Personne de confiance sur place</p>
            </div>
          </div>
          <p className="mb-3 font-body-sm text-body-sm text-on-surface-variant">
            Elle ouvre ce lien privé, prend les photos, ajoute la facture et indique qui payer. Elle ne voit pas votre solde et ne peut rien débloquer.
          </p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <ShareManagerLink token={managerLinkToken(project)} managerName={project.managerName} projectName={project.name} projectId={project.id} />
            <Link href={`/terrain/${managerLinkToken(project)}`} className="font-label-md text-label-md font-semibold text-primary hover:underline">
              Ouvrir la vue terrain
            </Link>
          </div>
        </section>

        {/* Certificate */}
        <Link href={`/app/certificat/${project.id}`} className={`flex items-center gap-3 rounded-2xl bg-surface-container-lowest p-4 shadow-sm ring-1 ring-outline-variant/30 transition hover:shadow-md lg:col-start-2 ${ROW[base + 2]}`}>
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#FFEDD5] text-[#C26700]">
            <Icon name="workspace_premium" size={24} filled />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-title-md text-title-md">Certificat de preuve</span>
            <span className="block font-body-sm text-body-sm text-on-surface-variant">
              {events} événement{events > 1 ? 's' : ''} enchaîné{events > 1 ? 's' : ''} ·{' '}
              {anchors.length === 0 ? 'pas encore ancré sur Bitcoin' : `${confirmed}/${anchors.length} ancrage${anchors.length > 1 ? 's' : ''} confirmé${confirmed > 1 ? 's' : ''}`}
            </span>
          </span>
          <Icon name="chevron_right" className="text-on-surface-variant" />
        </Link>
      </div>
    </main>
  );
}

function Figure({ label, value, tone = 'text-on-surface' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl bg-surface-container-low p-2">
      <span className="block font-label-sm text-label-sm text-on-surface-variant">{label}</span>
      <span className={`block truncate font-label-lg text-label-lg font-bold ${tone}`}>{value}</span>
    </div>
  );
}
