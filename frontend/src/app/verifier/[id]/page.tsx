import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { PageQr } from '@/components/verify/PageQr';
import { VerifyAnchor } from '@/components/verify/VerifyAnchor';
import { formatDateTime } from '@/lib/money';
import { toView } from '@/server/anchors';
import { readDb } from '@/server/db';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Vérification', robots: { index: false, follow: false } };

export default async function VerifyOne({ params }: { params: { id: string } }) {
  const db = await readDb();
  const anchor = db.anchors.find((a) => a.id === params.id);
  if (!anchor) notFound();
  const project = db.projects.find((p) => p.id === anchor.projectId);

  return (
    <div className="flex flex-col gap-space-lg">
      <section>
        <p className="mb-1 flex items-center gap-1.5 font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
          <Icon name="verified_user" size={16} /> Vérification publique
        </p>
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile font-bold tracking-tight md:text-[34px] md:leading-[40px]">{project?.name ?? 'Dossier NobPay'}</h1>
        <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
          Ancrage du {formatDateTime(anchor.submittedAt)} · couvre les événements 1 à {anchor.upToSeq}
        </p>
      </section>
      <VerifyAnchor initial={toView(anchor)} />
      <PageQr />
    </div>
  );
}
