import { requireUser } from '@/server/auth';
import { respond } from '@/server/http';
import { confirmRelease } from '@/server/services';

export const dynamic = 'force-dynamic';

/** Step 2: the funder confirms; the payout starts. Completion arrives through the webhook. */
export async function POST(_request: Request, { params }: { params: { id: string; stepId: string } }) {
  return respond(async () => {
    const user = await requireUser();
    const step = await confirmRelease(user, params.id, params.stepId);
    return { step: { id: step.id, status: step.status, payout: step.payout } };
  });
}
