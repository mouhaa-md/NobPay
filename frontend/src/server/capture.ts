import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getConfig } from './config';
import { logger } from './logger';

/**
 * Debug aid for the sandbox (CAPTURE_WEBHOOKS=1): keeps every webhook delivery on disk so the REAL payloads
 * Bitnob sends can be read, replayed in tests and turned into cleaned fixtures. Files go under
 * DATA_DIR/webhook-captures (ignored by Git). Best effort: it never changes the answer given to Bitnob.
 */

const MAX_BODY = 1_000_000; // bytes kept per capture
const SENSITIVE_HEADER = /signature|authorization|cookie|secret|token|key/i;

/** Keeps the first characters and the length (enough to tell hex from base64), hides the rest. */
export function maskValue(value: string): string {
  return value.length <= 8 ? '***' : `${value.slice(0, 8)}…(${value.length} car.)`;
}

export function maskHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, name) => {
    out[name] = SENSITIVE_HEADER.test(name) ? maskValue(value) : value;
  });
  return out;
}

export interface CaptureInput {
  rawBody: string;
  headers: Headers;
  /** what our receiver answered, when it got that far */
  result?: { status: number; body: Record<string, unknown> };
}

/** Returns the file written, or null when capture is off or failed. */
export async function captureWebhook(input: CaptureInput): Promise<string | null> {
  const cfg = getConfig();
  if (!cfg.captureWebhooks) return null;
  try {
    const dir = path.join(cfg.dataDir, 'webhook-captures');
    await fs.mkdir(dir, { recursive: true });
    const receivedAt = new Date().toISOString();
    const file = path.join(dir, `${receivedAt.replace(/[:.]/g, '-')}-${randomBytes(2).toString('hex')}.json`);
    const truncated = Buffer.byteLength(input.rawBody) > MAX_BODY;
    const record = {
      receivedAt,
      headers: maskHeaders(input.headers),
      rawBody: truncated ? input.rawBody.slice(0, MAX_BODY) : input.rawBody,
      truncated,
      answered: input.result ? { status: input.result.status, outcome: input.result.body.outcome ?? input.result.body.error } : undefined,
    };
    await fs.writeFile(file, JSON.stringify(record, null, 2));
    return file;
  } catch (err) {
    logger.warn('webhook_capture_failed', { error: err });
    return null;
  }
}
