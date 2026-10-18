import { clientIp, enforce, LIMITS } from '@/server/rateLimit';
import { loginUser, normalizePhone, startSession } from '@/server/auth';
import { respond } from '@/server/http';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return respond(async () => {
    const body = await request.json().catch(() => ({}));
    enforce(`auth:ip:${clientIp(request)}`, LIMITS.authIp.max, LIMITS.authIp.windowMs);
    enforce(`auth:phone:${normalizePhone(String(body.phone ?? ''))}`, LIMITS.authPhone.max, LIMITS.authPhone.windowMs);
    const user = await loginUser(body);
    startSession(user);
    return { user: { id: user.id, firstName: user.firstName, lastName: user.lastName } };
  });
}
