import { getSessionUser } from '@/server/auth';
import { getConfig } from '@/server/config';
import { gatewayFor } from '@/server/bitnob';
import { respond } from '@/server/http';
import { checkSolvency, getSolvency } from '@/server/services';

export const dynamic = 'force-dynamic';

/**
 * Public: only tells which mode runs and whether the keys are present, never a secret.
 * `?detail=1` adds the Bitnob balances and the solvency check, but only for a signed-in demo/admin account:
 * balances are never public.
 */
export async function GET(request: Request) {
  return respond(async () => {
    const c = getConfig();
    const base = {
      mode: c.mode,
      demo: c.allowDemo,
      bitnobKeys: Boolean(c.clientId && c.clientSecret),
      webhookSecret: Boolean(c.webhookSecret),
      webhookUrl: `${c.publicBaseUrl}/api/webhooks/bitnob`,
    };
    if (new URL(request.url).searchParams.get('detail') !== '1') return base;
    const user = await getSessionUser();
    if (!user?.demo) return base; // same answer as without `detail`: nothing is revealed
    const out: Record<string, unknown> = { ...base, payoutAsset: c.payoutAsset, solvency: getSolvency() ?? null };
    if (c.mode === 'sandbox') {
      try {
        out.balances = await gatewayFor('sandbox').balances();
        out.solvency = await checkSolvency();
      } catch (err) {
        out.balancesError = (err as Error).message;
      }
    }
    return out;
  });
}
