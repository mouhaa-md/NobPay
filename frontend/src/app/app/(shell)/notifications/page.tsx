import { redirect } from 'next/navigation';
import { ActivityList } from '@/components/app/ActivityList';
import { FlowHeader } from '@/components/app/AppHeader';
import { Icon } from '@/components/ui/Icon';
import { getSessionUser } from '@/server/auth';
import { readDb } from '@/server/db';
import { buildActivity } from '@/server/views';
import { Tc } from '@/lib/i18n/client';
import { getT } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Notifications' };

export default async function Notifications() {
  const t = await getT();
  const user = await getSessionUser();
  if (!user) redirect('/app/bienvenue');
  const db = await readDb();
  const items = buildActivity(db, user.id, 40, t);
  const waiting = items.filter((i) => i.kind === 'proof_pending');
  const rest = items.filter((i) => i.kind !== 'proof_pending');

  return (
    <main id="contenu" className="min-h-screen pb-12 lg:mx-auto lg:w-full lg:max-w-[760px] lg:px-8 lg:pt-8">
      <FlowHeader title={t('Notifications')} backHref="/app/accueil" />
      <div className="flex flex-col gap-space-lg px-space-md pt-space-md lg:px-0 lg:pt-0">
        {waiting.length > 0 && (
          <section>
            <h2 className="mb-3 flex items-center gap-2 font-title-md text-title-md">
              <Icon name="pending_actions" size={20} className="text-[#B45309]" /><Tc>À traiter</Tc>
            </h2>
            <ActivityList items={waiting} />
          </section>
        )}
        <section>
          <h2 className="mb-3 font-title-md text-title-md"><Tc>Historique</Tc></h2>
          <ActivityList items={rest} empty="Rien à signaler pour l'instant." />
        </section>
        <p className="text-center font-label-sm text-label-sm text-on-surface-variant">
          <Tc>Les alertes apparaissent ici, dans l&apos;application. Les notifications sur le téléphone ne sont pas encore proposées.</Tc>
        </p>
      </div>
    </main>
  );
}
