import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { buildAuthHeaders, signWebhookBody, verifyWebhookSignature } from '@/server/bitnob/sign';

describe('Bitnob request signing', () => {
  it('signs CLIENT_ID:TIMESTAMP:NONCE:PAYLOAD with HMAC-SHA256 (hex)', () => {
    const headers = buildAuthHeaders({
      clientId: 'client-1',
      clientSecret: 'secret-1',
      payload: '{"amount":100}',
      timestamp: 1_700_000_000,
      nonce: 'abcd',
    });
    const expected = createHmac('sha256', 'secret-1').update('client-1:1700000000:abcd:{"amount":100}').digest('hex');
    expect(headers['X-Auth-Client']).toBe('client-1');
    expect(headers['X-Auth-Timestamp']).toBe('1700000000');
    expect(headers['X-Auth-Nonce']).toBe('abcd');
    expect(headers['X-Auth-Signature']).toBe(expected);
  });

  it('uses an empty payload when there is no body', () => {
    const h = buildAuthHeaders({ clientId: 'c', clientSecret: 's', payload: '', timestamp: 1, nonce: 'n' });
    expect(h['X-Auth-Signature']).toBe(createHmac('sha256', 's').update('c:1:n:').digest('hex'));
  });

  it('generates a fresh 16-byte hex nonce each time', () => {
    const a = buildAuthHeaders({ clientId: 'c', clientSecret: 's', payload: '' });
    const b = buildAuthHeaders({ clientId: 'c', clientSecret: 's', payload: '' });
    expect(a['X-Auth-Nonce']).toMatch(/^[0-9a-f]{32}$/);
    expect(a['X-Auth-Nonce']).not.toBe(b['X-Auth-Nonce']);
  });
});

describe('Webhook signature (HMAC-SHA512 over the raw body)', () => {
  const secret = 'whsec_test';
  const body = '{"event":"btc.lightning.received.success","data":{"id":"inv_1"}}';

  it('accepts a valid hex signature', () => {
    expect(verifyWebhookSignature({ secret, rawBody: body, signature: signWebhookBody(secret, body) })).toBe(true);
  });

  it('accepts an optional sha512= prefix and base64 encoding', () => {
    const hex = signWebhookBody(secret, body);
    expect(verifyWebhookSignature({ secret, rawBody: body, signature: `sha512=${hex}` })).toBe(true);
    expect(verifyWebhookSignature({ secret, rawBody: body, signature: Buffer.from(hex, 'hex').toString('base64') })).toBe(true);
  });

  it('rejects a forged event (valid JSON, wrong signature)', () => {
    const forged = body.replace('inv_1', 'inv_2');
    expect(verifyWebhookSignature({ secret, rawBody: forged, signature: signWebhookBody(secret, body) })).toBe(false);
  });

  it('rejects a wrong secret, an empty signature and a missing secret', () => {
    expect(verifyWebhookSignature({ secret: 'other', rawBody: body, signature: signWebhookBody(secret, body) })).toBe(false);
    expect(verifyWebhookSignature({ secret, rawBody: body, signature: '' })).toBe(false);
    expect(verifyWebhookSignature({ secret, rawBody: body, signature: null })).toBe(false);
    expect(verifyWebhookSignature({ secret: '', rawBody: body, signature: signWebhookBody(secret, body) })).toBe(false);
  });

  it('does not throw on signatures of a different length', () => {
    expect(verifyWebhookSignature({ secret, rawBody: body, signature: 'abc' })).toBe(false);
  });
});
