import { requireUser } from '@/server/auth';
import { renewRecovery } from '@/server/guestRecovery';
import { respond } from '@/server/http';

export const dynamic = 'force-dynamic';

/** Renews the recovery link of the signed-in guest account: the old link stops working. */
export async function POST() {
  return respond(async () => {
    const user = await requireUser();
    const token = await renewRecovery(user);
    return { path: `/app/recuperer/${token}` };
  });
}
