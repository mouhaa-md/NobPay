import { requireUser } from '@/server/auth';
import { getConfig } from '@/server/config';
import { resetDb } from '@/server/db';
import { HttpError, respond } from '@/server/http';

export const dynamic = 'force-dynamic';

/** Puts the demonstration data back. Only in mock mode, and only for the demo account. */
export async function POST() {
  return respond(async () => {
    if (getConfig().mode !== 'mock') throw new HttpError(403, 'Réinitialisation désactivée en mode sandbox');
    const user = await requireUser();
    if (!user.demo) throw new HttpError(403, 'Seul le compte de démonstration peut réinitialiser les données');
    await resetDb();
    return { ok: true };
  });
}
