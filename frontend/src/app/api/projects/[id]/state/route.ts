import { escrowCents, releasedCents } from '@/lib/types';
import { requireUser } from '@/server/auth';
import { readDb } from '@/server/db';
import { HttpError, respond } from '@/server/http';

export const dynamic = 'force-dynamic';

/** Light status used by the screens that wait for a payout or a webhook. Read-only: the background loop does the work. */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  return respond(async () => {
    const user = await requireUser();
    const db = await readDb();
    const project = db.projects.find((p) => p.id === params.id && p.ownerId === user.id);
    if (!project) throw new HttpError(404, 'Projet introuvable');
    return {
      escrowCents: escrowCents(db, project),
      releasedCents: releasedCents(project),
      steps: project.steps.map((s) => ({
        id: s.id,
        status: s.status,
        payoutStatus: s.payout?.status,
        payoutError: s.payout?.error,
        paidAt: s.payout?.completedAt,
      })),
    };
  });
}
