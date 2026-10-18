import Link from 'next/link';
import { AppHeader } from '@/components/app/AppHeader';
import { ProjectCard } from '@/components/app/ProjectCard';
import { Icon } from '@/components/ui/Icon';
import { SECTORS } from '@/lib/templates';
import type { Sector } from '@/lib/types';
import { getSessionUser } from '@/server/auth';
import { readDb } from '@/server/db';
import { reconcile } from '@/server/services';
import { userProjects } from '@/server/views';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Projets' };

const FILTERS: { id: 'all' | Sector; label: string; icon?: string }[] = [
  { id: 'all', label: 'Tous' },
  { id: 'immobilier', label: SECTORS.immobilier.label, icon: SECTORS.immobilier.icon },
  { id: 'agricole', label: SECTORS.agricole.label, icon: SECTORS.agricole.icon },
  { id: 'commerce', label: SECTORS.commerce.label, icon: SECTORS.commerce.icon },
];

export default async function Projects({ searchParams }: { searchParams: { secteur?: string } }) {
  const user = (await getSessionUser())!;
  await reconcile();
  const db = await readDb();
  const all = userProjects(db, user.id);
  const active = (FILTERS.find((f) => f.id === searchParams.secteur)?.id ?? 'all') as 'all' | Sector;
  const list = active === 'all' ? all : all.filter((s) => s.project.sector === active);

  return (
    <>
      <AppHeader title="Projets" user={user} />
      <main className="px-space-md pb-28 pt-20">
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
                href={f.id === 'all' ? '/app/projets' : `/app/projets?secteur=${f.id}`}
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
          <div className="rounded-3xl bg-surface-container-low p-space-lg text-center">
            <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Icon name="folder_open" size={28} />
            </span>
            <p className="mb-1 font-title-lg text-title-lg">{all.length === 0 ? 'Aucun projet pour le moment' : 'Aucun projet dans ce secteur'}</p>
            <p className="mb-space-md font-body-md text-body-md text-on-surface-variant">Décrivez ce que vous voulez construire, cultiver ou vendre. Chaque paiement sera lié à une preuve.</p>
            <Link href="/app/projets/nouveau" className="inline-flex h-12 items-center gap-2 rounded-full bg-primary-container px-6 font-label-lg text-label-lg font-bold text-on-primary shadow-lg shadow-primary/25">
              <Icon name="add" size={20} /> Nouveau projet
            </Link>
          </div>
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
    </>
  );
}
