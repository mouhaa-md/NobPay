import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decodeBolt11, wholeSats } from '@/server/lightning/bolt11';
import { encodeBolt11 } from './helpers/bolt11';

const HASH = 'ab'.repeat(32);

describe('BOLT11 reader', () => {
  it('reads the amount, the payment hash, both descriptions and the expiry', () => {
    const descriptionHash = createHash('sha256').update('[["text/plain","pour test"]]').digest('hex');
    const pr = encodeBolt11({ amountMsat: 250_000_000n, paymentHash: HASH, description: 'café', descriptionHash, expiry: 900, timestamp: 1_800_000_000 });
    const d = decodeBolt11(pr);
    expect(d.network).toBe('mainnet');
    expect(d.amountMsat).toBe(250_000_000n);
    expect(wholeSats(d.amountMsat)).toBe(250_000);
    expect(d.paymentHash).toBe(HASH);
    expect(d.description).toBe('café');
    expect(d.descriptionHash).toBe(descriptionHash);
    expect(d.expirySeconds).toBe(900);
    expect(d.expiresAtMs).toBe((1_800_000_000 + 900) * 1000);
  });

  it.each([
    [1_000n, '1 sat'],
    [1_000_000n, '1 000 sats'],
    [123_456_000n, '123 456 sats'],
    [100_000_000_000n, '1 BTC'],
    [1_500n, '1 sat 500 msat'],
  ])('round-trips the amount %s msat (%s)', (amountMsat) => {
    const d = decodeBolt11(encodeBolt11({ amountMsat, paymentHash: HASH }));
    expect(d.amountMsat).toBe(amountMsat);
  });

  it('knows an amountless invoice, the default expiry and the networks', () => {
    const d = decodeBolt11(encodeBolt11({ paymentHash: HASH, network: 'testnet', timestamp: 1_800_000_000 }));
    expect(d.amountMsat).toBeUndefined();
    expect(wholeSats(d.amountMsat)).toBeNull();
    expect(d.expirySeconds).toBe(3600);
    expect(d.network).toBe('testnet');
    expect(decodeBolt11(encodeBolt11({ paymentHash: HASH, network: 'signet' })).network).toBe('signet');
    expect(decodeBolt11(encodeBolt11({ paymentHash: HASH, network: 'regtest' })).network).toBe('regtest');
  });

  it('accepts the lightning: prefix and capital letters (QR codes)', () => {
    const pr = encodeBolt11({ amountMsat: 5_000_000n, paymentHash: HASH });
    expect(decodeBolt11(`lightning:${pr}`).amountMsat).toBe(5_000_000n);
    expect(decodeBolt11(pr.toUpperCase()).amountMsat).toBe(5_000_000n);
  });

  it('is not fooled by a sub-millisatoshi amount', () => {
    // 1 pico-BTC = 0.1 msat is not payable
    expect(() => decodeBolt11(encodeBolt11({ amountMsat: 1_000n, paymentHash: HASH }).replace('lnbc10n', 'lnbc1p'))).toThrow();
  });

  it.each(['', 'not an invoice', 'lnbc1xxxx', 'lntb10u1pREDACTEDREDACTEDREDACTED'])('refuses %j', (bad) => {
    expect(() => decodeBolt11(bad)).toThrow(/Facture/);
  });

  it('refuses a corrupted checksum', () => {
    const pr = encodeBolt11({ amountMsat: 5_000_000n, paymentHash: HASH });
    const bad = pr.slice(0, -1) + (pr.endsWith('q') ? 'p' : 'q');
    expect(() => decodeBolt11(bad)).toThrow(/Facture/);
  });

  // The BOLT #11 specification, first example: a donation of any amount with a known payment hash. A real invoice,
  // not one built by our own encoder, so a mistake shared by encoder and decoder cannot hide here.
  it('reads the official BOLT11 specification example', () => {
    const spec =
      'lnbc1pvjluezsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygspp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdpl2pkx2ctnv5sxxmmwwd5kgetjypeh2ursdae8g6twvus8g6rfwvs8qun0dfjkxaq9qrsgq357wnc5r2ueh7ck6q93dj32dlqnls087fxdwk8qakdyafkq3yap9us6v52vjjsrvywa6rt52cm9r9zqt8r2t7mlcwspyetp5h2tztugp9lfyql';
    const d = decodeBolt11(spec);
    expect(d.network).toBe('mainnet');
    expect(d.amountMsat).toBeUndefined();
    expect(d.paymentHash).toBe('0001020304050607080900010203040506070809000102030405060708090102');
    expect(d.description).toBe('Please consider supporting this project');
    expect(d.timestamp).toBe(1496314658);
  });
});
