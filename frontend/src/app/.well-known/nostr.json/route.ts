import { NextResponse } from 'next/server';
import { bindingOf } from '@/lib/nostr/commitment';
import { readDb } from '@/server/db';
import { ledgerFor } from '@/server/ledger';

export const dynamic = 'force-dynamic';

/**
 * NIP-05: `<project id>@<this domain>` names the key a project signs its Nostr commitments with, so a Nostr client shows a
 * name instead of a hexadecimal key. The key is the one the project's FIRST ledger event names (and so its Bitcoin anchor);
 * nothing here is new information. Only the asked-for name is answered: the list of projects is not published.
 */
export async function GET(request: Request) {
  const name = new URL(request.url).searchParams.get('name')?.toLowerCase() ?? '';
  const headers = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=300' };
  if (!/^[a-z0-9._-]{1,64}$/.test(name)) return NextResponse.json({ names: {} }, { headers });
  const db = await readDb();
  const project = db.projects.find((p) => p.id.toLowerCase() === name);
  const binding = project ? bindingOf(ledgerFor(db, project.id)[0]?.data) : null;
  return NextResponse.json({ names: binding ? { [name]: binding.pubkey } : {} }, { headers });
}
