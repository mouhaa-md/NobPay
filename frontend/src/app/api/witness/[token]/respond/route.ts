import { respond } from '@/server/http';
import { clientIp, enforce, LIMITS } from '@/server/rateLimit';
import { readJson, witnessRespondSchema } from '@/server/validation';
import { witnessRespond } from '@/server/witness';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** The witness says "confirmed" or "disputed" about the proof now waiting for the funder's decision (the link is the credential). */
export async function POST(request: Request, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  return respond(async () => {
    enforce(`witness:ip:${clientIp(request)}`, LIMITS.witness.max, LIMITS.witness.windowMs);
    const body = await readJson(request, witnessRespondSchema);
    const step = await witnessRespond(decodeURIComponent(params.token), body);
    return { verdict: step.proof?.witness?.verdict };
  });
}
