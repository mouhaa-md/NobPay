import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { finalizeEvent, generateSecretKey, getPublicKey, type Event } from 'nostr-tools/pure';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bindingOf,
  commitmentTemplate,
  compareCommitments,
  LEDGER_COMMIT_KIND,
  parseCommitment,
  relaysToAsk,
  verifyOnRelays,
} from '@/lib/nostr/commitment';
import { fetchFromRelay, publishToRelay, relayUrlProblem, RelayError } from '@/lib/nostr/relayClient';
import type { LedgerEvent, User } from '@/lib/types';
import { appendLedger } from '@/server/ledger';
import { FakeRelayNetwork } from './helpers/fakeRelay';

const MASTER_A = 'aa'.repeat(32);
const MASTER_B = 'bb'.repeat(32);
const RELAYS = ['wss://relay-a.example', 'wss://relay-b.example', 'wss://relay-c.example'];

let keys: typeof import('@/server/nostr/keys');
let publisher: typeof import('@/server/nostr/publisher');
let services: typeof import('@/server/services');
let db: typeof import('@/server/db');
let net: FakeRelayNetwork;

const owner: User = { id: 'u_nostr', firstName: 'Invité', lastName: 'NOSTR', country: 'FR', phone: '', createdAt: new Date().toISOString(), guest: true };

beforeAll(async () => {
  process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), 'nobpay-nostr-'));
  keys = await import('@/server/nostr/keys');
  publisher = await import('@/server/nostr/publisher');
  services = await import('@/server/services');
  db = await import('@/server/db');
});

beforeEach(async () => {
  vi.stubEnv('SESSION_SECRET', 'a-long-random-secret-of-more-than-32-characters');
  vi.stubEnv('BITNOB_MODE', 'mock');
  vi.stubEnv('NOSTR_PUBLISH', '1');
  vi.stubEnv('NOSTR_MASTER_KEY', MASTER_A);
  vi.stubEnv('NOSTR_RELAYS', RELAYS.join(','));
  vi.stubEnv('NOSTR_MIN_ACKS', '2');
  net = new FakeRelayNetwork();
  await db.resetDb();
  await db.withDb((d) => void d.users.push({ ...owner }));
});
afterEach(() => vi.unstubAllEnvs());

/** A chain of `n` ledger events, built the way the application builds it. */
function chain(n: number, ageMs = 60 * 60_000): LedgerEvent[] {
  const store: Pick<{ ledger: LedgerEvent[] }, 'ledger'> = { ledger: [] };
  for (let i = 0; i < n; i++) appendLedger(store, 'p_x', 'funding_paid', { i }, new Date(Date.now() - ageMs + i * 1000).toISOString());
  return store.ledger;
}
const signer = () => {
  const sk = generateSecretKey();
  return { sk, pk: getPublicKey(sk) };
};
const commit = (e: LedgerEvent, sk: Uint8Array) => finalizeEvent(commitmentTemplate(e), sk);
const asMap = (entries: Record<string, Event[]>) => new Map(Object.entries(entries));

async function newProject() {
  return services.createProject(owner, {
    name: 'Essai Nostr',
    sector: 'commerce',
    city: 'Dakar',
    budgetCents: 1_500,
    managerName: 'Moi',
    steps: [{ title: 'Seule étape', amountCents: 1_500, proofKinds: ['photos'] }],
  });
}
const publish = (extra: { now?: number; relays?: string[] } = {}) => publisher.publishCommitments({ WebSocketImpl: net.WebSocketImpl, timeoutMs: 500, ...extra });

describe('relay addresses', () => {
  it.each(['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.example:443/path'])('accepts %s', (url) => {
    expect(relayUrlProblem(url)).toBeNull();
  });
  it.each(['ws://relay.example', 'https://relay.example', 'wss://user:pw@relay.example', 'wss://relay.example:9000', 'wss://127.0.0.1', 'wss://10.0.0.5', 'wss://[::1]', 'wss://localhost', 'wss://relay', 'wss://relay.local', 'wss://db.internal', 'nope', ''])('refuses %j', (url) => {
    expect(relayUrlProblem(url)).not.toBeNull();
  });
  it('opens ws://localhost only for development', () => {
    expect(relayUrlProblem('ws://localhost:7777', true)).toBeNull();
    expect(relayUrlProblem('ws://localhost:7777')).not.toBeNull();
    expect(relayUrlProblem('ws://10.0.0.5', true)).not.toBeNull();
  });
  it('relaysToAsk: the project\'s relays first, then the defaults, only usable ones, no duplicates, at most six', () => {
    const asked = relaysToAsk(['wss://mine.example', 'ws://insecure.example', 'wss://nos.lol', 'wss://a.example', 'wss://b.example', 'wss://c.example']);
    expect(asked[0]).toBe('wss://mine.example');
    expect(asked).not.toContain('ws://insecure.example');
    expect(new Set(asked).size).toBe(asked.length);
    expect(asked.length).toBeLessThanOrEqual(6);
  });
});

