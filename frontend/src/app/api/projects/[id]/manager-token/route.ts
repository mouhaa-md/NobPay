import { requireUser } from '@/server/auth';
import { respond } from '@/server/http';
import { rotateManagerToken } from '@/server/managerToken';
import { enforce } from '@/server/rateLimit';

export const dynamic = 'force-dynamic';

/** The funder renews the private link of the person on site: the old link stops working at once. */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  return respond(async () => {
    const user = await requireUser();
    enforce(`manager-token:${user.id}`, 10, 60 * 60_000, 'Trop de renouvellements');
    const { token, expiresAt } = await rotateManagerToken(user, params.id);
    return { managerToken: token, expiresAt };
  });
}
