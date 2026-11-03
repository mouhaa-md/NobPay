import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LedgerEvent, User } from '@/lib/types';

vi.mock('next/headers', () => ({ cookies: () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }) }));

let push: typeof import('@/server/push');
let witness: typeof import('@/server/witness');
let managerToken: typeof import('@/server/managerToken');
let ledger: typeof import('@/server/ledger');
let db: typeof import('@/server/db');

const STRONG = 'a-long-random-secret-of-more-than-32-characters';
const PROJECT = 'p_villa';
const KEY = `B${'a'.repeat(86)}`;
const AUTH = 'a'.repeat(22);
let owner: User;

const endpoint = (n: number, host = 'fcm.googleapis.com') => `https://${host}/fcm/send/device-${n}`;
const sub = (n: number, host?: string) => ({ endpoint: endpoint(n, host), p256dh: KEY, auth: AUTH });

type Sent = { endpoint: string; notice: { title: string; body: string; url: string; tag: string } };
let sent: Sent[];
let failWith: ((endpoint: string) => unknown) | null;

beforeAll(async () => {
  process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), 'nobpay-push-'));
  push = await import('@/server/push');
  witness = await import('@/server/witness');
  managerToken = await import('@/server/managerToken');
  ledger = await import('@/server/ledger');
  db = await import('@/server/db');
});
beforeEach(async () => {
  vi.stubEnv('SESSION_SECRET', STRONG);
  vi.stubEnv('BITNOB_MODE', 'mock');
  vi.stubEnv('ALLOW_DEMO', '');
  vi.stubEnv('RATE_LIMIT', '0');
  vi.stubEnv('VAPID_PUBLIC_KEY', 'public-key-for-the-test');
  vi.stubEnv('VAPID_PRIVATE_KEY', 'private-key-for-the-test');
  vi.stubEnv('PUSH', '');
  await db.resetDb();
  owner = (await db.readDb()).users.find((u) => u.id === 'u_aminata')!;
  sent = [];
  failWith = null;
  push.setPushSenderForTests(async (s, payload) => {
    const err = failWith?.(s.endpoint);
    if (err) throw err;
    sent.push({ endpoint: s.endpoint, notice: JSON.parse(payload) });
  });
});
afterEach(() => {
  push.setPushSenderForTests(null);
  vi.unstubAllEnvs();
});

const project = async () => (await db.readDb()).projects.find((p) => p.id === PROJECT)!;
const managerScope = async () => ({ kind: 'manager' as const, token: managerToken.managerLinkToken(await project()) });
const witnessScope = async () => {
  const { token } = await witness.inviteWitness(owner, PROJECT, { name: 'Ibrahima', required: false });
  return { kind: 'witness' as const, token };
};
/** A fresh ledger event of the project, as the application would write one. */
const happen = (type: LedgerEvent['type'], data: Record<string, unknown>) =>
  db.withDb((d) => void ledger.appendLedger(d, PROJECT, type, data));

describe('which push addresses are accepted', () => {
  it.each([
    ['https://fcm.googleapis.com/fcm/send/abc'],
    ['https://updates.push.services.mozilla.com/wpush/v2/abc'],
    ['https://web.push.apple.com/abc'],
    ['https://wns2-par02p.notify.windows.com/w/?token=abc'],
  ])('accepts %s', (url) => {
    expect(push.subscriptionProblem({ endpoint: url, p256dh: KEY, auth: AUTH })).toBeNull();
  });

  it.each([
    ['http://fcm.googleapis.com/x', 'not https'],
    ['https://169.254.169.254/latest', 'an IP address'],
    ['https://localhost/x', 'localhost'],
    ['https://internal.corp/x', 'a private name'],
    ['https://evil.example/x', 'another domain'],
    ['https://fcm.googleapis.com.evil.example/x', 'a look-alike domain'],
    ['https://evil.example/fcm.googleapis.com', 'the name only in the path'],
    ['https://user:pw@fcm.googleapis.com/x', 'credentials'],
    ['https://fcm.googleapis.com:8443/x', 'another port'],
    ['not a url', 'garbage'],
  ])('refuses %s (%s): the server would be made to call it', (url) => {
    expect(push.subscriptionProblem({ endpoint: url, p256dh: KEY, auth: AUTH })).not.toBeNull();
  });

  it('refuses keys that are not what a browser gives', () => {
    const ok = endpoint(1);
    for (const bad of [{ p256dh: 'short', auth: AUTH }, { p256dh: KEY, auth: 'x' }, { p256dh: `${KEY}!`, auth: AUTH }, { p256dh: KEY, auth: `${AUTH}=` }]) {
      expect(push.subscriptionProblem({ endpoint: ok, ...bad })).not.toBeNull();
    }
  });
});

