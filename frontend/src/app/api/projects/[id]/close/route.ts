import { requireUser } from '@/server/auth';
import { respond } from '@/server/http';
import { closeProject } from '@/server/projectEdit';
import { enforce, LIMITS } from '@/server/rateLimit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** The funder closes the project: nothing more is funded, proved or paid; the escrow that is left can be taken back. */
export async function POST(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return respond(async () => {
    const user = await requireUser();
    enforce(`project-edit:${user.id}`, LIMITS.projectEdit.max, LIMITS.projectEdit.windowMs);
    const project = await closeProject(user, params.id);
    return { closedAt: project.closedAt };
  });
}
