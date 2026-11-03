import { requireUser } from '@/server/auth';
import { respond } from '@/server/http';
import { unsubscribePush, type PushScope } from '@/server/push';
import { clientIp, enforce, LIMITS } from '@/server/rateLimit';
import { pushUnsubscribeSchema, readJson } from '@/server/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** The browser stops asking for notifications. */
export async function POST(request: Request) {
  return respond(async () => {
    enforce(`push:ip:${clientIp(request)}`, LIMITS.push.max, LIMITS.push.windowMs);
    const body = await readJson(request, pushUnsubscribeSchema);
    const scope: PushScope = body.scope.kind === 'owner' ? { kind: 'owner', user: await requireUser() } : { kind: body.scope.kind, token: body.scope.token };
    await unsubscribePush(scope, body.endpoint);
    return { ok: true };
  });
}
