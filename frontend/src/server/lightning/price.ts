import { getConfig } from '../config';
import { HttpError } from '../http';

/**
 * The bitcoin price in dollars, from public sources with a short cache. Every source is asked, and they must agree: a
 * single wrong answer must not set the price of money. If no source answers, a recent price is kept for a few minutes and
 * then the configured fallback (BTC_USD_RATE) is used and flagged `stale`: a screen can say so, but real money never moves
 * on it (see `getBtcUsdForMoney`).
 */

export interface BtcPrice {
  usd: number;
  source: string;
  /** true when no live source answered */
  stale: boolean;
  /** true when two live sources disagree by more than MAX_SPREAD: none of them can be trusted */
  disputed: boolean;
}

interface Source {
  name: string;
  url: string;
  pick: (json: unknown) => number;
}

const num = (v: unknown) => Number(v);
const SOURCES: Source[] = [
  { name: 'mempool.space', url: 'https://mempool.space/api/v1/prices', pick: (j) => num((j as { USD?: unknown })?.USD) },
  { name: 'coinbase.com', url: 'https://api.coinbase.com/v2/prices/BTC-USD/spot', pick: (j) => num((j as { data?: { amount?: unknown } })?.data?.amount) },
];

const FRESH_MS = 60_000;
const KEEP_MS = 15 * 60_000;
/** Two sources farther apart than this (relative to the lower one) are in dispute. Real quotes differ by well under 1 %. */
export const MAX_SPREAD = 0.05;
const g = globalThis as unknown as { __nobpayPrice?: { usd: number; source: string; at: number } };

type Fetcher = (url: string, init: { signal: AbortSignal; headers: Record<string, string> }) => Promise<{ ok: boolean; json(): Promise<unknown> }>;
let fetcher: Fetcher = (url, init) => fetch(url, { ...init, cache: 'no-store' });
let clock: () => number = Date.now;

/** Tests only. */
export function setPriceSourcesForTests(f: Fetcher | null, now?: (() => number) | null): void {
  fetcher = f ?? ((url, init) => fetch(url, { ...init, cache: 'no-store' }));
  clock = now ?? Date.now;
  g.__nobpayPrice = undefined;
}

async function ask(source: Source): Promise<{ name: string; usd: number } | null> {
  try {
    const res = await fetcher(source.url, { signal: AbortSignal.timeout(5_000), headers: { accept: 'application/json' } });
    if (!res.ok) return null;
    const usd = source.pick(await res.json());
    // a sanity range: a broken source must not set the price of money
    return Number.isFinite(usd) && usd > 1_000 && usd < 10_000_000 ? { name: source.name, usd } : null;
  } catch {
    return null;
  }
}

export async function getBtcUsd(): Promise<BtcPrice> {
  const now = clock();
  const cached = g.__nobpayPrice;
  if (cached && now - cached.at < FRESH_MS) return { usd: cached.usd, source: cached.source, stale: false, disputed: false };

  const answers = (await Promise.all(SOURCES.map(ask))).filter((a): a is { name: string; usd: number } => a !== null);
  if (answers.length > 0) {
    const low = Math.min(...answers.map((a) => a.usd));
    const high = Math.max(...answers.map((a) => a.usd));
    if (answers.length > 1 && (high - low) / low > MAX_SPREAD) {
      // not cached: the next call asks again. The price shown is the lower one, but nothing may rely on it.
      return { usd: low, source: answers.map((a) => a.name).join(' ≠ '), stale: false, disputed: true };
    }
    const usd = answers.length > 1 ? Math.round(((low + high) / 2) * 100) / 100 : low;
    const source = answers.map((a) => a.name).join(' + ');
    g.__nobpayPrice = { usd, source, at: now };
    return { usd, source, stale: false, disputed: false };
  }
  if (cached && now - cached.at < KEEP_MS) return { usd: cached.usd, source: cached.source, stale: true, disputed: false };
  return { usd: getConfig().btcUsd, source: 'config', stale: true, disputed: false };
}

/**
 * The price at which sats are counted against dollars: a live one, or a live one kept for a few minutes. Refuses (503)
 * when no source answers for longer than that, or when the sources disagree: an invoice made on a made-up price would
 * credit, or pay out, the wrong amount of real money.
 */
export async function getBtcUsdForMoney(): Promise<BtcPrice> {
  const price = await getBtcUsd();
  if (price.disputed) {
    throw new HttpError(503, 'Le cours du bitcoin est incertain à cet instant (les sources ne concordent pas). Réessayez dans quelques minutes.', 'price_unavailable');
  }
  if (price.source === 'config') {
    throw new HttpError(503, 'Le cours du bitcoin est indisponible à cet instant. Réessayez dans quelques minutes.', 'price_unavailable');
  }
  return price;
}
