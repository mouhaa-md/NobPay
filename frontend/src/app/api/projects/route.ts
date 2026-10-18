import { requireUser } from '@/server/auth';
import { respond } from '@/server/http';
import { createProject } from '@/server/services';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return respond(async () => {
    const user = await requireUser();
    const body = await request.json().catch(() => ({}));
    const project = await createProject(user, body);
    return { id: project.id, managerToken: project.managerToken };
  });
}
