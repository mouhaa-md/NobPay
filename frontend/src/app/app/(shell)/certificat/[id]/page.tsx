import { notFound, redirect } from 'next/navigation';
import { AnchorCard } from '@/components/app/AnchorCard';
import { AnchorNowButton } from '@/components/app/AnchorNowButton';
import { FlowHeader } from '@/components/app/AppHeader';
import { Icon } from '@/components/ui/Icon';
import { LEDGER_LABEL, shortHash } from '@/lib/ledgerLabels';
import { formatDateTime } from '@/lib/money';
import { getSessionUser } from '@/server/auth';
import { toView } from '@/server/anchors';
import { readDb } from '@/server/db';
import { findProject } from '@/server/domain';
import { ledgerFor, verifyChain } from '@/server/ledger';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Certificat de preuve' };

export default async function Certificate({ params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) redirect('/app/bienvenue');
  const db = await readDb();
  const project = findProject(db, params.id);
  if (!project || project.ownerId !== user.id) notFound();

  const events = ledgerFor(db, project.id);
  const chain = verifyChain(events);
  const anchors = db.anchors.filter((a) => a.projectId === project.id).sort((a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt));
  const covered = Math.max(0, ...anchors.filter((a) => a.status !== 'failed').map((a) => a.upToSeq));
  const confirmedUpTo = Math.max(0, ...anchors.filter((a) => a.status === 'confirmed').map((a) => a.upToSeq));

  return (
    <main className="min-h-screen pb-16 lg:mx-auto lg:w-full lg:max-w-[1100px] lg:px-8 lg:pt-8">
      <FlowHeader title="Certificat de preuve" backHref={`/app/projets/${project.id}`} />
      <div className="flex flex-col gap-space-lg px-space-md pt-space-md lg:grid lg:grid-cols-2 lg:grid-rows-[auto_auto_auto_auto_1fr] lg:items-start lg:gap-x-8 lg:gap-y-6 lg:px-0 lg:pt-0">
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0A0F24] via-[#0B132B] to-[#1E40AF] p-5 text-white shadow-xl lg:col-span-2 lg:p-8">
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-[#F7931A]/25 blur-3xl" />
          <p className="relative font-label-sm text-label-sm uppercase tracking-wider text-surface-variant">{project.name}</p>
          <p className="relative mt-1 flex items-center gap-2 font-headline-md text-headline-md font-bold">
            <Icon name={chain.ok ? 'verified_user' : 'gpp_bad'} filled className={chain.ok ? 'text-[#4ADE80]' : 'text-[#F87171]'} />
            {chain.ok ? 'Registre intact' : `Registre altéré (événement ${chain.brokenAt})`}
          </p>
          <p className="relative mt-2 font-body-sm text-body-sm text-surface-variant">
            {events.length} événement{events.length > 1 ? 's' : ''} enchaîné{events.length > 1 ? 's' : ''}. Chaque ligne contient l&apos;empreinte de la précédente : en changer une seule casse toute la suite.
          </p>
          <p className="relative mt-3 font-mono text-[11px] text-surface-variant/80" title={chain.headHash}>
            Empreinte de tête · {shortHash(chain.headHash, 16, 10)}
          </p>
          <p className="relative mt-3 flex items-center gap-2 font-label-md text-label-md">
            <Icon name="currency_bitcoin" size={18} className="text-[#F7931A]" />
            {confirmedUpTo > 0 ? `Ancré sur Bitcoin jusqu'à l'événement ${confirmedUpTo}` : covered > 0 ? 'Ancrage envoyé, en attente de Bitcoin' : 'Pas encore ancré sur Bitcoin'}
          </p>
        </section>

        <section className="flex flex-col gap-3 lg:col-start-1">
          <h2 className="font-title-md text-title-md">Pourquoi Bitcoin ?</h2>
          <p className="font-body-md text-body-md leading-relaxed text-on-surface-variant">
            Un registre tenu par NobPay seul pourrait être réécrit. Alors nous publions son empreinte (une suite de 64 caractères) dans la blockchain Bitcoin, avec le standard ouvert OpenTimestamps. Le contenu de votre dossier ne quitte jamais l&apos;application : seule l&apos;empreinte part. N&apos;importe qui peut ensuite contrôler le dossier, sans compte et sans faire confiance à NobPay.
          </p>
        </section>

        <div className="lg:col-start-1">
          <AnchorNowButton projectId={project.id} upToDate={covered >= events.length} />
        </div>

        {anchors.length > 0 && (
          <section className="flex flex-col gap-3 lg:col-start-1">
            <h2 className="font-title-md text-title-md">Ancrages</h2>
            {anchors.map((a, i) => (
              <AnchorCard key={a.id} initial={toView(a)} index={anchors.length - i} />
            ))}
          </section>
        )}

        <section className="lg:col-start-2 lg:row-span-4 lg:row-start-2">
          <h2 className="mb-3 font-title-md text-title-md">Registre</h2>
          <ol className="flex flex-col divide-y divide-outline-variant/40 overflow-hidden rounded-2xl bg-surface-container-lowest shadow-sm ring-1 ring-outline-variant/30">
            {events.map((e) => {
              const meta = LEDGER_LABEL[e.type];
              return (
                <li key={e.id}>
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-center gap-3 px-3.5 py-3">
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${meta.tone}`}>
                        <Icon name={meta.icon} size={17} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-label-lg text-label-lg">{meta.label}</span>
                        <span className="block font-label-sm text-label-sm text-on-surface-variant">
                          N° {e.seq} · {formatDateTime(e.at)}
                        </span>
                      </span>
                      {e.seq <= confirmedUpTo ? (
                        <Icon name="currency_bitcoin" size={18} className="text-[#F7931A]" />
                      ) : e.seq <= covered ? (
                        <Icon name="hourglass_top" size={18} className="text-on-surface-variant" />
                      ) : null}
                      <Icon name="expand_more" size={20} className="text-on-surface-variant transition-transform group-open:rotate-180" />
                    </summary>
                    <div className="bg-surface-container-low px-3.5 py-3 font-mono text-[11px] leading-relaxed text-on-surface-variant">
                      <p className="break-all">empreinte : {e.hash}</p>
                      <p className="break-all">précédente : {e.prevHash}</p>
                      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all">{JSON.stringify(e.data, null, 2)}</pre>
                    </div>
                  </details>
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    </main>
  );
}
