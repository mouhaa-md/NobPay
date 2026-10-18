import { refreshAnchor } from '@/server/anchors';
import { respond } from '@/server/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Public: checks whether the Bitcoin attestation is available and cross-checks the block. */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  return respond(async () => ({ anchor: await refreshAnchor(params.id, { verifyBlock: true }) }));
}
