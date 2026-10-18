import { requireUser } from '@/server/auth';
import { respond } from '@/server/http';
import { simulateFundingPaid } from '@/server/services';

export const dynamic = 'force-dynamic';

/** Demo only (ALLOW_DEMO): "pays" the invoice through an event signed by NobPay and sent to the real webhook handler. In sandbox the funding is marked `simulated`. */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  return respond(async () => {
    const user = await requireUser();
    const funding = await simulateFundingPaid(user, params.id);
    return { funding };
  });
}