describe('a commitment', () => {
  it('carries only the position and the two hashes: no name, no amount, no type', () => {
    const [e] = chain(1);
    const t = commitmentTemplate(e);
    expect(t.kind).toBe(LEDGER_COMMIT_KIND);
    expect(JSON.parse(t.content)).toEqual({ v: 1, seq: 1, hash: e.hash, prev: e.prevHash });
    expect(t.created_at).toBe(Math.floor(Date.parse(e.at) / 1000));
    expect(t.content).not.toMatch(/funding|amount|name/i);
  });

  it('reads back, and refuses what is not one', () => {
    const [e] = chain(1);
    expect(parseCommitment({ kind: LEDGER_COMMIT_KIND, content: commitmentTemplate(e).content })).toEqual({ seq: 1, hash: e.hash, prev: e.prevHash });
    for (const content of ['', 'null', '[]', '{}', '{"v":2,"seq":1}', JSON.stringify({ v: 1, seq: 0, hash: e.hash, prev: e.prevHash }), JSON.stringify({ v: 1, seq: 1.5, hash: e.hash, prev: e.prevHash }), JSON.stringify({ v: 1, seq: 1, hash: 'xyz', prev: e.prevHash })]) {
      expect(parseCommitment({ kind: LEDGER_COMMIT_KIND, content })).toBeNull();
    }
    expect(parseCommitment({ kind: 1, content: commitmentTemplate(e).content })).toBeNull();
  });

  it('the project\'s key is read from the first ledger event', () => {
    const pubkey = 'ab'.repeat(32);
    expect(bindingOf({ nostr: { pubkey, kind: LEDGER_COMMIT_KIND, relays: ['wss://a.example'] } })).toEqual({ pubkey, kind: LEDGER_COMMIT_KIND, relays: ['wss://a.example'] });
    for (const data of [undefined, {}, { nostr: {} }, { nostr: { pubkey: 'short' } }, { nostr: { pubkey: 'AB'.repeat(32) } }]) expect(bindingOf(data)).toBeNull();
  });
});

describe('comparing a ledger with what relays published', () => {
  it('confirms every position and counts the relays that have it', () => {
    const ledger = chain(3);
    const { sk, pk } = signer();
    const all = ledger.map((e) => commit(e, sk));
    const r = compareCommitments(ledger, pk, asMap({ a: all, b: all.slice(0, 2) }));
    expect(r.perSeq).toEqual([
      { seq: 1, state: 'confirmed', relays: 2 },
      { seq: 2, state: 'confirmed', relays: 2 },
      { seq: 3, state: 'confirmed', relays: 1 },
    ]);
    expect(r.conflicts).toEqual([]);
  });

  it('an old position no relay has is missing, a fresh one is only pending', () => {
    const old = chain(2, 60 * 60_000);
    const fresh = chain(2, 10_000);
    const { pk } = signer();
    expect(compareCommitments(old, pk, asMap({ a: [] })).perSeq.map((p) => p.state)).toEqual(['missing', 'missing']);
    expect(compareCommitments(fresh, pk, asMap({ a: [] })).perSeq.map((p) => p.state)).toEqual(['pending', 'pending']);
  });

  it('a signed commitment that says something else for the same position is a conflict, even next to the right one', () => {
    const ledger = chain(2);
    const forged = chain(2).map((e) => ({ ...e, hash: 'ee'.repeat(32) })); // a rewritten history
    const { sk, pk } = signer();
    const r = compareCommitments(ledger, pk, asMap({ a: [commit(ledger[0], sk), commit(ledger[1], sk)], b: [commit(forged[1], sk)] }));
    expect(r.perSeq[1].state).toBe('conflict');
    expect(r.perSeq[0].state).toBe('confirmed');
    expect(r.conflicts).toEqual([{ seq: 2, ledgerHash: ledger[1].hash, relayHash: 'ee'.repeat(32) }]);
  });

  it('ignores events signed by someone else, and drops events whose signature is not valid', () => {
    const ledger = chain(2);
    const { sk, pk } = signer();
    const stranger = generateSecretKey();
    const good = commit(ledger[0], sk);
    // a valid-looking signature of another event. Through JSON, like an event coming from a relay: a copy made with `...`
    // would keep the "already verified" mark nostr-tools sets on the objects it signs itself.
    const tampered = JSON.parse(JSON.stringify({ ...commit(ledger[1], sk), sig: good.sig })) as Event;
    const r = compareCommitments(ledger, pk, asMap({ a: [good, commit(ledger[1], stranger), tampered] }));
    expect(r.perSeq.map((p) => p.state)).toEqual(['confirmed', 'missing']);
    expect(r.invalid).toBe(1); // the tampered one; the stranger's event is not ours to judge
  });

  it('knows about positions beyond a shorter ledger, and checks that the next one continues from its head', () => {
    const full = chain(4);
    const shorter = full.slice(0, 3);
    const { sk, pk } = signer();
    const published = full.map((e) => commit(e, sk));
    const r = compareCommitments(shorter, pk, asMap({ a: published }));
    expect(r.beyond).toBe(1);
    expect(r.continuity).toBe(true);
    const other = chain(4).map((e) => ({ ...e }));
    other[3] = { ...other[3], prevHash: 'cd'.repeat(32) }; // position 4 does not continue from position 3
    const broken = compareCommitments(shorter, pk, asMap({ a: [...published.slice(0, 3), commit(other[3], sk)] }));
    expect(broken.continuity).toBe(false);
  });
});

