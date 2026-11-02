import { clientIp, enforce, LIMITS } from '@/server/rateLimit';
import { guestUser, startSession } from '@/server/auth';
import { respond } from '@/server/http';

export const dynamic = 'force-dynamic';

/** "Try without an account": a private guest account for this browser, no phone number needed (ALLOW_GUEST=1). */
export async function POST(request: Request) {
  return respond(async () => {
    enforce(`guest:ip:${clientIp(request)}`, LIMITS.guestIp.max, LIMITS.guestIp.windowMs, 'Trop de comptes invités créés depuis cette adresse');
    const user = await guestUser();
    await startSession(user);
    return { user: { id: user.id, firstName: user.firstName, lastName: user.lastName } };
  });
}
