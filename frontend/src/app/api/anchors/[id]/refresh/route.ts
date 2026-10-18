import { clientIp, enforce, LIMITS } from '@/server/rateLimit';
import { refreshAnchor } from '@/server/anchors';
import { respond } from '@/server/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Public: checks whether the Bitcoin attestation is available and cross-checks the block. */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  return respond(async () => {
    // public and it triggers outgoing calls (OpenTimestamps calendars, blockstream): limit per client and per anchor
    enforce(`anchor-refresh:ip:${clientIp(request)}`, LIMITS.anchorRefreshIp.max, LIMITS.anchorRefreshIp.windowMs);
    enforce(`anchor-refresh:${params.id}`, LIMITS.anchorRefreshEach.max, LIMITS.anchorRefreshEach.windowMs, 'Cet ancrage vient d\'être vérifié');
    return { anchor: await refreshAnchor(params.id, { verifyBlock: true }) };
  });
}
