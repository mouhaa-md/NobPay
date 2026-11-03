import { requireUser } from '@/server/auth';
import { disableContribution, enableContribution } from '@/server/contribution';
import { respond } from '@/server/http';
import { contributionEnableSchema, readJson } from '@/server/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** The funder opens the family link (or renews it: the old one stops working) and gets the address to send. */
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return respond(async () => {
    const user = await requireUser();
    const body = await readJson(request, contributionEnableSchema);
    const { token, expiresAt } = await enableContribution(user, params.id, { renew: body.renew });
    return { path: `/contribuer/${token}`, expiresAt };
  });
}

/** The funder closes the family link at once. */
export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return respond(async () => {
    const user = await requireUser();
    await disableContribution(user, params.id);
    return { ok: true };
  });
}
