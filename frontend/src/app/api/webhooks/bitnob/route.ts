import { NextResponse } from 'next/server';
import { HttpError, readTextLimited } from '@/server/http';
import { clientIp, hit, LIMITS } from '@/server/rateLimit';
import { captureWebhook } from '@/server/capture';
import { handleBitnobWebhook, type WebhookResult } from '@/server/webhooks';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_WEBHOOK_BYTES = 256 * 1024;

/** Register `<PUBLIC_BASE_URL>/api/webhooks/bitnob` in the Bitnob dashboard (Webhooks). */
export async function POST(request: Request) {
  const verdict = hit(`webhook:${clientIp(request)}`, LIMITS.webhook.max, LIMITS.webhook.windowMs);
  if (!verdict.ok) {
    // Bitnob retries on a non-2xx answer, so a burst is slowed down, not lost
    return NextResponse.json({ error: 'Trop de requêtes' }, { status: 429, headers: { 'Retry-After': String(verdict.retryAfterSec) } });
  }
  // The signature covers the raw bytes: read the body as text BEFORE any JSON parsing. Real events are a few KB: 256 KB is generous.
  let rawBody: string;
  try {
    rawBody = await readTextLimited(request, MAX_WEBHOOK_BYTES);
  } catch (err) {
    if (err instanceof HttpError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  let result: WebhookResult | undefined;
  try {
    result = await handleBitnobWebhook(rawBody, request.headers.get('x-bitnob-signature'));
    return NextResponse.json(result.body, { status: result.status });
  } finally {
    // no-op unless CAPTURE_WEBHOOKS=1; also records deliveries our receiver rejected (wrong signature format...)
    await captureWebhook({ rawBody, headers: request.headers, result });
  }
}
