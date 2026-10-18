import { redirect } from 'next/navigation';
import { NewProjectWizard } from '@/components/app/NewProjectWizard';
import { getSessionUser } from '@/server/auth';
import { getConfig } from '@/server/config';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Nouveau projet' };

export default async function NewProject() {
  const user = await getSessionUser();
  if (!user) redirect('/app/bienvenue');
  return <NewProjectWizard usdXof={getConfig().usdXof} />;
}
