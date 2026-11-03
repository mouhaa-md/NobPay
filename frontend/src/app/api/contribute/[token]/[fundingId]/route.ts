import { contributionStatus } from '@/server/contribution';
import { respond } from '@/server/http';
import { clientIp, enforce, LIMITS } from '@/server/rateLimit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Polled by the contributor's screen while the invoice waits for its payment. */
export async function GET(request: Request, props: { params: Promise<{ token: string; fundingId: string }> }) {
  const params = await props.params;
  return respond(async () => {
    enforce(`contribute-read:ip:${clientIp(request)}`, LIMITS.publicRead.max, LIMITS.publicRead.windowMs);
    return { funding: await contributionStatus(decodeURIComponent(params.token), params.fundingId) };
  });
}
