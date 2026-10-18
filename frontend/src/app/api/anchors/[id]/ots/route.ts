import { NextResponse } from 'next/server';
import { readDb } from '@/server/db';

export const dynamic = 'force-dynamic';

/** The detached OpenTimestamps proof. Verify it with the dossier file on https://opentimestamps.org */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const anchor = (await readDb()).anchors.find((a) => a.id === params.id);
  if (!anchor?.otsBase64) return NextResponse.json({ error: 'Introuvable' }, { status: 404 });
  return new NextResponse(new Uint8Array(Buffer.from(anchor.otsBase64, 'base64')), {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="nobpay-dossier-${anchor.projectId}-${anchor.upToSeq}.json.ots"`,
    },
  });
}
