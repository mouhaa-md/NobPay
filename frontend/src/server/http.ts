import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { GatewayError } from './bitnob/types';
import { logger } from './logger';
import { getLang } from '@/lib/i18n/server';
import { translate, type Lang } from '@/lib/i18n/messages';

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
    /** seconds, sent as the Retry-After header (429) */
    public readonly retryAfter?: number,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/** Wraps a route handler so thrown HttpErrors become clean JSON answers. */
/** The language of the request, French outside a request (tests, background work). */
async function langOf(): Promise<Lang> {
  try {
    return await getLang();
  } catch {
    return 'fr';
  }
}

export async function respond<T>(fn: () => Promise<T>): Promise<NextResponse> {
  try {
    return NextResponse.json(await fn());
  } catch (err) {
    if (err instanceof HttpError) {
      const headers = err.retryAfter ? { 'Retry-After': String(err.retryAfter) } : undefined;
      // messages are written in French; the ones with a fixed text have an English wording in the dictionary
      return NextResponse.json({ error: translate(await langOf(), err.message), code: err.code }, { status: err.status, headers });
    }
    const requestId = randomUUID().slice(0, 8);
    if (err instanceof GatewayError) {
      // the payment provider refused or did not answer: say so, with the French message the gateway prepared
      logger.warn('gateway_error', { requestId, status: err.status, code: err.code, message: err.message });
      return NextResponse.json({ error: err.message, code: 'gateway_error', requestId }, { status: 502 });
    }
    // Anything else is OUR bug: the details (stack included) go to the logs, never to the browser.
    logger.error('unhandled_error', { requestId, error: err });
    return NextResponse.json(
      { error: translate(await langOf(), 'Une erreur est survenue de notre côté. Réessayez dans un instant. (référence {requestId})', { requestId }), code: 'internal', requestId },
      { status: 500 },
    );
  }
}

/**
 * Reads a request body with a hard ceiling. Bytes are counted AS THEY ARRIVE, so a missing or lying Content-Length
 * cannot get past it, and nothing larger than `maxBytes` is ever held in memory.
 */
export async function readBodyLimited(request: Request, maxBytes: number): Promise<Uint8Array> {
  const tooBig = () => new HttpError(413, 'Envoi trop volumineux.', 'too_large');
  if (Number(request.headers.get('content-length') ?? 0) > maxBytes) throw tooBig();
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw tooBig();
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export async function readTextLimited(request: Request, maxBytes: number): Promise<string> {
  return new TextDecoder().decode(await readBodyLimited(request, maxBytes));
}
