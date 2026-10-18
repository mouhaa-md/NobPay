import { requireUser } from '@/server/auth';
import { respond } from '@/server/http';
import { quoteRelease } from '@/server/services';

export const dynamic = 'force-dynamic';

/** Step 1 of the release: a time-limited quote (rate, fees, amount received by the supplier). */
export async function POST(request: Request, { params }: { params: { id: string; stepId: string } }) {
  return respond(async () => {
    const user = await requireUser();
    const body = await request.json().catch(() => ({}));
    const quote = await quoteRelease(user, params.id, params.stepId, { simulate: body?.simulate === true });
    return { quote };
  });
}
