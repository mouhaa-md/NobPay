import { HttpError } from './http';

/**
 * A proof upload is held in memory while it is handled: the request body, then the parsed multipart, then one copy of each file
 * being saved. Measured with Node 22 on a full-size form (7 files of 8 MB, 56 MB): the process grows by 215 to 270 MB, about
 * four times the size of the body. A free instance has 512 MB, so a few big uploads at the same moment are enough to get the
 * process killed (and a demo instance loses its data when that happens).
 *
 * This counts the bytes being handled right now and turns the excess away with a 503 and a short wait, instead of letting the
 * process die. One upload is always accepted, whatever its size, so a small budget can never block everything.
 * UPLOAD_MEMORY_MB changes the budget (default 48 MB, made for 512 MB: one full-size upload alone, or two of a usual size such as
 * 4 phone photos; raise it on a bigger server, for instance 160 on 2 GB).
 */

const g = globalThis as unknown as { __nobpayUploadBytes?: number };

export const uploadBudgetBytes = (): number => (Number(process.env.UPLOAD_MEMORY_MB) > 0 ? Number(process.env.UPLOAD_MEMORY_MB) : 48) * 1024 * 1024;

/** Bytes of uploads being handled at this moment (tests and diagnostics). */
export const uploadsInFlight = (): number => g.__nobpayUploadBytes ?? 0;

/** Reserves `bytes` for one upload and returns the function that gives them back (call it once the upload is done, in a `finally`). */
export function reserveUpload(bytes: number): () => void {
  const inFlight = uploadsInFlight();
  if (inFlight > 0 && inFlight + bytes > uploadBudgetBytes()) {
    throw new HttpError(503, 'Le serveur reçoit déjà d’autres photos. Réessayez dans quelques secondes.', 'busy', 5);
  }
  g.__nobpayUploadBytes = inFlight + bytes;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    g.__nobpayUploadBytes = Math.max(0, uploadsInFlight() - bytes);
  };
}
