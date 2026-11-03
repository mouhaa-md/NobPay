import { createHash } from 'node:crypto';
import { translate, type Lang } from '@/lib/i18n/messages';
import { formatUsdShort } from '@/lib/money';
import type { Db, LedgerEvent, Project, PushSub, User } from '@/lib/types';
import { getConfig } from './config';
import { readDb, withDb } from './db';
import { HttpError } from './http';
import { ledgerFor } from './ledger';
import { logger } from './logger';
import { findProjectByManagerToken, managerLinkToken } from './managerToken';
import { findProjectByWitnessToken, witnessLinkToken } from './witness';

/**
 * Notifications on the phone (Web Push): the funder is told when a proof arrives, a payment is confirmed or a relative adds
 * money; the person on site, when a step is funded or a proof is refused; the witness, when there is something to look at.
 * No SMS to pay for, no account: the installed app is enough.
 *
 * Nothing here is on the road of the money. Notifications are made from the LEDGER, after the fact (a job reads the events
 * written since the last round), so no payment, funding or decision ever waits for, or fails because of, a push service.
 * A notification carries a title, a sentence and a path of this site: never a balance, an address or a file.
 */

/** Events older than this are never announced: after a restart or a long pause nobody is flooded with yesterday. */
export const FRESH_MS = 10 * 60_000;
const MAX_SUBS_PER_SCOPE = 5;
const MAX_FAILURES = 5;

/* ------------------------------------------------------------------------- *
 * Subscriptions
 * ------------------------------------------------------------------------- */

/**
 * Browsers hand out push addresses on the domains of their push service. Only those are accepted: the address is chosen by
 * the client, and we POST to it, so an open list would turn this route into a way to make the server call anything.
 */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/];
const B64URL = /^[A-Za-z0-9_-]+$/;

/** Why a push address or key pair cannot be used, or null. */
export function subscriptionProblem(input: { endpoint: string; p256dh: string; auth: string }): string | null {
  let url: URL;
  try {
    url = new URL(input.endpoint);
  } catch {
    return 'adresse illisible';
  }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return 'adresse non autorisée';
  if (!PUSH_HOSTS.some((re) => re.test(url.hostname.toLowerCase()))) return 'service de notification inconnu';
  if (input.endpoint.length > 600) return 'adresse trop longue';
  if (!B64URL.test(input.p256dh) || input.p256dh.length < 80 || input.p256dh.length > 100) return 'clé invalide';
  if (!B64URL.test(input.auth) || input.auth.length < 16 || input.auth.length > 32) return 'clé invalide';
  return null;
}

export type PushScope = { kind: 'owner'; user: User } | { kind: 'manager'; token: string } | { kind: 'witness'; token: string };

const idOf = (endpoint: string, role: string, scope: string) => createHash('sha256').update(`${role}|${scope}|${endpoint}`).digest('hex').slice(0, 20);

/** Who the scope is: a role and the account or project it concerns. Throws 404 for a link that does not open anything. */
function resolveScope(db: Db, scope: PushScope): { role: PushSub['role']; userId?: string; projectId?: string } {
  if (scope.kind === 'owner') return { role: 'owner', userId: scope.user.id };
  const project = scope.kind === 'manager' ? findProjectByManagerToken(db, scope.token) : findProjectByWitnessToken(db, scope.token);
  if (!project) throw new HttpError(404, 'Ce lien n’est pas valable (ou il a été renouvelé).', 'bad_link');
  return { role: scope.kind, projectId: project.id };
}

export async function subscribePush(scope: PushScope, input: { endpoint: string; p256dh: string; auth: string }, lang: Lang): Promise<void> {
  if (!getConfig().push.enabled) throw new HttpError(409, 'Les notifications ne sont pas activées sur cette instance.', 'push_disabled');
  const problem = subscriptionProblem(input);
  if (problem) throw new HttpError(400, 'Ce navigateur n’a pas donné d’adresse de notification utilisable.', 'invalid_input');
  await withDb((db) => {
    const who = resolveScope(db, scope);
    const key = who.userId ?? who.projectId!;
    const list = (db.pushSubs ??= []);
    const id = idOf(input.endpoint, who.role, key);
    const mine = list.filter((s) => s.role === who.role && (s.userId ?? s.projectId) === key);
    const existing = list.find((s) => s.id === id);
    if (existing) {
      Object.assign(existing, { p256dh: input.p256dh, auth: input.auth, lang, failures: 0 }); // the browser renewed its keys
      return;
    }
    if (mine.length >= MAX_SUBS_PER_SCOPE) {
      // the oldest device makes room: a phone that was replaced must not block the new one
      const oldest = mine.sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
      list.splice(list.indexOf(oldest), 1);
    }
    list.push({ id, role: who.role, userId: who.userId, projectId: who.projectId, endpoint: input.endpoint, p256dh: input.p256dh, auth: input.auth, lang, createdAt: new Date().toISOString() });
  });
}

