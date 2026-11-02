import { createHash } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { verifyEvent } from 'nostr-tools/pure';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LEDGER_COMMIT_KIND } from '@/lib/nostr/commitment';
import type { User } from '@/lib/types';
import { appendLedger } from '@/server/ledger';
import type { TsNode } from '@/server/ots';
import { FakeRelayNetwork } from './helpers/fakeRelay';

// The calendars are scripted: `stamp` returns a pending proof, `upgrade` adds a Bitcoin block when the test says so.
const calendar = vi.hoisted(() => ({ stamp: vi.fn(), upgrade: vi.fn() }));
vi.mock('@/server/ots', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/server/ots')>()), stamp: calendar.stamp, upgrade: calendar.upgrade }));

const MASTER = 'cc'.repeat(32);
const RELAYS = ['wss://relay-a.example', 'wss://relay-b.example', 'wss://relay-c.example'];
const PENDING_TAG = Buffer.from('83dfe30d2ef90c8e', 'hex');
const BITCOIN_TAG = Buffer.from('0588960d73d71901', 'hex');
const owner: User = { id: 'u_att', firstName: 'Invité', lastName: 'ATTEST', country: 'FR', phone: '', createdAt: new Date().toISOString(), guest: true };

let ots: typeof import('@/server/ots');
let keys: typeof import('@/server/nostr/keys');
let publisher: typeof import('@/server/nostr/publisher');
let attestation: typeof import('@/server/nostr/attestation');
let services: typeof import('@/server/services');
let db: typeof import('@/server/db');
let net: FakeRelayNetwork;

beforeAll(async () => {
  process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), 'nobpay-att-'));
  ots = await import('@/server/ots');
  keys = await import('@/server/nostr/keys');
  publisher = await import('@/server/nostr/publisher');
  attestation = await import('@/server/nostr/attestation');
  services = await import('@/server/services');
  db = await import('@/server/db');
});

/** A pending proof of `digest`, the way a calendar answers; with a block when `height` is given (merged, as upgrade() does). */
function proofOf(digest: Buffer, height?: number) {
  const uri = Buffer.from('https://alice.btc.calendar.opentimestamps.org');
  const committed = createHash('sha256').update(Buffer.concat([digest, Buffer.from('aa'.repeat(8), 'hex')])).digest();
  const attestations: TsNode['attestations'] = [{ tag: PENDING_TAG, payload: Buffer.concat([Buffer.from([uri.length]), uri]) }];
  if (height !== undefined) attestations.push({ tag: BITCOIN_TAG, payload: Buffer.from([height]) });
  const root: TsNode = { msg: digest, attestations: [], ops: [{ tag: 0xf0, arg: Buffer.from('aa'.repeat(8), 'hex'), child: { msg: Buffer.concat([digest, Buffer.from('aa'.repeat(8), 'hex')]), attestations: [], ops: [{ tag: 0x08, child: { msg: committed, attestations, ops: [] } }] } }] };
  return ots.serializeDetached({ digest, root });
}

beforeEach(async () => {
  vi.stubEnv('SESSION_SECRET', 'a-long-random-secret-of-more-than-32-characters');
  vi.stubEnv('BITNOB_MODE', 'mock');
  vi.stubEnv('NOSTR_PUBLISH', '1');
  vi.stubEnv('NOSTR_MASTER_KEY', MASTER);
  vi.stubEnv('NOSTR_RELAYS', RELAYS.join(','));
  vi.stubEnv('NOSTR_MIN_ACKS', '2');
  net = new FakeRelayNetwork();
  calendar.stamp.mockReset();
  calendar.upgrade.mockReset();
  calendar.stamp.mockImplementation(async (digest: Buffer) => ({ ots: proofOf(digest), calendar: 'https://alice.btc.calendar.opentimestamps.org' }));
  calendar.upgrade.mockImplementation(async (file: Buffer) => ({ ots: file, changed: false, status: ots.inspect(ots.parseDetached(file).root) }));
  await db.resetDb();
  await db.withDb((d) => void d.users.push({ ...owner }));
});
afterEach(() => vi.unstubAllEnvs());

const relayOpts = () => ({ WebSocketImpl: net.WebSocketImpl, timeoutMs: 500 });

/** A project whose ledger has a money event, with every commitment published. */
async function projectWithMoney() {
  const p = await services.createProject(owner, {
    name: 'Essai',
    sector: 'commerce',
    city: 'Dakar',
    budgetCents: 1_500,
    managerName: 'Moi',
    steps: [{ title: 'Seule', amountCents: 1_500, proofKinds: ['photos'] }],
  });
  await db.withDb((d) => void appendLedger(d, p.id, 'funding_paid', { amountCents: 1_500 }));
  await publisher.publishCommitments(relayOpts());
  return p;
}
const commitOf = async (projectId: string, seq: number) => (await db.readDb()).nostr!.find((c) => c.projectId === projectId && c.seq === seq)!;
const attest = (extra: { now?: number } = {}) => attestation.attestCommitments({ ...relayOpts(), ...extra });

