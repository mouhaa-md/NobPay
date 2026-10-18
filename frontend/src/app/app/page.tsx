import { redirect } from 'next/navigation';
import { getSessionUser } from '@/server/auth';

export const dynamic = 'force-dynamic';

export default async function AppIndex() {
  redirect((await getSessionUser()) ? '/app/accueil' : '/app/bienvenue');
}