describe('talking to a relay', () => {
  it('publishes and reads back', async () => {
    const [e] = chain(1);
    const { sk, pk } = signer();
    const ev = commit(e, sk);
    const url = 'wss://relay-a.example';
    expect(await publishToRelay(url, ev, { WebSocketImpl: net.WebSocketImpl, timeoutMs: 500 })).toEqual({ ok: true, detail: '' });
    expect(await fetchFromRelay(url, { kinds: [LEDGER_COMMIT_KIND], authors: [pk] }, { WebSocketImpl: net.WebSocketImpl, timeoutMs: 500 })).toHaveLength(1);
  });

  it('a relay that already has the event counts as having accepted it', async () => {
    const [e] = chain(1);
    const ev = commit(e, generateSecretKey());
    const opts = { WebSocketImpl: net.WebSocketImpl, timeoutMs: 500 };
    await publishToRelay('wss://relay-a.example', ev, opts);
    expect(await publishToRelay('wss://relay-a.example', ev, opts)).toMatchObject({ ok: true });
  });

  it('reports a refusal, a silent relay and an unreachable one without throwing', async () => {
    const [e] = chain(1);
    const ev = commit(e, generateSecretKey());
    net.relay('wss://refuses.example').behaviour = { refuse: 'blocked: kind not allowed' };
    net.relay('wss://silent.example').behaviour = { silent: true };
    net.relay('wss://down.example').behaviour = { down: true };
    const opts = { WebSocketImpl: net.WebSocketImpl, timeoutMs: 200 };
    expect(await publishToRelay('wss://refuses.example', ev, opts)).toEqual({ ok: false, detail: 'blocked: kind not allowed' });
    expect(await publishToRelay('wss://silent.example', ev, opts)).toMatchObject({ ok: false, detail: expect.stringContaining('pas de réponse') });
    expect(await publishToRelay('wss://down.example', ev, opts)).toMatchObject({ ok: false, detail: expect.stringContaining('injoignable') });
  });

  it('reading throws a typed error when the relay cannot be used', async () => {
    net.relay('wss://down.example').behaviour = { down: true };
    net.relay('wss://silent.example').behaviour = { silent: true };
    net.relay('wss://auth.example').behaviour = { closeReads: 'auth-required: sign in' };
    const opts = { WebSocketImpl: net.WebSocketImpl, timeoutMs: 200 };
    await expect(fetchFromRelay('wss://down.example', {}, opts)).rejects.toMatchObject({ name: 'RelayError', code: 'unreachable' });
    await expect(fetchFromRelay('wss://silent.example', {}, opts)).rejects.toMatchObject({ code: 'timeout' });
    await expect(fetchFromRelay('wss://auth.example', {}, opts)).rejects.toMatchObject({ code: 'refused' });
    await expect(fetchFromRelay('wss://down.example', {}, opts)).rejects.toBeInstanceOf(RelayError);
  });
});

