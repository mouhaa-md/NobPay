import { registerUser, startSession } from '@/server/auth';
import { respond } from '@/server/http';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return respond(async () => {
    const body = await request.json().catch(() => ({}));
    const user = await registerUser(body);
    startSession(user);
    return { user: { id: user.id, firstName: user.firstName, lastName: user.lastName } };
  });
}
