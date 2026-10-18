import { demoUser, startSession } from '@/server/auth';
import { respond } from '@/server/http';

export const dynamic = 'force-dynamic';

/** One-tap access to the pre-filled demonstration account (Aminata Sow). */
export async function POST() {
  return respond(async () => {
    const user = await demoUser();
    startSession(user.id);
    return { user: { id: user.id, firstName: user.firstName, lastName: user.lastName } };
  });
}