describe('the keys of the projects', () => {
  it('are the same every time, differ per project and per master key, and are valid keys', () => {
    const a1 = keys.projectPublicKey('p_one');
    expect(keys.projectPublicKey('p_one')).toBe(a1);
    expect(a1).toMatch(/^[0-9a-f]{64}$/);
    expect(keys.projectPublicKey('p_two')).not.toBe(a1);
    vi.stubEnv('NOSTR_MASTER_KEY', MASTER_B);
    expect(keys.projectPublicKey('p_one')).not.toBe(a1);
  });

  it('are derived from SESSION_SECRET when there is no master key (and change with it)', () => {
    vi.stubEnv('NOSTR_MASTER_KEY', '');
    const first = keys.projectPublicKey('p_one');
    expect(keys.projectPublicKey('p_one')).toBe(first);
    vi.stubEnv('SESSION_SECRET', 'another-long-random-secret-of-more-than-32-chars');
    expect(keys.projectPublicKey('p_one')).not.toBe(first);
  });

  it('the master key must be 64 hexadecimal characters, or absent', () => {
    expect(keys.masterKeyProblem(undefined)).toBeNull();
    expect(keys.masterKeyProblem('')).toBeNull();
    expect(keys.masterKeyProblem(MASTER_A)).toBeNull();
    for (const bad of ['abc', 'zz'.repeat(32), 'aa'.repeat(31)]) expect(keys.masterKeyProblem(bad)).toMatch(/64/);
  });

  it('configured relays: the list, or the defaults; unusable addresses dropped', () => {
    expect(keys.configuredRelays()).toEqual(RELAYS);
    vi.stubEnv('NOSTR_RELAYS', 'ws://insecure.example, wss://ok.example');
    expect(keys.configuredRelays()).toEqual(['wss://ok.example']);
    vi.stubEnv('NOSTR_RELAYS', '');
    expect(keys.configuredRelays()).toContain('wss://relay.damus.io');
  });
});

