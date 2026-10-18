import { enforce, LIMITS } from '@/server/rateLimit';
import { requireUser } from '@/server/auth';
import { respond } from '@/server/http';
import { fundingSchema, readJson } from '@/server/validation';
import { createFunding } from '@/server/services';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  return respond(async () => {
    const user = await requireUser();
    enforce(`funding-create:${user.id}`, LIMITS.fundingCreate.max, LIMITS.fundingCreate.windowMs);
    const body = await readJson(request, fundingSchema);
    const funding = await createFunding(user, params.id, { amountCents: Math.round(body.amountCents), method: body.method ?? 'lightning' });
    return { funding };
  });
}