export async function unsubscribePush(scope: PushScope, endpoint: string): Promise<void> {
  await withDb((db) => {
    const who = resolveScope(db, scope);
    const id = idOf(endpoint, who.role, who.userId ?? who.projectId!);
    db.pushSubs = (db.pushSubs ?? []).filter((s) => s.id !== id);
  });
}

/* ------------------------------------------------------------------------- *
 * What is announced, and to whom
 * ------------------------------------------------------------------------- */

export interface Notice {
  title: string;
  body: string;
  /** a path of this site */
  url: string;
  tag: string;
}
type Say = (fr: string, vars?: Record<string, string | number>) => string;
interface Planned {
  role: PushSub['role'];
  make: (t: Say) => Notice;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** The notifications a ledger event calls for. Pure: it reads the project, it sends nothing. */
export function plan(event: LedgerEvent, project: Project): Planned[] {
  const name = clip(project.name, 40);
  const stepId = typeof event.data.stepId === 'string' ? event.data.stepId : undefined;
  const index = typeof event.data.index === 'number' ? event.data.index : undefined;
  const tag = `${project.id}:${event.type}:${event.seq}`;
  const ownerUrl = stepId ? `/app/projets/${project.id}/etapes/${stepId}` : `/app/projets/${project.id}`;
  const fieldUrl = `/terrain/${managerLinkToken(project)}`;
  const out: Planned[] = [];

  switch (event.type) {
    case 'proof_submitted':
      out.push({ role: 'owner', make: (t) => ({ title: t('Preuve à examiner'), body: t('{name} : la preuve de l’étape {index} attend votre décision.', { name, index: index ?? 0 }), url: ownerUrl, tag }) });
      if (project.witness && witnessLinkToken(project)) {
        const url = `/temoin/${witnessLinkToken(project)}`;
        out.push({ role: 'witness', make: (t) => ({ title: t('Une preuve à regarder'), body: t('{name} : dites si la preuve de l’étape {index} correspond.', { name, index: index ?? 0 }), url, tag }) });
      }
      break;
    case 'funding_paid': {
      const who = typeof event.data.contributor === 'string' ? event.data.contributor : '';
      const amount = formatUsdShort(Number(event.data.amountCents) || 0);
      // only a relative's money is news for the funder (their own payment is on their screen)
      if (event.data.byFamily === true) {
        out.push({ role: 'owner', make: (t) => ({ title: t('Cotisation reçue'), body: who ? t('{who} a ajouté {amount} à {name}.', { who, amount, name }) : t('Un proche a ajouté {amount} à {name}.', { amount, name }), url: ownerUrl, tag }) });
      }
      const active = project.steps.find((s) => s.status === 'active');
      if (active) out.push({ role: 'manager', make: (t) => ({ title: t('Étape financée'), body: t('{name} : vous pouvez envoyer la preuve de l’étape {index}.', { name, index: active.index }), url: fieldUrl, tag }) });
      break;
    }
    case 'step_rejected':
      out.push({ role: 'manager', make: (t) => ({ title: t('Preuve refusée'), body: t('{name} : envoyez une nouvelle preuve pour l’étape {index}.', { name, index: index ?? 0 }), url: fieldUrl, tag }) });
      break;
    case 'payout_completed':
      out.push({ role: 'owner', make: (t) => ({ title: t('Paiement confirmé'), body: t('{name} : le fournisseur de l’étape {index} a été payé.', { name, index: index ?? 0 }), url: ownerUrl, tag }) });
      out.push({ role: 'manager', make: (t) => ({ title: t('Fournisseur payé'), body: t('{name} : le fournisseur de l’étape {index} a été payé.', { name, index: index ?? 0 }), url: fieldUrl, tag }) });
      break;
    case 'payout_failed':
      out.push({ role: 'owner', make: (t) => ({ title: t('Paiement non abouti'), body: t('{name} : l’étape {index} est toujours en séquestre, vous pouvez réessayer.', { name, index: index ?? 0 }), url: ownerUrl, tag }) });
      break;
    case 'witness_response': {
      const ok = event.data.verdict === 'confirmed';
      out.push({ role: 'owner', make: (t) => ({ title: ok ? t('Le témoin confirme') : t('Le témoin conteste'), body: t('{name} : étape {index}.', { name, index: index ?? 0 }), url: ownerUrl, tag }) });
      break;
    }
  }
  return out;
}

/* ------------------------------------------------------------------------- *
 * Sending
 * ------------------------------------------------------------------------- */

export type PushSender = (sub: Pick<PushSub, 'endpoint' | 'p256dh' | 'auth'>, payload: string) => Promise<void>;

let sender: PushSender | null = null;
/** Tests only: a fake push service. */
export function setPushSenderForTests(s: PushSender | null): void {
  sender = s;
}

let vapidReady = false;
const realSender: PushSender = async (sub, payload) => {
  const mod = await import('web-push');
  const wp = (mod as unknown as { default?: typeof import('web-push') }).default ?? mod;
  if (!vapidReady) {
    wp.setVapidDetails(getConfig().push.subject, getConfig().push.publicKey, process.env.VAPID_PRIVATE_KEY ?? '');
    vapidReady = true;
  }
  await wp.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, { TTL: 3_600, urgency: 'normal', timeout: 8_000 });
};

