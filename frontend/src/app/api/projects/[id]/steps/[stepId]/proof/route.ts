import type { ProofPhoto } from '@/lib/types';
import { clientIp, enforce, LIMITS } from '@/server/rateLimit';
import { requireUser } from '@/server/auth';
import { saveUpload } from '@/server/files';
import { HttpError, respond } from '@/server/http';
import { assertProjectAccess, submitProof, type Actor } from '@/server/services';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface PhotoMeta {
  takenAt?: string;
  lat?: number;
  lng?: number;
  accuracy?: number;
}

const isFile = (v: FormDataEntryValue | null): v is File => typeof v === 'object' && v !== null && 'arrayBuffer' in v && v.size > 0;

/**
 * Proof submitted from the field (manager link, `token`) or by the funder (session).
 * multipart/form-data: photos[] + photoMeta (JSON, same order) + invoice + supplier* + note.
 */
export async function POST(request: Request, { params }: { params: { id: string; stepId: string } }) {
  return respond(async () => {
    const form = await request.formData();
    const token = String(form.get('token') ?? '').trim();
    const actor: Actor = token ? { kind: 'manager', token } : { kind: 'owner', user: await requireUser() };
    enforce(`proof:${token ? `token:${token}` : `user:${(actor as { user: { id: string } }).user.id}`}`, LIMITS.proof.max, LIMITS.proof.windowMs);
    enforce(`proof:ip:${clientIp(request)}`, LIMITS.proof.max * 3, LIMITS.proof.windowMs);
    await assertProjectAccess(actor, params.id); // check access BEFORE writing any file

    let meta: PhotoMeta[] = [];
    try {
      meta = JSON.parse(String(form.get('photoMeta') ?? '[]')) as PhotoMeta[];
    } catch {
      /* ignore broken metadata */
    }

    const photos: (Awaited<ReturnType<typeof saveUpload>> & { takenAt?: string; gps?: ProofPhoto['gps'] })[] = [];
    const files = form.getAll('photos').filter(isFile).slice(0, 6);
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const stored = await saveUpload(params.id, Buffer.from(await f.arrayBuffer()), f.name, f.type || 'image/jpeg');
      const m = meta[i] ?? {};
      const hasGps = typeof m.lat === 'number' && typeof m.lng === 'number';
      photos.push({
        ...stored,
        takenAt: m.takenAt,
        gps: hasGps ? { lat: Number(m.lat!.toFixed(5)), lng: Number(m.lng!.toFixed(5)), accuracy: m.accuracy ? Math.round(m.accuracy) : undefined } : undefined,
      });
    }

    const invoiceEntry = form.get('invoice');
    const invoice = isFile(invoiceEntry)
      ? await saveUpload(params.id, Buffer.from(await invoiceEntry.arrayBuffer()), invoiceEntry.name, invoiceEntry.type || 'image/jpeg')
      : undefined;

    const network = String(form.get('supplierNetwork') ?? '');
    if (!['wave', 'orange_money', 'free_money'].includes(network)) throw new HttpError(400, "Choisissez l'opérateur mobile money du fournisseur");

    const step = await submitProof(actor, params.id, params.stepId, {
      photos,
      invoice,
      invoiceAmountFcfa: Number(form.get('invoiceAmountFcfa')) || undefined,
      note: String(form.get('note') ?? ''),
      supplier: {
        name: String(form.get('supplierName') ?? ''),
        phone: String(form.get('supplierPhone') ?? ''),
        network: network as 'wave' | 'orange_money' | 'free_money',
      },
    });
    return { step: { id: step.id, status: step.status } };
  });
}
