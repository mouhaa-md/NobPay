import { requireUser } from '@/server/auth';
import { respond } from '@/server/http';
import { simulateFundingPaid } from '@/server/services';

export const dynamic = 'force-dynamic';

/** Mock mode only: "pays" the invoice through a signed event sent to the real webhook handler. */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  return respond(async () => {
    const user = await requireUser();
    const funding = await simulateFundingPaid(user, params.id);
    return { funding };
  });
}
