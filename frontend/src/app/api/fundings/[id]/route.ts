import { requireUser } from '@/server/auth';
import { respond } from '@/server/http';
import { refreshFunding } from '@/server/services';

export const dynamic = 'force-dynamic';

/** Polled by the payment screen. In sandbox mode this also checks the invoice on the Bitnob API. */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  return respond(async () => {
    const user = await requireUser();
    const funding = await refreshFunding(user, params.id);
    return { funding };
  });
}
