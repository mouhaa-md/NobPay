/**
 * One structured logger (a JSON line per event) with masking, so a secret cannot reach the logs by accident:
 *  - values under keys that look sensitive (secret, token, signature, authorization, otp, cookie, password,
 *    preimage, api key...) are replaced;
 *  - strings are scrubbed of Bitnob keys and bearer tokens, and cut at 400 characters;
 *  - nested objects are walked with a depth limit (no infinite loop on circular data).
 * Never pass a request body, a header map or a webhook payload as a field: log identifiers and outcomes.
 * (The `sms:log` provider prints the sign-in code on purpose: development only, see sms.ts.)
 */

const SENSITIVE_KEY = /secret|token|authorization|signature|password|passwd|otp|cookie|preimage|api[-_]?key|bearer|credential|codehash|private/i;
const MASK = '[masqué]';
const MAX_STRING = 400;
const MAX_DEPTH = 5;

export function scrub(text: string): string {
  const cleaned = text
    .replace(/prd:(sandbox|live)_[A-Za-z0-9]+/g, 'prd:$1_***')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer ***')
    .replace(/(Basic)\s+[A-Za-z0-9+/=]{8,}/gi, '$1 ***');
  return cleaned.length > MAX_STRING ? `${cleaned.slice(0, MAX_STRING)}…` : cleaned;
}

export function mask(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') return scrub(value);
  if (value === null || typeof value !== 'object') return typeof value === 'bigint' ? String(value) : value;
  if (value instanceof Error) return { name: value.name, message: scrub(value.message), stack: value.stack ? scrub(value.stack.split('\n').slice(0, 6).join('\n')) : undefined };
  if (seen.has(value)) return '[circulaire]';
  if (depth >= MAX_DEPTH) return '[profondeur max]';
  seen.add(value);
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => mask(v, depth + 1, seen));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEY.test(k) ? MASK : mask(v, depth + 1, seen);
  }
  return out;
}

type Level = 'info' | 'warn' | 'error';

function write(level: Level, event: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ time: new Date().toISOString(), level, event, ...(mask(fields) as Record<string, unknown>) });
  console[level](line);
}

export const logger = {
  info: (event: string, fields?: Record<string, unknown>) => write('info', event, fields),
  warn: (event: string, fields?: Record<string, unknown>) => write('warn', event, fields),
  error: (event: string, fields?: Record<string, unknown>) => write('error', event, fields),
};