const inFlight = new Set<Promise<unknown>>();
/** Tests only: resolves when every notification started has been tried. */
export const whenPushIdle = async (): Promise<void> => void (await Promise.allSettled([...inFlight]));

async function deliver(sub: PushSub, notice: Notice): Promise<'ok' | 'gone' | 'failed'> {
  try {
    await (sender ?? realSender)(sub, JSON.stringify(notice));
    return 'ok';
  } catch (err) {
    const status = (err as { statusCode?: number })?.statusCode;
    return status === 404 || status === 410 ? 'gone' : 'failed'; // 404/410: the browser withdrew the address for good
  }
}

/** Sends what a ledger event calls for, to the phones that asked for it. Never throws. */
async function announce(event: LedgerEvent, project: Project, subs: PushSub[]): Promise<void> {
  const results = new Map<string, 'ok' | 'gone' | 'failed'>();
  for (const planned of plan(event, project)) {
    const targets = subs.filter((s) => s.role === planned.role && (planned.role === 'owner' ? s.userId === project.ownerId : s.projectId === project.id));
    await Promise.all(
      targets.map(async (s) => {
        const t: Say = (fr, vars) => translate(s.lang, fr, vars);
        results.set(s.id, await deliver(s, planned.make(t)));
      }),
    );
  }
  if (results.size === 0) return;
  const now = new Date().toISOString();
  await withDb((db) => {
    const drop = new Set<string>();
    for (const [id, outcome] of results) {
      const sub = (db.pushSubs ?? []).find((s) => s.id === id);
      if (!sub) continue;
      if (outcome === 'ok') {
        sub.lastOkAt = now;
        sub.failures = 0;
      } else if (outcome === 'gone') {
        drop.add(id);
      } else {
        sub.failures = (sub.failures ?? 0) + 1;
        if (sub.failures >= MAX_FAILURES) drop.add(id);
      }
    }
    if (drop.size) db.pushSubs = (db.pushSubs ?? []).filter((s) => !drop.has(s.id));
  }).catch((err) => logger.warn('push_bookkeeping_failed', { error: err }));
}

/**
 * One round of the background job: announces the ledger events written since the last round. The position is advanced
 * BEFORE sending: a notification that is lost is a smaller harm than one repeated at every round.
 */
export async function pushNewEvents(now = Date.now()): Promise<number> {
  if (!getConfig().push.enabled) return 0;
  const first = await readDb();
  if (!first.pushSubs?.length) return 0;

  const work: { project: Project; events: LedgerEvent[] }[] = [];
  await withDb((db) => {
    const cursor = (db.pushCursor ??= {});
    for (const project of db.projects) {
      const events = ledgerFor(db, project.id);
      const last = events[events.length - 1]?.seq ?? 0;
      const from = cursor[project.id] ?? 0;
      if (last <= from) continue;
      cursor[project.id] = last;
      const fresh = events.filter((e) => e.seq > from && now - Date.parse(e.at) <= FRESH_MS);
      if (fresh.length) work.push({ project: structuredClone(project), events: fresh });
    }
  });

  let sent = 0;
  const subs = (await readDb()).pushSubs ?? [];
  for (const { project, events } of work) {
    for (const event of events) {
      const job = announce(event, project, subs);
      inFlight.add(job);
      void job.finally(() => inFlight.delete(job));
      await job;
      sent += 1;
    }
  }
  return sent;
}
