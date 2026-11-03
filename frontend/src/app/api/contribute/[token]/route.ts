import { createContribution } from '@/server/contribution';
import { respond } from '@/server/http';
import { clientIp, enforce, LIMITS } from '@/server/rateLimit';
import { contributeSchema, readJson } from '@/server/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Someone with the family link asks for an invoice to add to the project's escrow (the link is the credential). */
export async function POST(request: Request, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  return respond(async () => {
    enforce(`contribute:ip:${clientIp(request)}`, LIMITS.contribute.max, LIMITS.contribute.windowMs);
    const body = await readJson(request, contributeSchema);
    return { funding: await createContribution(decodeURIComponent(params.token), body) };
  });
}
