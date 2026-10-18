import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { captureWebhook, maskHeaders, maskValue } from '@/server/capture';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'nobpay-capture-'));
  process.env.DATA_DIR = dir;
});

afterEach(() => {
  delete process.env.CAPTURE_WEBHOOKS;
});

const headers = () =>
  new Headers({
    'content-type': 'application/json',
    'x-bitnob-signature': 'ab'.repeat(64),
    authorization: 'Bearer very-secret-token',
    'user-agent': 'bitnob-webhooks/1.0',
  });

describe('webhook capture (CAPTURE_WEBHOOKS=1)', () => {
  it('does nothing and creates nothing when the variable is absent', async () => {
    const file = await captureWebhook({ rawBody: '{"a":1}', headers: headers() });
    expect(file).toBeNull();
    expect(existsSync(path.join(dir, 'webhook-captures'))).toBe(false);
  });

  it('saves the raw body byte for byte, with the signature and secrets masked', async () => {
    process.env.CAPTURE_WEBHOOKS = '1';
    const rawBody = '{ "event":"btc.lightning.received.success",\n "data": {"id":"inv_1"} }';
    const file = await captureWebhook({ rawBody, headers: headers(), result: { status: 200, body: { received: true, outcome: 'funding_paid' } } });
    expect(file).not.toBeNull();
    expect(readdirSync(path.join(dir, 'webhook-captures'))).toHaveLength(1);

    const text = readFileSync(file!, 'utf8');
    const saved = JSON.parse(text);
    expect(saved.rawBody).toBe(rawBody); // unchanged: it can be re-signed and replayed in a test
    expect(saved.headers['content-type']).toBe('application/json');
    expect(saved.headers['x-bitnob-signature']).toBe('abababab…(128 car.)');
    expect(text).not.toContain('very-secret-token');
    expect(text).not.toContain('ab'.repeat(64));
    expect(saved.answered).toEqual({ status: 200, outcome: 'funding_paid' });
  });

  it('never throws: an unwritable folder just returns null', async () => {
    process.env.CAPTURE_WEBHOOKS = '1';
    const notADir = path.join(dir, 'a-file');
    writeFileSync(notADir, 'x');
    process.env.DATA_DIR = notADir; // a folder cannot be created inside a regular file
    await expect(captureWebhook({ rawBody: '{}', headers: headers() })).resolves.toBeNull();
  });
});

describe('masking', () => {
  it('hides short values entirely and long ones after 8 characters', () => {
    expect(maskValue('abc')).toBe('***');
    expect(maskValue('0123456789')).toBe('01234567…(10 car.)');
  });

  it('masks every sensitive header name', () => {
    const out = maskHeaders(new Headers({ 'x-api-key': 'k'.repeat(20), cookie: 'sid=' + 'x'.repeat(20), accept: 'application/json' }));
    expect(out['x-api-key']).toContain('…');
    expect(out.cookie).toContain('…');
    expect(out.accept).toBe('application/json');
  });
});
