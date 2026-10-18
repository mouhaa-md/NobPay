import { NextResponse } from 'next/server';
import type { StoredFile } from '@/lib/types';
import { getSessionUser } from '@/server/auth';
import { readDb } from '@/server/db';
import { readUpload } from '@/server/files';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Proof photos are private: the funder (session) or the field manager (link token `t`) only. */
export async function GET(request: Request, { params }: { params: { projectId: string; fileId: string } }) {
  const db = await readDb();
  const project = db.projects.find((p) => p.id === params.projectId);
  if (!project) return NextResponse.json({ error: 'Introuvable' }, { status: 404 });

  const token = new URL(request.url).searchParams.get('t');
  const user = await getSessionUser();
  const allowed = (user && user.id === project.ownerId) || (token && token === project.managerToken);
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

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      'Content-Type': file.mime,
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      // an uploaded SVG must never run scripts
      'Content-Security-Policy': "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'",
    },
  });
}
