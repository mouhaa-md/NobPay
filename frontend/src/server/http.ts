import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { GatewayError } from './bitnob/types';
import { logger } from './logger';

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
export async function respond<T>(fn: () => Promise<T>): Promise<NextResponse> {
  try {
    return NextResponse.json(await fn());
  } catch (err) {
    if (err instanceof HttpError) {
      const headers = err.retryAfter ? { 'Retry-After': String(err.retryAfter) } : undefined;
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status, headers });
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
      { error: `Une erreur est survenue de notre côté. Réessayez dans un instant. (référence ${requestId})`, code: 'internal', requestId },
      { status: 500 },
    );
  }
}
