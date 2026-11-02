import type { Metadata } from 'next';
import Link from 'next/link';
import { ActivityList } from '@/components/app/ActivityList';
import { DesktopTopbar } from '@/components/app/DesktopTopbar';
import { BalanceCard } from '@/components/app/BalanceCard';
import { InstallCard } from '@/components/app/InstallCard';
import { ProjectCardWide } from '@/components/app/ProjectCardWide';
import { Icon } from '@/components/ui/Icon';
import { Avatar, ProgressBar, SectionTitle } from '@/components/ui/primitives';
import { formatUsdShort } from '@/lib/money';
import { QUICK_TRIAL_BUDGET_CENTS, RESIDENCE_COUNTRIES, SECTORS } from '@/lib/templates';
import { getSessionUser } from '@/server/auth';
import { INSTANCE } from '@/lib/instance';
import { getConfig, instanceMode } from '@/server/config';
import { readDb } from '@/server/db';
import { buildActivity, totalsOf, userProjects } from '@/server/views';
import { Tc } from '@/lib/i18n/client';
import { getT } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t('Accueil') };
}

export default async function Home() {
  const t = await getT();
  const user = (await getSessionUser())!;
  const db = await readDb();
  const summaries = userProjects(db, user.id);
  const totals = totalsOf(db, summaries);
  const activity = buildActivity(db, user.id, 6, t);
  const { usdXof, mode } = getConfig();
  const country = RESIDENCE_COUNTRIES.find((c) => c.code === user.country)?.name ?? 'Diaspora';

  // Field teams = distinct people who are our eyes on the ground.
  const teams = [...new Map(summaries.map((s) => [s.project.managerName, s.project])).values()];
  const focus = summaries.find((s) => s.waitingDecision > 0) ?? summaries.find((s) => s.current?.status !== 'paid' && s.progress < 100) ?? summaries[0];
  const anchorsLabel = totals.anchorsTotal === 0 ? '0' : `${totals.anchorsConfirmed}/${totals.anchorsTotal}`;

  return (
    <>
      <DesktopTopbar title={t('Accueil')} />

      {/* ---------- phone ---------- */}
      <main id="contenu" className="pb-24 lg:hidden">
        {/* Ocean header */}
        <section className="pt-safe relative w-full overflow-hidden bg-gradient-to-br from-[#0A0F24] via-[#0B132B] to-[#1E40AF] px-5 pb-12 pt-4 text-white shadow-xl">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary-container/20 blur-3xl" />
          <div className="pointer-events-none absolute -left-12 top-28 h-48 w-48 rounded-full bg-surface-tint/15 blur-2xl" />

          <div className="relative z-10 mb-6 flex items-center justify-between gap-3">
            <Link href="/app/profil" className="flex min-w-0 items-center gap-3">
              <Avatar first={user.firstName} last={user.lastName} />
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-title-md text-title-md text-white">
                  <Tc>Bonjour,</Tc> {user.firstName} {user.lastName}
                </span>
                <span className="truncate font-label-sm text-label-sm text-surface-variant/80">
                  {country} · {user.demo ? t('Compte de démonstration') : 'Diaspora'}
                </span>
              </span>
            </Link>
            <Link href="/app/notifications" aria-label={t('Notifications')} className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md transition hover:bg-white/20 active:scale-95">
              <Icon name="notifications" size={20} />
              {totals.waitingDecision > 0 && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[#F97316] ring-2 ring-[#0B132B]" />}
            </Link>
          </div>

          <BalanceCard escrowCents={totals.escrow} rate={usdXof} />
          <p className="relative z-10 mt-3 flex items-center gap-1.5 font-label-sm text-label-sm text-surface-variant/80">
            <Icon name="lock" size={14} />
            <Tc>{INSTANCE[instanceMode()].custody}</Tc>
          </p>
        </section>

        {/* Sheet overlapping the header */}
        <section className="relative z-20 -mt-6 flex flex-col gap-6 rounded-t-3xl bg-surface-container-lowest px-5 pb-6 pt-6 shadow-[0_-8px_30px_rgba(10,15,36,0.08)]">
          <InstallCard />

          <div className="grid grid-cols-3 gap-2">
            <Stat label={t('En cours')} value={String(totals.projects)} caption={t(totals.projects > 1 ? 'Projets' : 'Projet')} tone="text-primary" />
            <Stat label={t('Payées')} value={`${totals.stepsPaid}/${totals.stepsTotal}`} caption={t('Étapes')} tone="text-on-surface" />
            <Stat label={t('Ancrages')} value={anchorsLabel} caption={t('Sur Bitcoin')} tone="text-[#C26700]" />
          </div>

          {teams.length > 0 && (
            <div className="flex flex-col">
              <div className="mb-3.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="font-title-md text-title-md text-on-surface"><Tc>Équipes terrain</Tc></h2>
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-container font-label-sm text-label-sm font-semibold text-on-secondary-container">{teams.length}</span>
                </div>
                <Link href="/app/projets" className="flex items-center font-label-sm text-label-sm font-semibold text-primary transition hover:text-primary-container">
                  <Tc>Voir tout</Tc> <Icon name="chevron_right" size={14} className="ml-0.5" />
                </Link>
              </div>
              <div className="-mx-5 flex items-start gap-3.5 overflow-x-auto px-5 pb-1">
                {teams.map((p) => {
                  const [first, ...rest] = p.managerName.split(' ');
                  return (
                    <Link key={p.id} href={`/app/projets/${p.id}`} className="group flex w-20 shrink-0 flex-col items-center text-center">
                      <Avatar first={first} last={rest.join(' ')} size="lg" status={p.steps.some((s) => s.status === 'active' || s.status === 'rejected') ? 'pending' : 'online'} />
                      <span className="mt-1.5 w-full truncate font-label-md text-label-md text-on-surface">
                        {first} {rest.map((r) => `${r.charAt(0)}.`).join(' ')}
                      </span>
                      <span className="w-full truncate font-label-sm text-label-sm text-on-surface-variant">{p.city}</span>
                    </Link>
                  );
                })}
                <Link href="/app/projets/nouveau" className="group flex w-20 shrink-0 flex-col items-center text-center">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant transition group-hover:bg-surface-variant">
                    <Icon name="person_add" size={24} />
                  </span>
                  <span className="mt-1.5 w-full truncate font-label-md text-label-md text-on-surface-variant"><Tc>Inviter</Tc></span>
                  <span className="font-label-sm text-label-sm text-on-surface-variant/70"><Tc>Sur place</Tc></span>
                </Link>
              </div>
            </div>
          )}

          {focus ? (
            <Link
              href={`/app/projets/${focus.project.id}`}
              className="relative block overflow-hidden rounded-2xl bg-gradient-to-r from-surface-container-low via-surface-container to-surface-container-low p-4 shadow-sm transition hover:shadow-md"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <Icon name={SECTORS[focus.project.sector].icon} size={20} className={SECTORS[focus.project.sector].iconColor} />
                  <span className="truncate font-title-md text-title-md text-on-surface">{focus.project.name}</span>
                </span>
                <span className="shrink-0 rounded-full bg-[#DCFCE7] px-2 py-0.5 font-label-sm text-label-sm font-semibold uppercase text-[#15803D]">
                  {focus.current ? t('Étape {index} / {length}', { index: focus.current.index, length: focus.project.steps.length }) : t('Terminé')}
                </span>
              </div>
              <ProgressBar value={focus.progress} className="mb-2 !bg-surface-container-highest" />
              <div className="flex items-center justify-between gap-2 font-label-sm text-label-sm text-on-surface-variant">
                <span className="truncate">{focus.current ? t(focus.current.title) : t('Toutes les étapes sont payées')}</span>
                <span className="shrink-0 font-medium text-on-surface">
                  {formatUsdShort(focus.released)} / {formatUsdShort(focus.project.budgetCents)} <Tc>libérés</Tc>
                </span>
              </div>
            </Link>
          ) : (
            <NoProject />
          )}

          <div className="flex flex-col">
            <SectionTitle action={<span className="font-label-sm text-label-sm text-on-surface-variant"><Tc>Les plus récentes</Tc></span>}><Tc>Activité récente</Tc></SectionTitle>
            <ActivityList items={activity} empty="Votre activité apparaîtra ici dès le premier versement." />
          </div>
        </section>
      </main>

      {/* ---------- computer ---------- */}
      <main className="mx-auto hidden w-full max-w-[1100px] flex-col gap-6 px-8 py-8 lg:flex">
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0A0F24] via-[#0B132B] to-[#1E40AF] p-8 text-white shadow-xl">
          <div className="pointer-events-none absolute -right-20 -top-24 h-80 w-80 rounded-full bg-primary-container/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 left-1/3 h-64 w-64 rounded-full bg-[#F7931A]/10 blur-3xl" />
          <div className="relative z-10 grid grid-cols-[1fr_420px] items-center gap-10">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <Avatar first={user.firstName} last={user.lastName} size="lg" />
                <div>
                  <p className="font-headline-lg text-headline-lg tracking-tight"><Tc>Bonjour,</Tc> <span className="font-accent text-[1.15em] font-normal italic tracking-normal text-[#b7c4ff]">{user.firstName}</span></p>
                  <p className="font-body-md text-body-md text-surface-variant/80">
                    {country} · {user.demo ? t('Compte de démonstration') : 'Diaspora'}
                  </p>
                </div>
              </div>
              <p className="max-w-md font-body-lg text-body-lg text-surface-variant">
                {totals.waitingDecision > 0
                  ? t(totals.waitingDecision > 1 ? '{n} preuves attendent votre décision. Rien n\'est payé sans votre accord.' : '{n} preuve attend votre décision. Rien n\'est payé sans votre accord.', { n: totals.waitingDecision })
                  : t('Vos fonds restent en séquestre et ne sont libérés que sur preuve.')}
              </p>
              <p className="flex items-center gap-1.5 font-label-md text-label-md text-surface-variant/80">
                <Icon name="lock" size={16} /> <Tc>{INSTANCE[instanceMode()].custody}</Tc>
              </p>
            </div>
            <BalanceCard escrowCents={totals.escrow} rate={usdXof} />
          </div>
        </section>

        <div className="grid grid-cols-4 gap-4">
          <Kpi icon="folder_special" label={t('Projets en cours')} value={String(totals.projects)} tone="text-primary" />
          <Kpi icon="payments" label={t('Étapes payées')} value={`${totals.stepsPaid}/${totals.stepsTotal}`} tone="text-on-surface" />
          <Kpi icon="pending_actions" label={t('À décider')} value={String(totals.waitingDecision)} tone={totals.waitingDecision > 0 ? 'text-[#B45309]' : 'text-on-surface'} highlight={totals.waitingDecision > 0} />
          <Kpi icon="currency_bitcoin" label={t('Ancrages Bitcoin')} value={anchorsLabel} tone="text-[#C26700]" />
        </div>

        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="font-title-lg text-title-lg text-on-surface"><Tc>Vos projets</Tc></h2>
            <Link href="/app/projets" className="flex items-center font-label-md text-label-md font-semibold text-primary hover:underline">
              <Tc>Tout voir</Tc> <Icon name="chevron_right" size={16} />
            </Link>
          </div>
          {summaries.length === 0 ? <NoProject /> : summaries.slice(0, 2).map((s) => <ProjectCardWide key={s.project.id} summary={s} usdXof={usdXof} />)}
        </section>

        <div className="grid grid-cols-[1fr_320px] items-start gap-6">
          <section className="flex min-w-0 flex-col gap-3">
            <h2 className="font-title-lg text-title-lg text-on-surface"><Tc>Activité récente</Tc></h2>
            <ActivityList items={activity} empty="Votre activité apparaîtra ici dès le premier versement." />
          </section>

          <aside className="flex flex-col gap-4">
            <InstallCard />
            {teams.length > 0 && (
              <section className="rounded-3xl bg-surface-container-lowest p-5 shadow-sm">
                <h2 className="mb-3 font-title-md text-title-md text-on-surface"><Tc>Équipes sur place</Tc></h2>
                <ul className="flex flex-col gap-1">
                  {teams.map((p) => {
                    const [first, ...rest] = p.managerName.split(' ');
                    const waiting = p.steps.some((s) => s.status === 'active' || s.status === 'rejected');
                    return (
                      <li key={p.id}>
                        <Link href={`/app/projets/${p.id}`} className="flex items-center gap-3 rounded-2xl p-2 transition hover:bg-surface-container-low">
                          <Avatar first={first} last={rest.join(' ')} size="sm" status={waiting ? 'pending' : 'online'} />
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate font-label-lg text-label-lg text-on-surface">{p.managerName}</span>
                            <span className="truncate font-body-sm text-body-sm text-on-surface-variant">
                              {p.city} · {waiting ? t('preuve attendue') : t('à jour')}
                            </span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
            <Link href="/verifier" className="flex items-center gap-3 rounded-3xl bg-surface-container-lowest p-5 shadow-sm transition hover:shadow-md">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#FFEDD5] text-[#C26700]">
                <Icon name="fact_check" size={22} />
              </span>
              <span className="min-w-0">
                <span className="block font-title-md text-title-md"><Tc>Vérifier un dossier</Tc></span>
                <span className="block font-body-sm text-body-sm text-on-surface-variant"><Tc>Sans compte, sans nous faire confiance.</Tc></span>
              </span>
            </Link>
          </aside>
        </div>
      </main>
    </>
  );
}

function Stat({ label, value, caption, tone }: { label: string; value: string; caption: string; tone: string }) {
  return (
    <div className="flex flex-col items-center rounded-2xl bg-surface-container-lowest p-3 text-center shadow-sm">
      <span className="font-label-sm text-label-sm text-on-surface-variant">{label}</span>
      <span className={`mt-0.5 font-headline-md text-headline-md font-bold ${tone}`}>{value}</span>
      <span className="font-label-sm text-label-sm text-on-surface-variant/80">{caption}</span>
    </div>
  );
}

function Kpi({ icon, label, value, tone, highlight = false }: { icon: string; label: string; value: string; tone: string; highlight?: boolean }) {
  return (
    <div className={`flex items-center gap-4 rounded-3xl p-5 shadow-sm ${highlight ? 'bg-tertiary-fixed' : 'bg-surface-container-lowest'}`}>
      <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${highlight ? 'bg-white/60 text-[#B45309]' : 'bg-primary/10 text-primary'}`}>
        <Icon name={icon} size={24} />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className={`font-headline-lg text-headline-lg font-bold leading-none ${tone}`}>{value}</span>
        <span className="mt-1 truncate font-label-md text-label-md text-on-surface-variant">{label}</span>
      </span>
    </div>
  );
}

function NoProject() {
  return (
    <div className="rounded-2xl bg-surface-container-low p-5 text-center">
      <p className="mb-1 font-title-md text-title-md"><Tc>Aucun projet pour le moment</Tc></p>
      <p className="mb-4 font-body-md text-body-md text-on-surface-variant"><Tc>Créez votre premier projet : vos fonds ne partent qu&apos;après preuve.</Tc></p>
      <Link href="/app/projets/nouveau" className="inline-flex h-11 items-center gap-2 rounded-full bg-primary-container px-6 font-label-lg text-label-lg font-bold text-on-primary shadow-lg shadow-primary/25">
        <Icon name="add" size={20} /> <Tc>Nouveau projet</Tc>
      </Link>
      {getConfig().minBudgetUsd * 100 <= QUICK_TRIAL_BUDGET_CENTS && (
        <Link href="/app/projets/nouveau?essai=1" className="mt-3 inline-flex h-11 items-center gap-2 rounded-full bg-surface-container px-6 font-label-lg text-label-lg font-semibold text-primary hover:bg-surface-container-high">
          <Icon name="bolt" size={20} /> <Tc>Essai rapide</Tc> · {formatUsdShort(QUICK_TRIAL_BUDGET_CENTS)}
        </Link>
      )}
    </div>
  );
}
