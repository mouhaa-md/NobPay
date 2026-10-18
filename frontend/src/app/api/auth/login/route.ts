import { clientIp, enforce, LIMITS } from '@/server/rateLimit';
import { loginSchema, readJson } from '@/server/validation';
import { loginUser, normalizePhone, startSession } from '@/server/auth';
import { respond } from '@/server/http';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return respond(async () => {
    const body = await readJson(request, loginSchema);
    enforce(`auth:ip:${clientIp(request)}`, LIMITS.authIp.max, LIMITS.authIp.windowMs);
    enforce(`auth:phone:${normalizePhone(body.phone)}`, LIMITS.authPhone.max, LIMITS.authPhone.windowMs);
    const user = await loginUser(body);
    startSession(user);
    return { user: { id: user.id, firstName: user.firstName, lastName: user.lastName } };
  });
}
