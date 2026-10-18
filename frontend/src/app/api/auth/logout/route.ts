import { endSession } from '@/server/auth';
import { respond } from '@/server/http';

export const dynamic = 'force-dynamic';

export async function POST() {
  return respond(async () => {
    endSession();
    return { ok: true };
  });
}
