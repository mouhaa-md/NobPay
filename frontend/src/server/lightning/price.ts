import { getConfig } from '../config';

/**
 * The bitcoin price in dollars, from public sources with a short cache. If no source answers, a recent price is kept for
 * a few minutes and then the configured fallback (BTC_USD_RATE) is used and flagged `stale`: a screen can say so.
 */

export interface BtcPrice {
  usd: number;
  source: string;
  /** true when no live source answered */
  stale: boolean;
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

export async function getBtcUsd(): Promise<BtcPrice> {
  const now = clock();
  const cached = g.__nobpayPrice;
  if (cached && now - cached.at < FRESH_MS) return { usd: cached.usd, source: cached.source, stale: false };
  for (const source of SOURCES) {
    try {
      const res = await fetcher(source.url, { signal: AbortSignal.timeout(5_000), headers: { accept: 'application/json' } });
      if (!res.ok) continue;
      const usd = source.pick(await res.json());
      // a sanity range: a broken source must not set the price of money
      if (Number.isFinite(usd) && usd > 1_000 && usd < 10_000_000) {
        g.__nobpayPrice = { usd, source: source.name, at: now };
        return { usd, source: source.name, stale: false };
      }
    } catch {
      /* try the next source */
    }
  }
  if (cached && now - cached.at < KEEP_MS) return { usd: cached.usd, source: cached.source, stale: true };
  return { usd: getConfig().btcUsd, source: 'config', stale: true };
}