describe('publishing the commitments of a real project', () => {
  it('names the project key in the first ledger event, so the chain (and its Bitcoin anchor) commits to it', async () => {
    const p = await newProject();
    const first = (await db.readDb()).ledger.find((e) => e.projectId === p.id && e.seq === 1)!;
    expect(first.data.nostr).toEqual({ pubkey: keys.projectPublicKey(p.id), kind: LEDGER_COMMIT_KIND, relays: RELAYS });
  });

  it('does nothing, and names no key, when publishing is off', async () => {
    vi.stubEnv('NOSTR_PUBLISH', '');
    const p = await newProject();
    expect((await db.readDb()).ledger.find((e) => e.projectId === p.id)!.data.nostr).toBeUndefined();
    expect(await publish()).toEqual({ attempted: 0, confirmed: 0 });
    expect(net.relay(RELAYS[0]).received).toBe(0);
  });

  it('sends each event to every relay, once, and remembers it', async () => {
    const p = await newProject();
    expect(await publish()).toEqual({ attempted: 1, confirmed: 1 });
    for (const url of RELAYS) expect(net.eventsOn(url)).toHaveLength(1);
    const rec = (await db.readDb()).nostr![0];
    expect(rec).toMatchObject({ projectId: p.id, seq: 1, attempts: 1, relays: RELAYS });
    expect(rec.confirmedAt).toBeTruthy();
    expect(rec.event.pubkey).toBe(keys.projectPublicKey(p.id));
    expect(await publish()).toEqual({ attempted: 0, confirmed: 0 }); // nothing new: no traffic
    expect(net.relay(RELAYS[0]).received).toBe(1);
  });

  it('follows the ledger: a new event is published at the next round', async () => {
    const p = await newProject();
    await publish();
    await db.withDb((d) => void appendLedger(d, p.id, 'funding_paid', { amountCents: 1_500 }));
    expect(await publish()).toEqual({ attempted: 1, confirmed: 1 });
    expect(net.eventsOn(RELAYS[0]).map((e) => JSON.parse(e.content).seq)).toEqual([1, 2]);
  });

  it('counts as published once two relays have it; the third is not chased afterwards', async () => {
    await newProject();
    net.relay(RELAYS[2]).behaviour = { refuse: 'rate-limited: slow down' };
    const t0 = Date.now();
    expect(await publish({ now: t0 })).toEqual({ attempted: 1, confirmed: 1 });
    let rec = (await db.readDb()).nostr![0];
    expect(rec.relays).toEqual(RELAYS.slice(0, 2));
    expect(rec.confirmedAt).toBeTruthy();

    // confirmed: the third relay is not chased any more
    net.relay(RELAYS[2]).behaviour = {};
    expect(await publish({ now: t0 + 3_600_000 })).toEqual({ attempted: 0, confirmed: 0 });
    rec =(await db.readDb()).nostr![0];
    expect(rec.relays).toHaveLength(2);
  });

  it('when too few relays answer, it is not confirmed, the reasons are kept, and it is retried after a pause', async () => {
    await newProject();
    net.relay(RELAYS[0]).behaviour = { down: true };
    net.relay(RELAYS[1]).behaviour = { refuse: 'blocked: not on the allow list' };
    net.relay(RELAYS[2]).behaviour = { silent: true };
    const t0 = Date.now();
    expect(await publish({ now: t0 })).toEqual({ attempted: 1, confirmed: 0 });
    let rec = (await db.readDb()).nostr![0];
    expect(rec.confirmedAt).toBeUndefined();
    expect(rec.relays).toEqual([]);
    expect(rec.lastError).toContain('relay-b.example: blocked: not on the allow list');
    const firstId = rec.event.id;

    expect(await publish({ now: t0 + 1_000 })).toEqual({ attempted: 0, confirmed: 0 }); // too soon

    net.relay(RELAYS[0]).behaviour = {};
    net.relay(RELAYS[1]).behaviour = {};
    expect(await publish({ now: t0 + 120_000 })).toEqual({ attempted: 1, confirmed: 1 });
    rec = (await db.readDb()).nostr![0];
    expect(rec.attempts).toBe(2);
    expect(rec.event.id).toBe(firstId);
    expect(net.eventsOn(RELAYS[0])[0].id).toBe(firstId);
  });

  it('the published event verifies, is signed by the project key, and says what the ledger says', async () => {
    const p = await newProject();
    await publish();
    const [ev] = net.eventsOn(RELAYS[0]);
    const { verifyEvent } = await import('nostr-tools/pure');
    expect(verifyEvent(ev)).toBe(true);
    expect(ev.pubkey).toBe(keys.projectPublicKey(p.id));
    const first = (await db.readDb()).ledger.find((e) => e.projectId === p.id)!;
    expect(parseCommitment(ev)).toEqual({ seq: 1, hash: first.hash, prev: first.prevHash });
  });

  it('a project created before commitments existed is left alone', async () => {
    vi.stubEnv('NOSTR_PUBLISH', '');
    await newProject();
    vi.stubEnv('NOSTR_PUBLISH', '1');
    expect(await publish()).toEqual({ attempted: 0, confirmed: 0 });
  });

  it('a master key that changed since the project was created is reported, not used to sign under another key', async () => {
    await newProject();
    vi.stubEnv('NOSTR_MASTER_KEY', MASTER_B);
    expect(await publish()).toEqual({ attempted: 0, confirmed: 0 });
    expect(net.relay(RELAYS[0]).received).toBe(0);
  });

  it('reports its progress to the owner', async () => {
    const p = await newProject();
    expect(await publisher.nostrStatus(p.id)).toMatchObject({ enabled: true, total: 1, confirmed: 0, kind: LEDGER_COMMIT_KIND, pubkey: keys.projectPublicKey(p.id) });
    await publish();
    expect(await publisher.nostrStatus(p.id)).toMatchObject({ total: 1, confirmed: 1 });
  });
});

describe('a project whose key no longer matches', () => {
  it('is skipped, and the alarm is raised once an hour rather than at every round (it runs every few seconds)', async () => {
    publisher.resetKeyAlarmsForTests();
    const p = await newProject();
    vi.stubEnv('NOSTR_MASTER_KEY', MASTER_B); // the key of the project is no longer the one the ledger names
    const lines: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((l) => void lines.push(String(l)));
    const t0 = Date.now();
    for (let i = 0; i < 5; i++) await publish({ now: t0 + i * 2_000 });
    expect(lines.filter((l) => l.includes('nostr_key_mismatch'))).toHaveLength(1);
    await publish({ now: t0 + 61 * 60_000 });
    expect(lines.filter((l) => l.includes('nostr_key_mismatch'))).toHaveLength(2);
    expect((await db.readDb()).nostr ?? []).toHaveLength(0); // nothing was signed under another key
    expect(p.id).toBeTruthy();
    vi.restoreAllMocks();
  });
});