describe('subscribing', () => {
  it('is off unless the instance has its keys (or has switched it off)', async () => {
    vi.stubEnv('VAPID_PRIVATE_KEY', '');
    await expect(push.subscribePush({ kind: 'owner', user: owner }, sub(1), 'fr')).rejects.toMatchObject({ status: 409, code: 'push_disabled' });
    vi.stubEnv('VAPID_PRIVATE_KEY', 'k');
    vi.stubEnv('PUSH', '0');
    await expect(push.subscribePush({ kind: 'owner', user: owner }, sub(1), 'fr')).rejects.toMatchObject({ code: 'push_disabled' });
  });

  it('works for the funder, for the field link and for the witness link, and for no other link', async () => {
    await push.subscribePush({ kind: 'owner', user: owner }, sub(1), 'fr');
    await push.subscribePush(await managerScope(), sub(2), 'fr');
    await push.subscribePush(await witnessScope(), sub(3), 'en');
    const subs = (await db.readDb()).pushSubs!;
    expect(subs.map((s) => s.role).sort()).toEqual(['manager', 'owner', 'witness']);
    expect(subs.find((s) => s.role === 'owner')).toMatchObject({ userId: owner.id });
    expect(subs.find((s) => s.role === 'manager')).toMatchObject({ projectId: PROJECT });
    await expect(push.subscribePush({ kind: 'manager', token: 'p_villa.1.1.deadbeef' }, sub(4), 'fr')).rejects.toMatchObject({ status: 404, code: 'bad_link' });
    await expect(push.subscribePush({ kind: 'witness', token: (await managerScope()).token }, sub(4), 'fr')).rejects.toMatchObject({ code: 'bad_link' }); // the field link is not the witness's
    await expect(push.subscribePush({ kind: 'owner', user: owner }, sub(5, 'evil.example'), 'fr')).rejects.toMatchObject({ status: 400 });
  });

  it('the same browser twice is one subscription (its keys are refreshed); at most five devices per account, the oldest leaves', async () => {
    await push.subscribePush({ kind: 'owner', user: owner }, sub(1), 'fr');
    await push.subscribePush({ kind: 'owner', user: owner }, { ...sub(1), auth: 'b'.repeat(22) }, 'en');
    let subs = (await db.readDb()).pushSubs!;
    expect(subs).toHaveLength(1);
    expect(subs[0]).toMatchObject({ auth: 'b'.repeat(22), lang: 'en' });
    for (let n = 2; n <= 6; n++) {
      await new Promise((r) => setTimeout(r, 2)); // distinct creation times
      await push.subscribePush({ kind: 'owner', user: owner }, sub(n), 'fr');
    }
    subs = (await db.readDb()).pushSubs!;
    expect(subs).toHaveLength(5);
    expect(subs.some((s) => s.endpoint === endpoint(1))).toBe(false);
  });

  it('can be undone, and only by the one it belongs to', async () => {
    await push.subscribePush({ kind: 'owner', user: owner }, sub(1), 'fr');
    const other: User = { ...owner, id: 'u_other', demo: undefined };
    await push.unsubscribePush({ kind: 'owner', user: other }, endpoint(1));
    expect((await db.readDb()).pushSubs).toHaveLength(1);
    await push.unsubscribePush({ kind: 'owner', user: owner }, endpoint(1));
    expect((await db.readDb()).pushSubs).toHaveLength(0);
  });
});

