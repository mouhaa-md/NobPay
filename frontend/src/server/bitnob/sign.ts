import { randomBytes } from 'node:crypto';
import { hmacHex, safeEqual } from '../crypto';

/**
 * Request authentication (Bitnob API v2): four headers,
 * signature = HMAC-SHA256(client_secret, `${client_id}:${timestamp}:${nonce}:${payload}`) in hex,
 * where payload is the exact JSON body sent (empty string when there is no body).
 */
export function buildAuthHeaders(input: {
  clientId: string;
  clientSecret: string;
  payload: string;
  timestamp?: number;
  nonce?: string;
}): Record<string, string> {
  const timestamp = input.timestamp ?? Math.floor(Date.now() / 1000);
  const nonce = input.nonce ?? randomBytes(16).toString('hex');
  const signed = `${input.clientId}:${timestamp}:${nonce}:${input.payload}`;
  return {
    'X-Auth-Client': input.clientId,
    'X-Auth-Timestamp': String(timestamp),
    'X-Auth-Nonce': nonce,
    'X-Auth-Signature': hmacHex('sha256', input.clientSecret, signed),
  };
}

/** HMAC-SHA512 of the raw request body, hex encoded (header `x-bitnob-signature`). */
export function signWebhookBody(secret: string, rawBody: string): string {
  return hmacHex('sha512', secret, rawBody);
}

/**
 * Checks a webhook signature against the RAW body (never the re-serialised JSON).
 * Accepts hex or base64, with an optional `sha512=` prefix, compared in constant time.
 */
export function verifyWebhookSignature(input: { secret: string; rawBody: string; signature: string | null | undefined }): boolean {
  const { secret, rawBody } = input;
  if (!secret || !input.signature) return false;
  const given = input.signature.trim().replace(/^sha512=/i, '');
  const hex = hmacHex('sha512', secret, rawBody);
  if (safeEqual(given.toLowerCase(), hex)) return true;
  const b64 = Buffer.from(hex, 'hex').toString('base64');
  return safeEqual(given, b64);
}
