import { getConfig } from '@/server/config';
import { respond } from '@/server/http';

export const dynamic = 'force-dynamic';

/** Never exposes secrets: only tells which mode runs and whether the keys are present. */
export async function GET() {
  return respond(async () => {
    const c = getConfig();
    return {
      mode: c.mode,
      bitnobKeys: Boolean(c.clientId && c.clientSecret),
      webhookSecret: Boolean(c.webhookSecret),
      webhookUrl: `${c.publicBaseUrl}/api/webhooks/bitnob`,
    };
  });
}
