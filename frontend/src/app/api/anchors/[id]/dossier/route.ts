import { clientIp, enforce, LIMITS } from '@/server/rateLimit';
import { NextResponse } from 'next/server';
import { readDb } from '@/server/db';

export const dynamic = 'force-dynamic';

/** The exact bytes whose SHA-256 was anchored. Do not reformat the file: any change breaks the proof. */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    enforce(`public-read:${clientIp(request)}`, LIMITS.publicRead.max, LIMITS.publicRead.windowMs);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message, code: 'rate_limited' }, { status: 429, headers: { 'Retry-After': String((err as { retryAfter?: number }).retryAfter ?? 60) } });
  }
  const anchor = (await readDb()).anchors.find((a) => a.id === params.id);
  if (!anchor) return NextResponse.json({ error: 'Introuvable' }, { status: 404 });
  return new NextResponse(anchor.dossierJson, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="nobpay-dossier-${anchor.projectId}-${anchor.upToSeq}.json"`,
    },
  });
}
