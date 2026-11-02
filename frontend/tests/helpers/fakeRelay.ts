import { verifyEvent, type Event } from 'nostr-tools/pure';
import type { Filter, WebSocketCtor, WebSocketLike } from '@/lib/nostr/relayClient';

/** What one fake relay does. */
export interface RelayBehaviour {
  /** the connection fails */
  down?: boolean;
  /** answers `OK false` with this reason */
  refuse?: string;
  /** accepts the connection and then never answers */
  silent?: boolean;
  /** answers a REQ with `CLOSED` and this reason (e.g. "auth-required") */
  closeReads?: string;
}

interface Subscription {
  deliver: (msg: unknown[]) => void;
  id: unknown;
  filters: Filter[];
}

class FakeRelay {
  events: Event[] = [];
  behaviour: RelayBehaviour = {};
  received = 0;
  subs = new Set<Subscription>();

  /** NIP-01 filter semantics: every field present must match; `#x` filters match an event's `x` tags. */
  matches(e: Event, f: Filter): boolean {
    if (f.kinds && !f.kinds.includes(e.kind)) return false;
    if (f.authors && !f.authors.includes(e.pubkey)) return false;
    if (f.ids && !f.ids.includes(e.id)) return false;
    if (f.since !== undefined && e.created_at < f.since) return false;
    if (f.until !== undefined && e.created_at > f.until) return false;
    for (const [key, wanted] of Object.entries(f)) {
      if (!key.startsWith('#') || !Array.isArray(wanted)) continue;
      const name = key.slice(1);
      if (!e.tags.some((t) => t[0] === name && wanted.includes(t[1]))) return false;
    }
    return true;
  }
}

/** A set of fake relays addressed by URL, plus the WebSocket class that reaches them. */
export class FakeRelayNetwork {
  private readonly relays = new Map<string, FakeRelay>();

  relay(url: string): FakeRelay {
    let r = this.relays.get(url);
    if (!r) this.relays.set(url, (r = new FakeRelay()));
    return r;
  }

  eventsOn(url: string): Event[] {
    return this.relay(url).events;
  }

  /** Puts an event on a relay as if somebody had published it. */
  inject(url: string, event: Event) {
    this.relay(url).events.push(event);
  }

  get WebSocketImpl(): WebSocketCtor {
    const network = this;
    return class implements WebSocketLike {
      // what nostr-tools reads when it drives this object as a browser WebSocket
      static readonly CONNECTING = 0;
      static readonly OPEN = 1;
      static readonly CLOSING = 2;
      static readonly CLOSED = 3;
      readyState = 0;
      onopen: WebSocketLike['onopen'] = null;
      onmessage: WebSocketLike['onmessage'] = null;
      onerror: WebSocketLike['onerror'] = null;
      onclose: WebSocketLike['onclose'] = null;
      private readonly relay: FakeRelay;
      private open = true;
      private readonly mine = new Set<Subscription>();
      constructor(url: string) {
        this.relay = network.relay(url);
        setTimeout(() => {
          if (this.relay.behaviour.down) return this.onerror?.({});
          this.readyState = 1;
          this.onopen?.({});
        }, 0);
      }
      private reply(...msg: unknown[]) {
        if (!this.open) return;
        setTimeout(() => {
          if (this.open) this.onmessage?.({ data: JSON.stringify(msg) });
        }, 0);
      }
      send(data: string) {
        const relay = this.relay;
        if (relay.behaviour.silent) return;
        const msg = JSON.parse(data) as unknown[];
        if (msg[0] === 'EVENT') {
          const ev = msg[1] as Event;
          relay.received += 1;
          if (relay.behaviour.refuse) return this.reply('OK', ev.id, false, relay.behaviour.refuse);
          if (!verifyEvent(ev)) return this.reply('OK', ev.id, false, 'invalid: bad signature');
          if (relay.events.some((e) => e.id === ev.id)) return this.reply('OK', ev.id, true, 'duplicate: already have this event');
          relay.events.push(ev);
          this.reply('OK', ev.id, true, '');
          // live subscriptions (of any connection) that match get the event
          for (const sub of relay.subs) if (sub.filters.some((f) => relay.matches(ev, f))) sub.deliver(['EVENT', sub.id, ev]);
          return;
        }
        if (msg[0] === 'REQ') {
          const sub: Subscription = { id: msg[1], filters: msg.slice(2) as Filter[], deliver: (m) => this.reply(...m) };
          if (relay.behaviour.closeReads) return this.reply('CLOSED', sub.id, relay.behaviour.closeReads);
          for (const e of relay.events.filter((x) => sub.filters.some((f) => relay.matches(x, f)))) this.reply('EVENT', sub.id, e);
          this.reply('EOSE', sub.id);
          relay.subs.add(sub);
          this.mine.add(sub);
          return;
        }
        if (msg[0] === 'CLOSE') {
          for (const sub of this.mine) if (sub.id === msg[1]) (relay.subs.delete(sub), this.mine.delete(sub));
        }
      }
      close() {
        this.open = false;
        this.readyState = 3;
        for (const sub of this.mine) this.relay.subs.delete(sub);
        this.mine.clear();
      }
    };
  }
}
