import type { Event } from 'nostr-tools/pure';

/**
 * A minimal Nostr relay client (NIP-01), the same code in the browser and on the server: one WebSocket per request.
 * It only does two things: publish one event and wait for the relay's verdict, and read the events that match a filter.
 */

export interface WebSocketLike {
  send(data: string): void;
  close(): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onclose: ((ev: unknown) => void) | null;
}
export type WebSocketCtor = new (url: string) => WebSocketLike;

export interface RelayOptions {
  timeoutMs?: number;
  /** tests inject a fake relay; by default the global WebSocket of the browser or of Node 22 */
  WebSocketImpl?: WebSocketCtor;
}

export interface Filter {
  ids?: string[];
  authors?: string[];
  kinds?: number[];
  since?: number;
  until?: number;
  limit?: number;
  [tag: `#${string}`]: string[] | undefined;
}

export class RelayError extends Error {
  constructor(
    message: string,
    public readonly code: 'unreachable' | 'timeout' | 'refused' | 'protocol',
  ) {
    super(message);
    this.name = 'RelayError';
  }
}

const DEFAULT_TIMEOUT_MS = 8_000;
const MAX_MESSAGE_CHARS = 256 * 1024;

/**
 * A relay address we accept to talk to. Always wss://, on a public domain name: relay lists come from files we do not
 * control (a dossier, an environment), and a browser or a server must not be pointed at a local or internal service.
 * `allowLocal` opens ws://localhost for development and tests.
 */
export function relayUrlProblem(raw: string, allowLocal = false): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return 'adresse illisible';
  }
  if (url.username || url.password) return 'identifiants interdits';
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const local = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  if (allowLocal && local && (url.protocol === 'ws:' || url.protocol === 'wss:')) return null;
  if (url.protocol !== 'wss:') return 'seul wss:// est accepté';
  if (url.port && url.port !== '443') return 'port non autorisé';
  if (/^[0-9.]+$/.test(host) || host.includes(':')) return 'une adresse IP n’est pas acceptée';
  if (!host.includes('.') || /\.(local|localhost|internal|lan|home|corp|intranet)$/.test(host)) return 'nom de domaine non autorisé';
  return null;
}

function socketFor(url: string, opts: RelayOptions): WebSocketLike {
  const Impl = opts.WebSocketImpl ?? (globalThis as { WebSocket?: WebSocketCtor }).WebSocket;
  if (!Impl) throw new RelayError('WebSocket indisponible dans cet environnement.', 'unreachable');
  return new Impl(url);
}

/** Runs one conversation with a relay: `onOpen` sends, `onMessage` returns a value to finish. */
function converse<T>(url: string, opts: RelayOptions, onOpen: (ws: WebSocketLike) => void, onMessage: (msg: unknown[], ws: WebSocketLike) => T | undefined, onTimeout: () => T): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let ws: WebSocketLike;
    try {
      ws = socketFor(url, opts);
    } catch (e) {
      return reject(e);
    }
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        /* already closed */
      }
      fn();
    };
    const timer = setTimeout(
      () =>
        finish(() => {
          try {
            resolve(onTimeout());
          } catch (e) {
            reject(e);
          }
        }),
      opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );
    ws.onopen = () => {
      try {
        onOpen(ws);
      } catch (e) {
        finish(() => reject(e));
      }
    };
    ws.onmessage = (ev) => {
      if (typeof ev.data !== 'string' || ev.data.length > MAX_MESSAGE_CHARS) return;
      let msg: unknown;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (!Array.isArray(msg)) return;
      try {
        const out = onMessage(msg, ws);
        if (out !== undefined) finish(() => resolve(out));
      } catch (e) {
        finish(() => reject(e));
      }
    };
    ws.onerror = () => finish(() => reject(new RelayError('Relais injoignable.', 'unreachable')));
    ws.onclose = () => finish(() => reject(new RelayError('Le relais a fermé la connexion.', 'unreachable')));
  });
}

export interface PublishResult {
  ok: boolean;
  /** the relay's own words, or why we gave up */
  detail: string;
}

/** Sends one event and waits for the relay's `OK`. A relay that already has it counts as accepted. */
export async function publishToRelay(url: string, event: Event, opts: RelayOptions = {}): Promise<PublishResult> {
  try {
    return await converse<PublishResult>(
      url,
      opts,
      (ws) => ws.send(JSON.stringify(['EVENT', event])),
      (msg) => {
        if (msg[0] === 'OK' && msg[1] === event.id) {
          const detail = typeof msg[3] === 'string' ? msg[3] : '';
          return { ok: msg[2] === true || /^duplicate/i.test(detail), detail };
        }
        if (msg[0] === 'NOTICE' && typeof msg[1] === 'string') return { ok: false, detail: msg[1].slice(0, 200) };
        return undefined;
      },
      () => ({ ok: false, detail: 'pas de réponse du relais' }),
    );
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : 'erreur du relais' };
  }
}

/** Reads the events matching a filter, until the relay says it has sent everything (EOSE). Throws if the relay cannot be used. */
export async function fetchFromRelay(url: string, filter: Filter, opts: RelayOptions & { maxEvents?: number } = {}): Promise<Event[]> {
  const subId = `nb${Math.random().toString(36).slice(2, 10)}`;
  const max = opts.maxEvents ?? 1_000;
  const events: Event[] = [];
  return converse<Event[]>(
    url,
    opts,
    (ws) => ws.send(JSON.stringify(['REQ', subId, filter])),
    (msg, ws) => {
      if (msg[1] !== subId) return undefined;
      if (msg[0] === 'EVENT' && msg[2] && typeof msg[2] === 'object') {
        events.push(msg[2] as Event);
        if (events.length >= max) {
          ws.send(JSON.stringify(['CLOSE', subId]));
          return events;
        }
      }
      if (msg[0] === 'EOSE') {
        ws.send(JSON.stringify(['CLOSE', subId]));
        return events;
      }
      if (msg[0] === 'CLOSED') throw new RelayError(`Le relais a refusé la lecture (${typeof msg[2] === 'string' ? msg[2].slice(0, 120) : 'sans raison'}).`, 'refused');
      return undefined;
    },
    () => {
      throw new RelayError('Le relais n’a pas répondu à temps.', 'timeout');
    },
  );
}