describe('verifying a ledger on the relays, as a visitor would', () => {
  const verify = async (projectId: string, extra: { now?: number; relays?: string[] } = {}) => {
    const d = await db.readDb();
    const ledger = d.ledger.filter((e) => e.projectId === projectId).sort((a, b) => a.seq - b.seq);
    return verifyOnRelays(ledger, { WebSocketImpl: net.WebSocketImpl, timeoutMs: 500, relays: RELAYS, ...extra });
  };

  it('asks the project\'s relays and the well-known ones when nothing says otherwise', async () => {
    const p = await newProject();
    await publish();
    const d = await db.readDb();
    const ledger = d.ledger.filter((e) => e.projectId === p.id);
    const r = await verifyOnRelays(ledger, { WebSocketImpl: net.WebSocketImpl, timeoutMs: 500 });
    expect(r.relays.map((x) => x.url)).toEqual([...RELAYS, 'wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.primal.net']);
    expect(r.state).toBe('confirmed');
  });

  it('confirms a ledger that was published', async () => {
    const p = await newProject();
    await publish();
    const r = await verify(p.id);
    expect(r).toMatchObject({ state: 'confirmed', confirmed: 1, total: 1, pubkey: keys.projectPublicKey(p.id) });
    expect(r.relays.map((x) => x.ok)).toEqual([true, true, true]);
    expect(r.comparison!.perSeq[0]).toEqual({ seq: 1, state: 'confirmed', relays: 3 });
  });

  it('says "partial" when a commitment is on no relay (an omission), once it is old enough to be missed', async () => {
    const p = await newProject();
    const later = Date.now() + 10 * 60_000;
    const r = await verify(p.id, { now: later });
    expect(r.state).toBe('partial');
    expect(r.comparison!.perSeq[0].state).toBe('missing');
    expect((await verify(p.id)).comparison!.perSeq[0].state).toBe('pending'); // a minute-old event is just on its way
  });

  it('raises the alarm when the operator\'s ledger differs from what was published', async () => {
    const p = await newProject();
    await publish();
    await db.withDb((d) => {
      const e = d.ledger.find((x) => x.projectId === p.id && x.seq === 1)!;
      e.hash = 'ff'.repeat(32); // a rewritten history
    });
    const r = await verify(p.id);
    expect(r.state).toBe('conflict');
    expect(r.comparison!.conflicts).toHaveLength(1);
  });

  it('keeps working with some relays down, and says which', async () => {
    const p = await newProject();
    await publish();
    net.relay(RELAYS[0]).behaviour = { down: true };
    net.relay(RELAYS[1]).behaviour = { closeReads: 'auth-required' };
    const r = await verify(p.id);
    expect(r.state).toBe('confirmed');
    expect(r.relays.map((x) => x.ok)).toEqual([false, false, true]);
    expect(r.comparison!.perSeq[0].relays).toBe(1);
  });

  it('a commitment found on one relay only, while others answered without it, is not called replicated', async () => {
    const p = await newProject();
    await publish({ relays: [RELAYS[0]] }); // as if the other relays had refused it
    const r = await verify(p.id);
    expect(r.comparison!.perSeq[0]).toEqual({ seq: 1, state: 'confirmed', relays: 1 });
    expect(r).toMatchObject({ state: 'partial', confirmed: 1, thin: 1 });
    // with the relays that answer reduced to that one, nothing more can be asked of the others
    net.relay(RELAYS[1]).behaviour = { down: true };
    net.relay(RELAYS[2]).behaviour = { down: true };
    expect(await verify(p.id)).toMatchObject({ state: 'confirmed', thin: 0 });
  });

  it('is "unreachable" when no relay answers, and "none" for a project that never used Nostr', async () => {
    const p = await newProject();
    await publish();
    for (const url of RELAYS) net.relay(url).behaviour = { down: true };
    expect((await verify(p.id)).state).toBe('unreachable');

    vi.stubEnv('NOSTR_PUBLISH', '');
    const plain = await newProject();
    expect((await verify(plain.id)).state).toBe('none');
  });
});