describe('what the ledger announces, and to whom', () => {
  it('a proof: the funder and the witness; a family contribution: the funder, and the field team once a step is open', async () => {
    const p = await project();
    const ev = (type: LedgerEvent['type'], data: Record<string, unknown>) => ({ seq: 99, type, at: new Date().toISOString(), data, projectId: PROJECT } as LedgerEvent);
    await witness.inviteWitness(owner, PROJECT, { name: 'Ibrahima', required: false });
    const withWitness = await project();
    expect(push.plan(ev('proof_submitted', { stepId: 'p_villa_s3', index: 3 }), p).map((x) => x.role)).toEqual(['owner']); // no witness named
    expect(push.plan(ev('proof_submitted', { stepId: 'p_villa_s3', index: 3 }), withWitness).map((x) => x.role)).toEqual(['owner', 'witness']);
    expect(push.plan(ev('funding_paid', { amountCents: 2_500 }), p).map((x) => x.role)).not.toContain('owner'); // the funder's own payment is on their screen
    expect(push.plan(ev('funding_paid', { amountCents: 2_500, byFamily: true, contributor: 'Awa' }), p).map((x) => x.role)).toContain('owner');
    expect(push.plan(ev('step_rejected', { stepId: 'p_villa_s3', index: 3 }), p).map((x) => x.role)).toEqual(['manager']);
    expect(push.plan(ev('payout_completed', { stepId: 'p_villa_s3', index: 3 }), p).map((x) => x.role)).toEqual(['owner', 'manager']);
    expect(push.plan(ev('payout_failed', { stepId: 'p_villa_s3', index: 3 }), p).map((x) => x.role)).toEqual(['owner']);
    expect(push.plan(ev('witness_response', { stepId: 'p_villa_s3', index: 3, verdict: 'confirmed' }), p).map((x) => x.role)).toEqual(['owner']);
    for (const quiet of ['project_created', 'step_approved', 'payout_started', 'refund_started', 'refund_completed'] as const) expect(push.plan(ev(quiet, {}), p), quiet).toEqual([]);
  });
});

describe('the round that sends them', () => {
  it('tells each phone what concerns it, in its language, with a sentence and a path and nothing else', async () => {
    await push.subscribePush({ kind: 'owner', user: owner }, sub(1), 'fr');
    await push.subscribePush(await managerScope(), sub(2), 'fr');
    const w = await witnessScope();
    await push.subscribePush(w, sub(3), 'en');
    await happen('proof_submitted', { stepId: 'p_villa_s3', index: 3, photos: [] });

    expect(await push.pushNewEvents()).toBe(1);
    await push.whenPushIdle();
    const byDevice = new Map(sent.map((s) => [s.endpoint, s.notice]));
    expect([...byDevice.keys()].sort()).toEqual([endpoint(1), endpoint(3)]); // the field team is not told about a proof they sent
    expect(byDevice.get(endpoint(1))).toMatchObject({ title: 'Preuve à examiner', url: '/app/projets/p_villa/etapes/p_villa_s3' });
    expect(byDevice.get(endpoint(3))).toMatchObject({ title: 'A proof to look at', url: `/temoin/${w.token}` });
    expect(byDevice.get(endpoint(3))!.body).toContain('step 3');

    for (const n of sent.map((s) => s.notice)) {
      expect(Object.keys(n).sort()).toEqual(['body', 'tag', 'title', 'url']);
      expect(n.url.startsWith('/')).toBe(true);
      expect(JSON.stringify(n)).not.toMatch(/lightning|bolt11|@|sats|\+221|\+33/i);
    }
  });

  it('announces an event once, and never an old one (a restart does not flood anybody)', async () => {
    await push.subscribePush({ kind: 'owner', user: owner }, sub(1), 'fr');
    await happen('payout_failed', { stepId: 'p_villa_s3', index: 3 });
    expect(await push.pushNewEvents()).toBe(1);
    expect(await push.pushNewEvents()).toBe(0);
    await push.whenPushIdle();
    expect(sent).toHaveLength(1);

    // an event from an hour ago (the instance was down): the cursor moves past it, nobody is told
    await db.withDb((d) => void ledger.appendLedger(d, PROJECT, 'payout_failed', { stepId: 'p_villa_s3', index: 3 }, new Date(Date.now() - 60 * 60_000).toISOString()));
    await push.pushNewEvents();
    await push.whenPushIdle();
    expect(sent).toHaveLength(1);
  });

  it('does nothing when push is off or when nobody asked for it', async () => {
    await happen('payout_failed', { stepId: 'p_villa_s3', index: 3 });
    expect(await push.pushNewEvents()).toBe(0); // no subscriber
    await push.subscribePush({ kind: 'owner', user: owner }, sub(1), 'fr');
    vi.stubEnv('PUSH', '0');
    expect(await push.pushNewEvents()).toBe(0);
    expect(sent).toEqual([]);
  });

  it('a family contribution tells the funder who and how much, and opens the field team\'s step', async () => {
    await push.subscribePush({ kind: 'owner', user: owner }, sub(1), 'fr');
    await push.subscribePush(await managerScope(), sub(2), 'fr');
    await happen('funding_paid', { fundingId: 'f_x', amountCents: 2_500, method: 'lightning', byFamily: true, contributor: 'Awa' });
    await push.pushNewEvents();
    await push.whenPushIdle();
    const owners = sent.filter((s) => s.endpoint === endpoint(1)).map((s) => s.notice);
    expect(owners).toHaveLength(1);
    expect(owners[0].body).toMatch(/^Awa a ajouté .*25.* à /);
    // p_villa has a step waiting for its proof (step 4 is active in the demonstration data): the field team hears of it
    const field = sent.filter((s) => s.endpoint === endpoint(2));
    expect((await project()).steps.some((s) => s.status === 'active')).toBe(field.length > 0);
  });
});

