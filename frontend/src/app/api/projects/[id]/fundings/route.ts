import { requireUser } from '@/server/auth';
import { respond } from '@/server/http';
import { createFunding } from '@/server/services';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  return respond(async () => {
    const user = await requireUser();
    const body = await request.json().catch(() => ({}));
    const funding = await createFunding(user, params.id, {
      amountCents: Math.round(Number(body.amountCents)),
      method: body.method ?? 'lightning',
    });
    return { funding };
  });
}
