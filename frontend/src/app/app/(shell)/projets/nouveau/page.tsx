import { redirect } from 'next/navigation';
import { DesktopTopbar } from '@/components/app/DesktopTopbar';
import { NewProjectWizard } from '@/components/app/NewProjectWizard';
import { getSessionUser } from '@/server/auth';
import { getConfig } from '@/server/config';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Nouveau projet' };

export default async function NewProject() {
  const user = await getSessionUser();
  if (!user) redirect('/app/bienvenue');
  return (
    <>
      <DesktopTopbar title="Nouveau projet" backHref="/app/projets" />
      <NewProjectWizard usdXof={getConfig().usdXof} />
    </>
  );
}
