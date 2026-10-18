import { loginUser, startSession } from '@/server/auth';
import { respond } from '@/server/http';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return respond(async () => {
    const body = await request.json().catch(() => ({}));
    const user = await loginUser(body);
    startSession(user.id);
    return { user: { id: user.id, firstName: user.firstName, lastName: user.lastName } };
  });
}
