import { clientIp, enforce, LIMITS } from '@/server/rateLimit';
import { startSession } from '@/server/auth';
import { recoverGuest } from '@/server/guestRecovery';
import { respond } from '@/server/http';
import { readJson, recoverSchema } from '@/server/validation';

export const dynamic = 'force-dynamic';

/** Opens a guest account again with its recovery link (the link is the credential). */
export async function POST(request: Request) {
  return respond(async () => {
    enforce(`recover:ip:${clientIp(request)}`, LIMITS.authIp.max, LIMITS.authIp.windowMs);
    const { token } = await readJson(request, recoverSchema);
    const user = await recoverGuest(token);
    await startSession(user);
    return { ok: true };
  });
}
