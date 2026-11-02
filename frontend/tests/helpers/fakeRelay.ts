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

class FakeRelay {
  events: Event[] = [];
  behaviour: RelayBehaviour = {};
  received = 0;

  matches(e: Event, f: Filter): boolean {
    if (f.kinds && !f.kinds.includes(e.kind)) return false;
    if (f.authors && !f.authors.includes(e.pubkey)) return false;
    if (f.ids && !f.ids.includes(e.id)) return false;
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
      onopen: WebSocketLike['onopen'] = null;
      onmessage: WebSocketLike['onmessage'] = null;
      onerror: WebSocketLike['onerror'] = null;
      onclose: WebSocketLike['onclose'] = null;
      private readonly relay: FakeRelay;
      private open = true;
      constructor(url: string) {
        this.relay = network.relay(url);
        setTimeout(() => {
          if (this.relay.behaviour.down) return this.onerror?.({});
          this.onopen?.({});
        }, 0);
      }
      private reply(...msg: unknown[]) {
        if (!this.open) return;
        setTimeout(() => this.onmessage?.({ data: JSON.stringify(msg) }), 0);
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
          return this.reply('OK', ev.id, true, '');
        }
        if (msg[0] === 'REQ') {
          const sub = msg[1];
          if (relay.behaviour.closeReads) return this.reply('CLOSED', sub, relay.behaviour.closeReads);
          const filter = msg[2] as Filter;
          for (const e of relay.events.filter((x) => relay.matches(x, filter))) this.reply('EVENT', sub, e);
          this.reply('EOSE', sub);
        }
      }
      close() {
        this.open = false;
      }
    };
  }
}
