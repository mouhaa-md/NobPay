import Link from 'next/link';
import { AppHeader } from '@/components/app/AppHeader';
import { ProjectCard } from '@/components/app/ProjectCard';
import { ProjectCardWide } from '@/components/app/ProjectCardWide';
import { Icon } from '@/components/ui/Icon';
import { formatUsdShort } from '@/lib/money';
import { SECTORS } from '@/lib/templates';
import type { Sector } from '@/lib/types';
import { getSessionUser } from '@/server/auth';
import { getConfig } from '@/server/config';
import { readDb } from '@/server/db';
import { totalsOf, userProjects } from '@/server/views';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Projets' };

const FILTERS: { id: 'all' | Sector; label: string; icon?: string }[] = [
  { id: 'all', label: 'Tous' },
  { id: 'immobilier', label: SECTORS.immobilier.label, icon: SECTORS.immobilier.icon },
  { id: 'agricole', label: SECTORS.agricole.label, icon: SECTORS.agricole.icon },
  { id: 'commerce', label: SECTORS.commerce.label, icon: SECTORS.commerce.icon },
];

/** lower case, no accents: « thies » finds « Thiès » */
const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default async function Projects({ searchParams }: { searchParams: { secteur?: string; q?: string } }) {
  const user = (await getSessionUser())!;
  const db = await readDb();
  const all = userProjects(db, user.id);
  const totals = totalsOf(db, all);
  const { usdXof } = getConfig();
  const active = (FILTERS.find((f) => f.id === searchParams.secteur)?.id ?? 'all') as 'all' | Sector;
  const q = (searchParams.q ?? '').trim();
  const list = all
    .filter((s) => active === 'all' || s.project.sector === active)
    .filter((s) => !q || plain(`${s.project.name} ${s.project.city} ${s.project.managerName}`).includes(plain(q)));

  const href = (sector: 'all' | Sector) => {
    const params = new URLSearchParams();
    if (sector !== 'all') params.set('secteur', sector);
    if (q) params.set('q', q);
    const qs = params.toString();
    return qs ? `/app/projets?${qs}` : '/app/projets';
  };

  return (
    <>
      <AppHeader title="Projets" user={user} />

      {/* ---------- phone ---------- */}
      <main className="px-space-md pb-28 pt-20 lg:hidden">
        <div className="mb-space-md flex items-center justify-between">
          <p className="font-body-md text-body-md text-on-surface-variant">
            {all.length} projet{all.length > 1 ? 's' : ''} · une étape payée = une preuve validée
          </p>
        </div>

        <nav aria-label="Filtrer par secteur" className="-mx-space-md mb-space-md flex gap-2 overflow-x-auto px-space-md pb-1">
          {FILTERS.map((f) => {
            const on = f.id === active;
            const count = f.id === 'all' ? all.length : all.filter((s) => s.project.sector === f.id).length;
            return (
              <Link
                key={f.id}
                href={href(f.id)}
                aria-current={on ? 'true' : undefined}
                className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 font-label-md text-label-md transition ${on ? 'bg-primary-container text-on-primary shadow-md' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'}`}
              >
                {f.icon && <Icon name={f.icon} size={16} />}
                {f.label}
                <span className={`rounded-full px-1.5 text-label-sm ${on ? 'bg-white/20' : 'bg-surface-container-high'}`}>{count}</span>
              </Link>
            );
          })}
        </nav>

        {list.length === 0 ? (
          <Empty hasProjects={all.length > 0} />
        ) : (
          <div className="flex flex-col gap-space-md">
            {list.map((s) => (
              <ProjectCard key={s.project.id} summary={s} />
            ))}
            <Link href="/app/projets/nouveau" className="flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-outline-variant/70 p-space-md font-label-lg text-label-lg text-primary transition hover:bg-surface-container-low">
              <Icon name="add_circle" size={22} /> Nouveau projet
            </Link>
          </div>
        )}
      </main>

      {/* ---------- computer ---------- */}
      <main className="mx-auto hidden w-full max-w-[1100px] flex-col gap-6 px-8 py-8 lg:flex">
        <section className="relative overflow-hidden rounded-3xl bg-surface-container-lowest p-8 shadow-md">
          <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-gradient-to-br from-primary/10 via-primary-container/5 to-transparent blur-3xl" />
          <div className="relative z-10 flex items-center justify-between gap-8">
            <div className="flex max-w-2xl flex-col gap-2">
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-secondary-container px-3 py-1 font-label-sm text-label-sm uppercase tracking-wider text-on-secondary-container">
                <Icon name="lock" size={14} /> Fonds en séquestre, libérés sur preuve
              </span>
              <h2 className="font-headline-lg text-headline-lg tracking-tight text-on-surface">Projets de la diaspora</h2>
              <p className="font-body-md text-body-md text-on-surface-variant">Suivi des chantiers, exploitations agricoles et commerces que vous financez, étape par étape.</p>
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <Pill icon="folder_special">
                  <strong className="font-title-md text-title-md">{totals.projects}</strong> projet{totals.projects > 1 ? 's' : ''}
                </Pill>
                <Pill icon="account_balance">
                  <strong className="font-title-md text-title-md">{formatUsdShort(totals.escrow)}</strong> en séquestre
                </Pill>
                <Pill icon="currency_bitcoin" tone="bg-tertiary-fixed text-on-tertiary-fixed">
                  {totals.anchorsTotal === 0 ? 'Aucun ancrage Bitcoin pour le moment' : `${totals.anchorsConfirmed} sur ${totals.anchorsTotal} ancrage${totals.anchorsTotal > 1 ? 's' : ''} confirmé${totals.anchorsConfirmed > 1 ? 's' : ''} sur Bitcoin`}
                </Pill>
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-3">
              <Link href="/app/projets/nouveau" className="inline-flex h-12 items-center gap-2 rounded-full bg-primary-container px-6 font-label-lg text-label-lg text-on-primary shadow-lg shadow-primary-container/20 transition hover:bg-primary active:scale-95">
                <Icon name="add_circle" size={20} /> Créer un projet
              </Link>
              <span className="flex items-center gap-1.5 font-body-sm text-body-sm text-on-surface-variant">
                <Icon name="verified_user" size={16} className="text-primary" /> Chaque paiement exige une preuve que vous validez
              </span>
            </div>
          </div>
        </section>

        <div className="flex items-center justify-between gap-4">
          <nav aria-label="Filtrer par secteur" className="flex items-center gap-2">
            {FILTERS.map((f) => {
              const on = f.id === active;
              const count = f.id === 'all' ? all.length : all.filter((s) => s.project.sector === f.id).length;
              return (
                <Link
                  key={f.id}
                  href={href(f.id)}
                  aria-current={on ? 'true' : undefined}
                  className={`inline-flex h-10 items-center gap-1.5 rounded-full px-4 font-label-md text-label-md shadow-sm transition active:scale-95 ${on ? 'bg-primary text-on-primary' : 'bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container hover:text-on-surface'}`}
                >
                  {f.icon && <Icon name={f.icon} size={16} />}
                  {f.id === 'all' ? 'Tous les projets' : f.label}
                  <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold ${on ? 'bg-primary-fixed text-on-primary-fixed' : 'bg-surface-container text-on-surface-variant'}`}>{count}</span>
                </Link>
              );
            })}
          </nav>
          <form action="/app/projets" method="get" className="relative w-72" role="search">
            {active !== 'all' && <input type="hidden" name="secteur" value={active} />}
            <Icon name="search" size={20} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-outline" />
            <input
              name="q"
              defaultValue={q}
              placeholder="Rechercher un projet, une ville…"
              aria-label="Rechercher un projet"
              className="h-10 w-full rounded-full bg-surface-container-lowest pl-10 pr-4 font-body-sm text-body-sm text-on-surface shadow-sm outline-none placeholder:text-outline focus:ring-2 focus:ring-primary/20"
            />
          </form>
        </div>

        {list.length === 0 ? (
          <Empty hasProjects={all.length > 0} />
        ) : (
          <div className="flex flex-col gap-6">
            {list.map((s) => (
              <ProjectCardWide key={s.project.id} summary={s} usdXof={usdXof} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}

function Pill({ icon, tone = 'bg-surface-container text-on-surface', children }: { icon: string; tone?: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 font-label-md text-label-md ${tone}`}>
      <Icon name={icon} size={18} className="text-primary" />
      <span>{children}</span>
    </span>
  );
}

function Empty({ hasProjects }: { hasProjects: boolean }) {
  return (
    <div className="rounded-3xl bg-surface-container-low p-space-lg text-center lg:p-12">
      <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon name="folder_open" size={28} />
      </span>
      <p className="mb-1 font-title-lg text-title-lg">{hasProjects ? 'Aucun projet ne correspond' : 'Aucun projet pour le moment'}</p>
      <p className="mb-space-md font-body-md text-body-md text-on-surface-variant">
        {hasProjects ? 'Essayez un autre secteur ou une autre recherche.' : 'Décrivez ce que vous voulez construire, cultiver ou vendre. Chaque paiement sera lié à une preuve.'}
      </p>
      {!hasProjects && (
        <Link href="/app/projets/nouveau" className="inline-flex h-12 items-center gap-2 rounded-full bg-primary-container px-6 font-label-lg text-label-lg font-bold text-on-primary shadow-lg shadow-primary/25">
          <Icon name="add" size={20} /> Nouveau projet
        </Link>
      )}
    </div>
  );
}
