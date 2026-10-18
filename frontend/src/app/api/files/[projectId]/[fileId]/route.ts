import { NextResponse } from 'next/server';
import type { StoredFile } from '@/lib/types';
import { clientIp, enforce, LIMITS } from '@/server/rateLimit';
import { getSessionUser } from '@/server/auth';
import { readDb } from '@/server/db';
import { managerTokenMatches } from '@/server/managerToken';
import { readUpload, sniffMime } from '@/server/files';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Proof photos are private: the funder (session) or the field manager (link token `t`) only. */
export async function GET(request: Request, { params }: { params: { projectId: string; fileId: string } }) {
  try {
    enforce(`file-read:${clientIp(request)}`, LIMITS.fileRead.max, LIMITS.fileRead.windowMs);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message, code: 'rate_limited' }, { status: 429, headers: { 'Retry-After': String((err as { retryAfter?: number }).retryAfter ?? 60) } });
  }
  const db = await readDb();
  const project = db.projects.find((p) => p.id === params.projectId);
  if (!project) return NextResponse.json({ error: 'Introuvable' }, { status: 404 });

  const token = new URL(request.url).searchParams.get('t');
  const user = await getSessionUser();
  const allowed = (user && user.id === project.ownerId) || (token && managerTokenMatches(project, token));
  if (!allowed) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });

  let file: StoredFile | undefined;
  for (const step of project.steps) {
    const candidates = [...(step.proof?.photos ?? []), ...(step.proof?.invoice ? [step.proof.invoice] : [])];
    file = candidates.find((f) => f.id === params.fileId);
    if (file) break;
  }
  if (!file) return NextResponse.json({ error: 'Introuvable' }, { status: 404 });
  const bytes = await readUpload(project.id, file);
  if (!bytes) return NextResponse.json({ error: 'Fichier absent' }, { status: 404 });

  // Bundled demo images are ours; anything uploaded is served with the type its BYTES show, whatever was stored.
  const mime = file.publicPath ? file.mime : (sniffMime(bytes)?.mime ?? null);
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      'Content-Type': mime ?? 'application/octet-stream',
      ...(mime ? {} : { 'Content-Disposition': 'attachment' }),
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      // a file must never run scripts or load anything, even if it is an SVG that slipped in
      'Content-Security-Policy': "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
    },
  });
}