describe('a push service that fails', () => {
  it('forgets a device the browser has withdrawn (404 or 410) at once', async () => {
    await push.subscribePush({ kind: 'owner', user: owner }, sub(1), 'fr');
    await push.subscribePush({ kind: 'owner', user: owner }, sub(2), 'fr');
    failWith = (e) => (e === endpoint(1) ? Object.assign(new Error('gone'), { statusCode: 410 }) : null);
    await happen('payout_failed', { stepId: 'p_villa_s3', index: 3 });
    await push.pushNewEvents();
    await push.whenPushIdle();
    expect((await db.readDb()).pushSubs!.map((s) => s.endpoint)).toEqual([endpoint(2)]);
    expect(sent.map((s) => s.endpoint)).toEqual([endpoint(2)]);
  });

  it('keeps a device through a few failures, and gives up after five in a row; a success resets the count', async () => {
    await push.subscribePush({ kind: 'owner', user: owner }, sub(1), 'fr');
    failWith = () => new Error('push service down');
    for (let i = 0; i < 4; i++) {
      await happen('payout_failed', { stepId: 'p_villa_s3', index: 3 });
      await push.pushNewEvents();
    }
    await push.whenPushIdle();
    expect((await db.readDb()).pushSubs![0].failures).toBe(4);
    failWith = null;
    await happen('payout_failed', { stepId: 'p_villa_s3', index: 3 });
    await push.pushNewEvents();
    await push.whenPushIdle();
    expect((await db.readDb()).pushSubs![0]).toMatchObject({ failures: 0 });
    failWith = () => new Error('down again');
    for (let i = 0; i < 5; i++) {
      await happen('payout_failed', { stepId: 'p_villa_s3', index: 3 });
      await push.pushNewEvents();
    }
    await push.whenPushIdle();
    expect((await db.readDb()).pushSubs).toHaveLength(0);
  });

  it('never throws at the caller, whatever the push service does', async () => {
    await push.subscribePush({ kind: 'owner', user: owner }, sub(1), 'fr');
    push.setPushSenderForTests(async () => {
      throw 'not even an Error';
    });
    await happen('payout_failed', { stepId: 'p_villa_s3', index: 3 });
    await expect(push.pushNewEvents()).resolves.toBe(1);
  });
});
