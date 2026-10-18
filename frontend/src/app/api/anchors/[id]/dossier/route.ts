import { NextResponse } from 'next/server';
import { readDb } from '@/server/db';

export const dynamic = 'force-dynamic';

/** The exact bytes whose SHA-256 was anchored. Do not reformat the file: any change breaks the proof. */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const anchor = (await readDb()).anchors.find((a) => a.id === params.id);
  if (!anchor) return NextResponse.json({ error: 'Introuvable' }, { status: 404 });
  return new NextResponse(anchor.dossierJson, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="nobpay-dossier-${anchor.projectId}-${anchor.upToSeq}.json"`,
    },
  });
}
