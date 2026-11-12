import { requireUser } from '@/server/auth';
import { getConfig } from '@/server/config';
import { resetDb } from '@/server/db';
import { HttpError, respond } from '@/server/http';
import { clientIp, enforce, LIMITS } from '@/server/rateLimit';

export const dynamic = 'force-dynamic';

/** Puts the demonstration data back. Only in mock mode with demo allowed, and only for the demo account. */
export async function POST(request: Request) {
  return respond(async () => {
    if (getConfig().mode !== 'mock') throw new HttpError(403, 'Réinitialisation désactivée en mode sandbox');
    if (!getConfig().allowDemo) throw new HttpError(403, 'Le mode démonstration est désactivé sur cette instance', 'demo_disabled');
    const user = await requireUser();
    if (!user.demo) throw new HttpError(403, 'Seul le compte de démonstration peut réinitialiser les données');
    // the demo session is open to everybody, and a reset wipes what other visitors are looking at: not in a loop
    enforce(`dev-reset:${clientIp(request)}`, LIMITS.devReset.max, LIMITS.devReset.windowMs, 'Trop de réinitialisations');
    await resetDb();
    return { ok: true };
  });
}
