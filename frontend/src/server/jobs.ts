import { getConfig } from './config';
import { refreshPendingAnchors } from './anchors';
import { expireFundings, pollPendingFundings, reconcile } from './services';

/**
 * Background work, in the SAME process as the app (the database is a single JSON file: a second process would
 * corrupt it, see db.ts). One loop, never overlapping itself:
 *  - finish payouts still in flight (mock: simulated confirmation; sandbox: poll, recover unconfirmed ones)
 *  - close invoices past their expiry
 *  - sandbox: poll pending invoices (fallback when a webhook is late or lost)
 *  - every 10 minutes: ask OpenTimestamps whether pending anchors reached a Bitcoin block
 * Pages and GET routes no longer do any of this while rendering.
 */

interface State {
  timer?: NodeJS.Timeout;
  running: boolean;
  lastAnchors: number;
  lastLogged: Map<string, number>;
}
const g = globalThis as unknown as { __nobpayJobs?: State };

const ANCHOR_EVERY_MS = 10 * 60_000;

const stateOf = (): State => (g.__nobpayJobs ??= { running: false, lastAnchors: 0, lastLogged: new Map() });

async function safely(state: State, name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    const now = Date.now();
    if (now - (state.lastLogged.get(name) ?? 0) > 60_000) {
      state.lastLogged.set(name, now);
      console.error(`[jobs] ${name} failed: ${(err as Error).message}`);
    }
  }
}

/** One round. Exported for tests. */
export async function tick(): Promise<void> {
  const state = stateOf();
  if (state.running) return;
  state.running = true;
  try {
    await safely(state, 'payouts', reconcile);
    await safely(state, 'expiry', expireFundings);
    if (getConfig().mode === 'sandbox') await safely(state, 'invoices', pollPendingFundings);
    if (Date.now() - state.lastAnchors > ANCHOR_EVERY_MS) {
      state.lastAnchors = Date.now();
      await safely(state, 'anchors', () => refreshPendingAnchors());
    }
  } finally {
    state.running = false;
  }
}

/** Starts the loop once per process. Safe to call as often as you like; off in tests and with BACKGROUND_JOBS=0. */
export function startJobs(): void {
  if (process.env.NODE_ENV === 'test' || process.env.BACKGROUND_JOBS === '0') return;
  const state = stateOf();
  if (state.timer) return;
  // mock payouts are confirmed ~2.5 s after the request: check often. Sandbox talks to a real API: calmer.
  const every = getConfig().mode === 'mock' ? 1500 : 5000;
  state.timer = setInterval(() => void tick(), every);
  state.timer.unref?.();
}
