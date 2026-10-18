import type { ProofPhoto } from '@/lib/types';
import { clientIp, enforce, LIMITS } from '@/server/rateLimit';
import { photoMetaSchema, proofFieldsSchema, validate } from '@/server/validation';
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

const MAX_REQUEST_BYTES = 60 * 1024 * 1024;

const isFile = (v: FormDataEntryValue | null): v is File => typeof v === 'object' && v !== null && 'arrayBuffer' in v && v.size > 0;

/**
 * Proof submitted from the field (manager link, `token`) or by the funder (session).
 * multipart/form-data: photos[] + photoMeta (JSON, same order) + invoice + supplier* + note.
 */
export async function POST(request: Request, { params }: { params: { id: string; stepId: string } }) {
  return respond(async () => {
    // up to 6 photos + 1 invoice of 8 MB each, plus form fields: refuse anything larger before reading it
    if (Number(request.headers.get('content-length') ?? 0) > MAX_REQUEST_BYTES) throw new HttpError(413, 'Envoi trop volumineux (8 Mo par fichier, 6 photos au plus)', 'too_large');
    const form = await request.formData();
    const token = String(form.get('token') ?? '').trim();
    const actor: Actor = token ? { kind: 'manager', token } : { kind: 'owner', user: await requireUser() };
    enforce(`proof:${token ? `token:${token}` : `user:${(actor as { user: { id: string } }).user.id}`}`, LIMITS.proof.max, LIMITS.proof.windowMs);
    enforce(`proof:ip:${clientIp(request)}`, LIMITS.proof.max * 3, LIMITS.proof.windowMs);
    await assertProjectAccess(actor, params.id); // check access BEFORE writing any file

    // validated BEFORE any file is written
    const rawMeta = String(form.get('photoMeta') ?? '[]');
    let metaJson: unknown;
    try {
      metaJson = JSON.parse(rawMeta);
    } catch {
      throw new HttpError(400, 'Métadonnées des photos illisibles.', 'invalid_input');
    }
    const meta: PhotoMeta[] = validate(photoMetaSchema, metaJson);
    const amountRaw = form.get('invoiceAmountFcfa');
    const fields = validate(proofFieldsSchema, {
      token,
      supplierName: String(form.get('supplierName') ?? ''),
      supplierPhone: String(form.get('supplierPhone') ?? ''),
      supplierNetwork: String(form.get('supplierNetwork') ?? ''),
      invoiceAmountFcfa: amountRaw === null || amountRaw === '' ? undefined : Number(amountRaw),
      note: String(form.get('note') ?? ''),
    });

    const photos: (Awaited<ReturnType<typeof saveUpload>> & { takenAt?: string; gps?: ProofPhoto['gps'] })[] = [];
    const files = form.getAll('photos').filter(isFile).slice(0, 6);
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const stored = await saveUpload(params.id, Buffer.from(await f.arrayBuffer()), f.name, f.type || 'image/jpeg');
      const m = meta[i] ?? {};
      const hasGps = typeof m.lat === 'number' && typeof m.lng === 'number';
      photos.push({
        ...stored,
        takenAt: m.takenAt ? new Date(m.takenAt).toISOString() : undefined,
        gps: hasGps ? { lat: Number(m.lat!.toFixed(5)), lng: Number(m.lng!.toFixed(5)), accuracy: m.accuracy ? Math.round(m.accuracy) : undefined } : undefined,
      });
    }

    const invoiceEntry = form.get('invoice');
    const invoice = isFile(invoiceEntry)
      ? await saveUpload(params.id, Buffer.from(await invoiceEntry.arrayBuffer()), invoiceEntry.name, invoiceEntry.type || 'image/jpeg')
      : undefined;

    const step = await submitProof(actor, params.id, params.stepId, {
      photos,
      invoice,
      invoiceAmountFcfa: fields.invoiceAmountFcfa || undefined,
      note: fields.note,
      supplier: { name: fields.supplierName, phone: fields.supplierPhone, network: fields.supplierNetwork },
    });
    return { step: { id: step.id, status: step.status } };
  });
}
