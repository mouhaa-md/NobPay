import { simulateContribution } from '@/server/contribution';
import { respond } from '@/server/http';
import { clientIp, enforce, LIMITS } from '@/server/rateLimit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Demonstration instances only (ALLOW_DEMO, never real sats): "pays" the invoice with an event signed by NobPay. */
export async function POST(request: Request, props: { params: Promise<{ token: string; fundingId: string }> }) {
  const params = await props.params;
  return respond(async () => {
    enforce(`contribute:ip:${clientIp(request)}`, LIMITS.contribute.max * 3, LIMITS.contribute.windowMs);
    return { funding: await simulateContribution(decodeURIComponent(params.token), params.fundingId) };
  });
}
