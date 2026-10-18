import { NextResponse } from 'next/server';

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
    console.error('[api]', err);
    const message = err instanceof Error ? err.message : 'Erreur interne';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
