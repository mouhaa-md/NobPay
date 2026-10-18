import { redirect } from 'next/navigation';
import { AppFrame } from '@/components/app/AppFrame';
import { isAdmin } from '@/server/admin';
import { getSessionUser } from '@/server/auth';
import { getConfig } from '@/server/config';

export const dynamic = 'force-dynamic';

/** Every signed-in screen: session guard, then the phone column on small screens or the sidebar layout on a computer. */
export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect('/app/bienvenue');
  return (
    <AppFrame user={{ firstName: user.firstName, lastName: user.lastName, country: user.country, demo: !!user.demo, admin: isAdmin(user) }} mode={getConfig().mode}>
      {children}
    </AppFrame>
  );
}
