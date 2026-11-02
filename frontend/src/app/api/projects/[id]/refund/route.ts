import { enforce, LIMITS } from '@/server/rateLimit';
import { requireUser } from '@/server/auth';
import { respond } from '@/server/http';
import { requestRefund } from '@/server/lightningFlows';
import { readJson, refundSchema } from '@/server/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** The funder takes unused escrow back, to a Lightning address. Real sats on a real-bitcoin instance, simulated elsewhere. */
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return respond(async () => {
    const user = await requireUser();
    enforce(`refund:${user.id}`, LIMITS.refund.max, LIMITS.refund.windowMs);
    const body = await readJson(request, refundSchema);
    const refund = await requestRefund(user, params.id, { amountCents: Math.round(body.amountCents), address: body.address });
    return { refund: { id: refund.id, status: refund.status, amountCents: refund.amountCents, rail: refund.rail, uncertain: refund.uncertain ?? false } };
  });
}
