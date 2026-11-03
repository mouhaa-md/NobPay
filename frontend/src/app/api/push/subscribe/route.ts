import { getLang } from '@/lib/i18n/server';
import { requireUser } from '@/server/auth';
import { respond } from '@/server/http';
import { subscribePush, type PushScope } from '@/server/push';
import { clientIp, enforce, LIMITS } from '@/server/rateLimit';
import { pushSubscribeSchema, readJson } from '@/server/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** A browser asks for notifications: for the signed-in funder, or for the person a link (field or witness) belongs to. */
export async function POST(request: Request) {
  return respond(async () => {
    enforce(`push:ip:${clientIp(request)}`, LIMITS.push.max, LIMITS.push.windowMs);
    const body = await readJson(request, pushSubscribeSchema);
    const scope: PushScope = body.scope.kind === 'owner' ? { kind: 'owner', user: await requireUser() } : { kind: body.scope.kind, token: body.scope.token };
    await subscribePush(scope, { endpoint: body.subscription.endpoint, p256dh: body.subscription.keys.p256dh, auth: body.subscription.keys.auth }, await getLang());
    return { ok: true };
  });
}
