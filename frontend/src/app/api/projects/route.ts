import { enforce, LIMITS } from '@/server/rateLimit';
import { requireUser } from '@/server/auth';
import { managerLinkToken } from '@/server/managerToken';
import { respond } from '@/server/http';
import { projectSchema, readJson } from '@/server/validation';
import { createProject } from '@/server/services';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return respond(async () => {
    const user = await requireUser();
    enforce(`project-create:${user.id}`, LIMITS.projectCreate.max, LIMITS.projectCreate.windowMs);
    const body = await readJson(request, projectSchema);
    const project = await createProject(user, body);
    return { id: project.id, managerToken: managerLinkToken(project) };
  });
}
