import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { DesktopTopbar } from '@/components/app/DesktopTopbar';
import { NewProjectWizard } from '@/components/app/NewProjectWizard';
import { getSessionUser } from '@/server/auth';
import { getConfig, isRealBitcoin } from '@/server/config';
import { getT } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t('Nouveau projet') };
}

export default async function NewProject(props: { searchParams: Promise<{ essai?: string }> }) {
  const t = await getT();
  const { essai } = await props.searchParams;
  const user = await getSessionUser();
  if (!user) redirect('/app/bienvenue');
  return (
    <>
      <DesktopTopbar title={t('Nouveau projet')} backHref="/app/projets" />
      <NewProjectWizard usdXof={getConfig().usdXof} maxStepUsd={getConfig().maxStepUsd} minBudgetUsd={getConfig().minBudgetUsd} real={isRealBitcoin()} autoTrial={essai === '1'} />
    </>
  );
}
