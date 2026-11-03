import { requireUser } from '@/server/auth';
import { respond } from '@/server/http';
import { updateProject } from '@/server/projectEdit';
import { enforce, LIMITS } from '@/server/rateLimit';
import { projectPlanSchema, readJson } from '@/server/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** The funder reshapes the steps still to come (a step the money has touched cannot be changed). */
export async function PUT(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return respond(async () => {
    const user = await requireUser();
    enforce(`project-edit:${user.id}`, LIMITS.projectEdit.max, LIMITS.projectEdit.windowMs);
    const body = await readJson(request, projectPlanSchema);
    const project = await updateProject(user, params.id, body.steps);
    return { project: { id: project.id, budgetCents: project.budgetCents, steps: project.steps.map((s) => ({ id: s.id, index: s.index, title: s.title, amountCents: s.amountCents, status: s.status })) } };
  });
}
