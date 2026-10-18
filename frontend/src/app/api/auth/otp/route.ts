import { smsUnavailable } from '@/server/auth';
import { getConfig } from '@/server/config';
import { respond } from '@/server/http';

export const dynamic = 'force-dynamic';

/**
 * "Sends" the SMS code. There is no SMS provider in this prototype: with ALLOW_DEMO the shared demo code is
 * returned so the screen can display it. Without ALLOW_DEMO no code exists, so we say so instead of pretending.
 */
export async function POST() {
  return respond(async () => {
    const { allowDemo, demoOtp } = getConfig();
    if (!allowDemo) throw smsUnavailable();
    return { sent: true, demo: true, demoCode: demoOtp };
  });
}
