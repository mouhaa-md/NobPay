import { NextResponse } from 'next/server';
import { handleBitnobWebhook } from '@/server/webhooks';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Register `<PUBLIC_BASE_URL>/api/webhooks/bitnob` in the Bitnob dashboard (Webhooks). */
export async function POST(request: Request) {
  // The signature covers the raw bytes: read the body as text BEFORE any JSON parsing.
  const rawBody = await request.text();
  const result = await handleBitnobWebhook(rawBody, request.headers.get('x-bitnob-signature'));
  return NextResponse.json(result.body, { status: result.status });
}
