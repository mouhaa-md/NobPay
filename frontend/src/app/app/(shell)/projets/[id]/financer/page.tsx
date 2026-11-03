import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { DesktopTopbar } from '@/components/app/DesktopTopbar';
import { FundingFlow } from '@/components/app/FundingFlow';
import { getSessionUser } from '@/server/auth';
import { getConfig } from '@/server/config';
import { currentUsdXof } from '@/server/lightning/price';
import { readDb } from '@/server/db';
import { findProject } from '@/server/domain';
import { getGateway } from '@/server/bitnob';
import { summarize } from '@/server/views';
import { getT } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t('Financer') };
}

export default async function Fund(props: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const params = await props.params;
  const user = await getSessionUser();
  if (!user) redirect('/app/bienvenue');
  const db = await readDb();
  const project = findProject(db, params.id);
  if (!project || project.ownerId !== user.id) notFound();

  const s = summarize(db, project);
  const { mode, btcUsd: fallbackBtcUsd, allowDemo } = getConfig();
  const usdXof = currentUsdXof();
  let btcUsd = fallbackBtcUsd;
  try {
    btcUsd = await getGateway().btcUsd();
  } catch {
    /* keep the configured indicative rate */
  }

  // Quick amounts: what the next locked/active step still lacks, and what is left to fund.
  const suggestions: { label: string; cents: number }[] = [];
  const nextStep = project.steps.find((st) => st.status !== 'paid');
  if (nextStep && nextStep.amountCents > s.escrow) suggestions.push({ label: t('Étape {n}', { n: nextStep.index }), cents: nextStep.amountCents - s.escrow });
  const remaining = project.budgetCents - s.funded;
  if (remaining > 0 && !suggestions.some((x) => x.cents === remaining)) suggestions.push({ label: t('Reste du budget'), cents: remaining });

  return (
    <>
      <DesktopTopbar title={t('Financer un projet')} backHref={`/app/projets/${project.id}`} />
      <FundingFlow
        projectId={project.id}
        projectName={project.name}
        mode={mode}
        allowDemo={allowDemo}
        real={getConfig().lightning.rail === 'nwc'}
        btcUsd={btcUsd}
        usdXof={usdXof}
        suggestions={suggestions.filter((x) => x.cents >= 500)}
        steps={project.steps.map((st) => ({ id: st.id, index: st.index, title: st.title }))}
      />
    </>
  );
}
