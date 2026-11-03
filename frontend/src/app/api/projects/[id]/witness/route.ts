import { requireUser } from '@/server/auth';
import { respond } from '@/server/http';
import { readJson, witnessInviteSchema } from '@/server/validation';
import { inviteWitness, removeWitness } from '@/server/witness';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** The funder names (or changes) the project's independent witness and gets the link to send. */
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return respond(async () => {
    const user = await requireUser();
    const body = await readJson(request, witnessInviteSchema);
    const { token, expiresAt } = await inviteWitness(user, params.id, body);
    return { path: `/temoin/${token}`, expiresAt };
  });
}

/** The funder removes the witness: the link stops working at once. */
export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return respond(async () => {
    const user = await requireUser();
    await removeWitness(user, params.id);
    return { ok: true };
  });
}
