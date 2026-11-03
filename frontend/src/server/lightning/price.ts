import { XOF_PER_EUR } from '@/lib/money';
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
  gfx.__nobpayFx = undefined;
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

/* ------------------------------------------------------------------------- *
 * Dollars in FCFA. The CFA franc is pegged to the euro by treaty (1 EUR = 655.957 XOF), so the rate is exact once the
 * dollar is known in euros, and the two bitcoin prices already asked for give just that: XOF per USD = 655.957 x
 * (BTC in EUR) / (BTC in USD). Indicative only (display, comparisons); the payout of a quote keeps its own rate.
 * ------------------------------------------------------------------------- */

/** A rate computed from live prices is used for this long, then the configured one comes back. */
const FX_KEEP_MS = 6 * 3_600_000;
/** Two sources must give the same rate within this (relative). */
const FX_MAX_SPREAD = 0.02;
const gfx = globalThis as unknown as { __nobpayFx?: { usdXof: number; at: number; source: string } };

const FX_SOURCES: { name: string; ask: (get: (url: string) => Promise<unknown>) => Promise<{ usd: number; eur: number }> }[] = [
  {
    name: 'mempool.space',
    ask: async (get) => {
      const j = (await get('https://mempool.space/api/v1/prices')) as { USD?: unknown; EUR?: unknown };
      return { usd: Number(j?.USD), eur: Number(j?.EUR) };
    },
  },
  {
    name: 'coinbase.com',
    ask: async (get) => {
      const amount = async (pair: string) => Number(((await get(`https://api.coinbase.com/v2/prices/${pair}/spot`)) as { data?: { amount?: unknown } })?.data?.amount);
      const [usd, eur] = await Promise.all([amount('BTC-USD'), amount('BTC-EUR')]);
      return { usd, eur };
    },
  },
];

async function getJson(url: string): Promise<unknown> {
  const res = await fetcher(url, { signal: AbortSignal.timeout(5_000), headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP error`);
  return res.json();
}

/** Asks the sources and keeps the rate. Returns it, or null when nothing trustworthy came back (the previous one is kept). */
export async function refreshUsdXof(): Promise<{ usdXof: number; source: string } | null> {
  const answers: { name: string; rate: number }[] = [];
  await Promise.all(
    FX_SOURCES.map(async (s) => {
      try {
        const { usd, eur } = await s.ask(getJson);
        const rate = (XOF_PER_EUR * eur) / usd;
        // a sane price pair, and a sane rate (the dollar has been worth 350 to 800 XOF in the last twenty years)
        if (Number.isFinite(rate) && usd > 1_000 && eur > 1_000 && rate > 350 && rate < 900) answers.push({ name: s.name, rate });
      } catch {
        /* this source is down: the other one may answer */
      }
    }),
  );
  if (answers.length === 0) return null;
  const low = Math.min(...answers.map((a) => a.rate));
  const high = Math.max(...answers.map((a) => a.rate));
  if (answers.length > 1 && (high - low) / low > FX_MAX_SPREAD) return null; // the sources disagree: keep what we had
  const usdXof = Math.round(((low + high) / 2) * 100) / 100;
  const source = answers.map((a) => a.name).sort().join(' + ');
  gfx.__nobpayFx = { usdXof, at: clock(), source };
  return { usdXof, source };
}

/**
 * The dollar in FCFA for display and for comparisons: the operator's USD_XOF_RATE when set (explicit wins), else the live
 * rate when a recent one is known, else the configured one (observed at Bitnob on 18 October).
 */
export function currentUsdXof(): number {
  if (Number(process.env.USD_XOF_RATE) > 0) return Number(process.env.USD_XOF_RATE);
  const live = gfx.__nobpayFx;
  if (live && clock() - live.at < FX_KEEP_MS) return live.usdXof;
  return getConfig().usdXof;
}

/** Where the rate in use comes from, for the health page and the admin. */
export function usdXofSource(): string {
  if (Number(process.env.USD_XOF_RATE) > 0) return 'USD_XOF_RATE';
  const live = gfx.__nobpayFx;
  return live && clock() - live.at < FX_KEEP_MS ? live.source : 'config';
}

/** Tests only. */
export function resetUsdXofForTests(): void {
  gfx.__nobpayFx = undefined;
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
