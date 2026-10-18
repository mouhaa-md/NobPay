import { NextResponse } from 'next/server';
import { captureWebhook } from '@/server/capture';
import { handleBitnobWebhook, type WebhookResult } from '@/server/webhooks';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Register `<PUBLIC_BASE_URL>/api/webhooks/bitnob` in the Bitnob dashboard (Webhooks). */
export async function POST(request: Request) {
  // The signature covers the raw bytes: read the body as text BEFORE any JSON parsing.
  const rawBody = await request.text();
  let result: WebhookResult | undefined;
  try {
    result = await handleBitnobWebhook(rawBody, request.headers.get('x-bitnob-signature'));
    return NextResponse.json(result.body, { status: result.status });
  } finally {
    // no-op unless CAPTURE_WEBHOOKS=1; also records deliveries our receiver rejected (wrong signature format...)
    await captureWebhook({ rawBody, headers: request.headers, result });
  }
}
