import { clientIp, enforce, LIMITS } from '@/server/rateLimit';
import { demoUser, startSession } from '@/server/auth';
import { respond } from '@/server/http';

export const dynamic = 'force-dynamic';

/** One-tap access to the pre-filled demonstration account (Aminata Sow). */
export async function POST(request: Request) {
  return respond(async () => {
    enforce(`demo:ip:${clientIp(request)}`, LIMITS.demoIp.max, LIMITS.demoIp.windowMs);
    const user = await demoUser();
    startSession(user);
    return { user: { id: user.id, firstName: user.firstName, lastName: user.lastName } };
  });
}
