import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { inspect, isTrustedCalendar, parseDetached, serializeDetached, upgrade, type TsNode } from '@/server/ots';

const varUint = (n: number) => Buffer.from([n]); // enough for short values in tests
const sha256 = (b: Buffer) => createHash('sha256').update(b).digest();

describe('OpenTimestamps file format', () => {
  const digest = sha256(Buffer.from('dossier'));
  const nonce = Buffer.from('aa'.repeat(16), 'hex');
  const appended = Buffer.concat([digest, nonce]);
  const committed = sha256(appended);
  const uri = Buffer.from('https://alice.btc.calendar.opentimestamps.org');

  const leaf: TsNode = {
    msg: committed,
    attestations: [{ tag: Buffer.from('83dfe30d2ef90c8e', 'hex'), payload: Buffer.concat([varUint(uri.length), uri]) }],
    ops: [],
  };
  const root: TsNode = {
    msg: digest,
    attestations: [],
    ops: [{ tag: 0xf0, arg: nonce, child: { msg: appended, attestations: [], ops: [{ tag: 0x08, child: leaf }] } }],
  };

  it('round-trips a pending timestamp and finds the commitment sent to the calendar', () => {
    const file = serializeDetached({ digest, root });
    const parsed = parseDetached(file);
    expect(parsed.digest.equals(digest)).toBe(true);
    const status = inspect(parsed.root);
    expect(status.bitcoin).toHaveLength(0);
    expect(status.pending).toEqual([{ uri: uri.toString(), commitment: committed.toString('hex') }]);
  });

  it('starts with the standard OpenTimestamps magic header', () => {
    const file = serializeDetached({ digest, root });
    expect(file.subarray(0, 15).toString('latin1')).toBe('\u0000OpenTimestamps');
  });

  it('reads a Bitcoin attestation (block height)', () => {
    const withBitcoin: TsNode = {
      msg: committed,
      attestations: [{ tag: Buffer.from('0588960d73d71901', 'hex'), payload: Buffer.from([0xd2, 0x86, 0x3b]) }], // LEB128 varuint = 967 506
      ops: [],
    };
    const file = serializeDetached({ digest, root: { ...root, ops: [{ ...root.ops[0], child: { ...root.ops[0].child, ops: [{ tag: 0x08, child: withBitcoin }] } }] } });
    const status = inspect(parseDetached(file).root);
    expect(status.bitcoin).toEqual([{ height: 0x52 + (0x06 << 7) + (0x3b << 14), commitment: committed.toString('hex') }]);
  });

  it('refuses files that are not .ots', () => {
    expect(() => parseDetached(Buffer.from('hello'))).toThrow();
  });
});

describe('calendars named inside a file are not blindly followed (SSRF)', () => {
  afterEach(() => vi.unstubAllGlobals());

  const pendingFile = (uriText: string) => {
    const digest = sha256(Buffer.from('dossier'));
    const uri = Buffer.from(uriText);
    const leaf: TsNode = { msg: digest, attestations: [{ tag: Buffer.from('83dfe30d2ef90c8e', 'hex'), payload: Buffer.concat([varUint(uri.length), uri]) }], ops: [] };
    return serializeDetached({ digest, root: leaf });
  };

  it.each([
    ['https://alice.btc.calendar.opentimestamps.org', true],
    ['https://alice.btc.calendar.opentimestamps.org/', true],
    ['https://finney.calendar.eternitywall.com', true],
    ['http://alice.btc.calendar.opentimestamps.org', false], // not https
    ['https://alice.btc.calendar.opentimestamps.org.evil.example', false],
    ['https://evil.example/alice.btc.calendar.opentimestamps.org', false],
    ['https://user:pw@alice.btc.calendar.opentimestamps.org', false],
    ['http://169.254.169.254/latest/meta-data', false],
    ['http://localhost:3000', false],
    ['not a url', false],
  ])('%s -> %s', (uri, ok) => {
    expect(isTrustedCalendar(uri)).toBe(ok);
  });

  it('never calls a host that is not one of ours, and still asks the real calendars', async () => {
    const fetchMock = vi.fn(async (_url: string) => new Response('', { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);
    await upgrade(pendingFile('http://169.254.169.254/latest/meta-data'));
    expect(fetchMock).not.toHaveBeenCalled();
    await upgrade(pendingFile('https://bob.btc.calendar.opentimestamps.org'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/^https:\/\/bob\.btc\.calendar\.opentimestamps\.org\/timestamp\//);
  });
});