describe('NIP-03: stamping a commitment on Bitcoin', () => {
  it('stamps the id of the commitments where money moved, and only those', async () => {
    const p = await projectWithMoney();
    expect(await attest()).toMatchObject({ stamped: 1 });
    expect(calendar.stamp).toHaveBeenCalledTimes(1);
    const money = await commitOf(p.id, 2);
    expect(calendar.stamp.mock.calls[0][0].toString('hex')).toBe(money.event.id); // the digest IS the event id
    expect(money.attest).toMatchObject({ status: 'pending', proofRelays: [] });
    expect((await commitOf(p.id, 1)).attest).toBeUndefined(); // project_created: nothing to prove on Bitcoin
  });

  it('does not stamp twice, and does not stamp what relays have not accepted', async () => {
    const p = await projectWithMoney();
    await attest();
    await attest();
    expect(calendar.stamp).toHaveBeenCalledTimes(1);
    await db.withDb((d) => {
      const c = d.nostr!.find((x) => x.projectId === p.id && x.seq === 2)!;
      c.attest = undefined;
      c.confirmedAt = undefined;
    });
    calendar.stamp.mockClear();
    await attest();
    expect(calendar.stamp).not.toHaveBeenCalled();
  });

  it('a calendar that is down changes nothing and is tried again at the next round', async () => {
    const p = await projectWithMoney();
    calendar.stamp.mockRejectedValueOnce(new Error('calendar down'));
    expect(await attest()).toMatchObject({ stamped: 0 });
    expect((await commitOf(p.id, 2)).attest).toBeUndefined();
    expect(await attest()).toMatchObject({ stamped: 1 });
  });

  it('waits for the block: no question to the calendar for five minutes, then no more than one every ten', async () => {
    const t0 = Date.now();
    await projectWithMoney();
    await attest({ now: t0 });
    await attest({ now: t0 + 60_000 });
    expect(calendar.upgrade).not.toHaveBeenCalled();
    await attest({ now: t0 + 6 * 60_000 });
    expect(calendar.upgrade).toHaveBeenCalledTimes(1);
    await attest({ now: t0 + 8 * 60_000 });
    expect(calendar.upgrade).toHaveBeenCalledTimes(1);
    await attest({ now: t0 + 17 * 60_000 });
    expect(calendar.upgrade).toHaveBeenCalledTimes(2);
    expect((await db.readDb()).nostr!.find((c) => c.attest)!.attest!.status).toBe('pending'); // no block yet
  });

  it('once a block has it, publishes a kind 1040 event: e = the stamped event, k = its kind, content = a one-attestation .ots', async () => {
    const p = await projectWithMoney();
    const t0 = Date.now();
    await attest({ now: t0 });
    const money = await commitOf(p.id, 2);
    calendar.upgrade.mockImplementation(async (file: Buffer) => {
      const upgraded = proofOf(Buffer.from(money.event.id, 'hex'), 77);
      return { ots: upgraded, changed: true, status: ots.inspect(ots.parseDetached(upgraded).root) };
    });
    expect(await attest({ now: t0 + 6 * 60_000 })).toMatchObject({ confirmed: 1, published: 1 });

    const after = (await commitOf(p.id, 2)).attest!;
    expect(after).toMatchObject({ status: 'confirmed', bitcoinBlock: 77 });
    expect(after.proofRelays.length).toBeGreaterThanOrEqual(2);

    const [proof] = net.eventsOn(RELAYS[0]).filter((e) => e.kind === attestation.OTS_KIND);
    expect(verifyEvent(proof)).toBe(true);
    expect(proof.pubkey).toBe(keys.projectPublicKey(p.id));
    expect(proof.tags).toEqual([['e', money.event.id], ['k', String(LEDGER_COMMIT_KIND)]]);
    const file = ots.parseDetached(Buffer.from(proof.content, 'base64'));
    expect(file.digest.toString('hex')).toBe(money.event.id); // the proof is about the event id
    expect(ots.inspect(file.root)).toMatchObject({ pending: [], bitcoin: [{ height: 77 }] }); // one Bitcoin attestation, nothing pending
  });

  it('a proof event that no relay accepted is sent again later, the very same event', async () => {
    const p = await projectWithMoney();
    const t0 = Date.now();
    await attest({ now: t0 });
    const money = await commitOf(p.id, 2);
    calendar.upgrade.mockImplementation(async () => {
      const upgraded = proofOf(Buffer.from(money.event.id, 'hex'), 5);
      return { ots: upgraded, changed: true, status: ots.inspect(ots.parseDetached(upgraded).root) };
    });
    for (const url of RELAYS) net.relay(url).behaviour = { refuse: 'blocked: busy' };
    expect(await attest({ now: t0 + 6 * 60_000 })).toMatchObject({ confirmed: 1, published: 0 });
    const first = (await commitOf(p.id, 2)).attest!;
    expect(first.status).toBe('confirmed');
    expect(first.proofRelays).toEqual([]);

    for (const url of RELAYS) net.relay(url).behaviour = {};
    expect(await attest({ now: t0 + 7 * 60_000 })).toMatchObject({ published: 1 });
    const again = (await commitOf(p.id, 2)).attest!;
    expect(again.proofEvent!.id).toBe(first.proofEvent!.id);
    expect(net.eventsOn(RELAYS[0]).filter((e) => e.kind === attestation.OTS_KIND)[0].id).toBe(first.proofEvent!.id);
  });

  it('is off when publishing is off, or with NOSTR_ATTEST=0', async () => {
    await projectWithMoney();
    vi.stubEnv('NOSTR_ATTEST', '0');
    expect(await attest()).toEqual({ stamped: 0, confirmed: 0, published: 0 });
    vi.stubEnv('NOSTR_ATTEST', '');
    vi.stubEnv('NOSTR_PUBLISH', '');
    expect(await attest()).toEqual({ stamped: 0, confirmed: 0, published: 0 });
    expect(calendar.stamp).not.toHaveBeenCalled();
  });

  it('the owner sees how many are stamped and how many wait for a block', async () => {
    const p = await projectWithMoney();
    await attest();
    expect(await publisher.nostrStatus(p.id)).toMatchObject({ attested: 0, attestWaiting: 1 });
  });
});
