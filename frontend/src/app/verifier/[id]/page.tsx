import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { PageQr } from '@/components/verify/PageQr';
import { VerifyAnchor } from '@/components/verify/VerifyAnchor';
import { formatDateTime } from '@/lib/money';
import { toView } from '@/server/anchors';
import { readDb } from '@/server/db';
import { Tc } from '@/lib/i18n/client';
import { getT } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t('Vérification'), robots: { index: false, follow: false } };
}

export default async function VerifyOne(props: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const params = await props.params;
  const db = await readDb();
  const anchor = db.anchors.find((a) => a.id === params.id);
  if (!anchor) notFound();
  const project = db.projects.find((p) => p.id === anchor.projectId);

  return (
    <div className="flex flex-col gap-space-lg">
      <section>
        <p className="mb-1 flex items-center gap-1.5 font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
          <Icon name="verified_user" size={16} /> <Tc>Vérification publique</Tc>
        </p>
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile font-bold tracking-tight md:text-[34px] md:leading-[40px]">{project?.name ?? t('Dossier NobPay')}</h1>
        <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
          <Tc>Ancrage du</Tc> {formatDateTime(anchor.submittedAt, t)} <Tc>· couvre les événements 1 à</Tc> {anchor.upToSeq}
        </p>
      </section>
      <VerifyAnchor initial={toView(anchor)} />
      <PageQr />
    </div>
  );
}
