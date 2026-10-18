import { redirect } from 'next/navigation';
import { BottomNav } from '@/components/app/BottomNav';
import { getSessionUser } from '@/server/auth';

export const dynamic = 'force-dynamic';

/** All tab screens require a session; the title is rendered by each page through <AppHeader>. */
export default async function TabsLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect('/app/bienvenue');
  return (
    <>
      {children}
      <BottomNav />
    </>
  );
}
