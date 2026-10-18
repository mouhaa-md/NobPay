import { enforce, LIMITS } from '@/server/rateLimit';
import { requireUser } from '@/server/auth';
import { createAnchor, toView } from '@/server/anchors';
import { respond } from '@/server/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Anchors the current state of the project's ledger on Bitcoin (OpenTimestamps). */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  return respond(async () => {
    const user = await requireUser();
    enforce(`anchor-create:${user.id}`, LIMITS.anchorCreate.max, LIMITS.anchorCreate.windowMs);
    const anchor = await createAnchor(user, params.id);
    return { anchor: toView(anchor) };
  });
}
