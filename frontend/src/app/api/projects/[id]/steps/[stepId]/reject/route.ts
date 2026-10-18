import { requireUser } from '@/server/auth';
import { respond } from '@/server/http';
import { readJson, rejectSchema } from '@/server/validation';
import { rejectProof } from '@/server/services';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: { id: string; stepId: string } }) {
  return respond(async () => {
    const user = await requireUser();
    const body = await readJson(request, rejectSchema);
    const step = await rejectProof(user, params.id, params.stepId, body.note);
    return { step: { id: step.id, status: step.status } };
  });
}
