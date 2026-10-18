import { notFound, redirect } from 'next/navigation';
import { FundingFlow } from '@/components/app/FundingFlow';
import { getSessionUser } from '@/server/auth';
import { getConfig } from '@/server/config';
import { readDb } from '@/server/db';
import { findProject } from '@/server/domain';
import { getGateway } from '@/server/bitnob';
import { summarize } from '@/server/views';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Financer' };

export default async function Fund({ params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) redirect('/app/bienvenue');
  const db = await readDb();
  const project = findProject(db, params.id);
  if (!project || project.ownerId !== user.id) notFound();

  const s = summarize(db, project);
  const { mode, usdXof, btcUsd: fallbackBtcUsd } = getConfig();
  let btcUsd = fallbackBtcUsd;
  try {
    btcUsd = await getGateway().btcUsd();
  } catch {
    /* keep the configured indicative rate */
  }

  // Quick amounts: what the next locked/active step still lacks, and what is left to fund.
  const suggestions: { label: string; cents: number }[] = [];
  const nextStep = project.steps.find((st) => st.status !== 'paid');
  if (nextStep && nextStep.amountCents > s.escrow) suggestions.push({ label: `Étape ${nextStep.index}`, cents: nextStep.amountCents - s.escrow });
  const remaining = project.budgetCents - s.funded;
  if (remaining > 0 && !suggestions.some((x) => x.cents === remaining)) suggestions.push({ label: 'Reste du budget', cents: remaining });

  return (
    <FundingFlow
      projectId={project.id}
      projectName={project.name}
      mode={mode}
      btcUsd={btcUsd}
      usdXof={usdXof}
      suggestions={suggestions.filter((x) => x.cents >= 500)}
      steps={project.steps.map((st) => ({ id: st.id, index: st.index, title: st.title }))}
    />
  );
}
