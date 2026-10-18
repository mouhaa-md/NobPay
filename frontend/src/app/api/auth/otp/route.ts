import { getConfig } from '@/server/config';
import { respond } from '@/server/http';

export const dynamic = 'force-dynamic';

/**
 * "Sends" the SMS code. There is no SMS provider in this prototype: the code is returned
 * so the screen can display it as a demo code. Replace with a real provider in production.
 */
export async function POST() {
  return respond(async () => ({ sent: true, demo: true, demoCode: getConfig().demoOtp }));
}
