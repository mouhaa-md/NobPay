import { requestProofReview } from '@/server/aiReview';
import { requireUser } from '@/server/auth';
import { getLang } from '@/lib/i18n/server';
import { respond } from '@/server/http';
import { enforce, LIMITS } from '@/server/rateLimit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// a review reads images and may take a while
export const maxDuration = 120;

/** The funder asks the AI for its advice on the proof of a step. Advisory only: nothing is paid or blocked by it. */
export async function POST(_request: Request, props: { params: Promise<{ id: string; stepId: string }> }) {
  const params = await props.params;
  return respond(async () => {
    const user = await requireUser();
    enforce(`ai-review:${user.id}`, LIMITS.aiReview.max, LIMITS.aiReview.windowMs, 'Trop d’avis demandés. Réessayez dans un moment.');
    const review = await requestProofReview(user, params.id, params.stepId, { lang: await getLang() });
    return { review };
  });
}
