import { redirect } from 'next/navigation';
import { ActivityList } from '@/components/app/ActivityList';
import { FlowHeader } from '@/components/app/AppHeader';
import { Icon } from '@/components/ui/Icon';
import { getSessionUser } from '@/server/auth';
import { readDb } from '@/server/db';
import { reconcile } from '@/server/services';
import { buildActivity } from '@/server/views';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Notifications' };

export default async function Notifications() {
  const user = await getSessionUser();
  if (!user) redirect('/app/bienvenue');
  await reconcile();
  const db = await readDb();
  const items = buildActivity(db, user.id, 40);
  const waiting = items.filter((i) => i.kind === 'proof_pending');
  const rest = items.filter((i) => i.kind !== 'proof_pending');

  return (
    <main className="min-h-screen pb-12 lg:mx-auto lg:w-full lg:max-w-[760px] lg:px-8 lg:pt-8">
      <FlowHeader title="Notifications" backHref="/app/accueil" />
      <div className="flex flex-col gap-space-lg px-space-md pt-space-md lg:px-0 lg:pt-0">
        {waiting.length > 0 && (
          <section>
            <h2 className="mb-3 flex items-center gap-2 font-title-md text-title-md">
              <Icon name="pending_actions" size={20} className="text-[#B45309]" />À traiter
            </h2>
            <ActivityList items={waiting} />
          </section>
        )}
        <section>
          <h2 className="mb-3 font-title-md text-title-md">Historique</h2>
          <ActivityList items={rest} empty="Rien à signaler pour l'instant." />
        </section>
        <p className="text-center font-label-sm text-label-sm text-on-surface-variant">
          Les alertes apparaissent ici, dans l&apos;application. Les notifications sur le téléphone ne sont pas encore proposées.
        </p>
      </div>
    </main>
  );
}
