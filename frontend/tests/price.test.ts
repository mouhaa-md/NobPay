import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getBtcUsd, getBtcUsdForMoney, MAX_SPREAD, setPriceSourcesForTests } from '@/server/lightning/price';

const MEMPOOL = 'mempool.space';
const COINBASE = 'coinbase.com';

type Answers = { mempool?: number | 'down' | 'junk'; coinbase?: number | 'down' | 'junk' };

let answers: Answers = {};
let now = 1_000_000;

/** The two public sources, each answering what the test says (a number, 'down', or an unreadable body). */
async function fetchSource(url: string) {
  const wanted = url.includes(MEMPOOL) ? answers.mempool : answers.coinbase;
  if (wanted === 'down' || wanted === undefined) throw new Error('unreachable');
  if (wanted === 'junk') return { ok: true, json: async () => ({ nothing: 'here' }) };
  return { ok: true, json: async () => (url.includes(MEMPOOL) ? { USD: wanted } : { data: { amount: String(wanted) } }) };
}

beforeEach(() => {
  vi.stubEnv('BTC_USD_RATE', '65000');
  now = 1_000_000;
  answers = {};
  setPriceSourcesForTests(fetchSource, () => now); // also clears the cache
});
afterEach(() => {
  vi.unstubAllEnvs();
  setPriceSourcesForTests(null);
});

describe('the bitcoin price', () => {
  it('two sources that agree give their average, and the price is kept for a minute', async () => {
    answers = { mempool: 100_000, coinbase: 100_400 };
    expect(await getBtcUsd()).toEqual({ usd: 100_200, source: `${MEMPOOL} + ${COINBASE}`, stale: false, disputed: false });
    answers = { mempool: 'down', coinbase: 'down' };
    now += 30_000;
    expect(await getBtcUsd()).toMatchObject({ usd: 100_200, stale: false }); // from the cache, not from a failing source
  });

  it('one source down or unreadable is fine: the other one answers', async () => {
    answers = { mempool: 'down', coinbase: 99_000 };
    expect(await getBtcUsd()).toMatchObject({ usd: 99_000, source: COINBASE, stale: false, disputed: false });
    setPriceSourcesForTests(fetchSource, () => now);
    answers = { mempool: 98_000, coinbase: 'junk' };
    expect(await getBtcUsd()).toMatchObject({ usd: 98_000, source: MEMPOOL, disputed: false });
  });

  it('an answer outside any sane range is ignored', async () => {
    answers = { mempool: 12, coinbase: 100_000 };
    expect(await getBtcUsd()).toMatchObject({ usd: 100_000, source: COINBASE });
    setPriceSourcesForTests(fetchSource, () => now);
    answers = { mempool: 50_000_000, coinbase: 'down' };
    expect(await getBtcUsd()).toMatchObject({ source: 'config', stale: true });
  });

  it('two sources that disagree by more than 5 % are in dispute: no price can be relied on', async () => {
    answers = { mempool: 100_000, coinbase: 100_000 * (1 + MAX_SPREAD) + 1_000 };
    expect(await getBtcUsd()).toMatchObject({ disputed: true, stale: false, usd: 100_000 });
    await expect(getBtcUsdForMoney()).rejects.toMatchObject({ status: 503, code: 'price_unavailable' });
    // a source far off (broken or hostile) is no more believed for being the first to answer
    answers = { mempool: 9_000_000, coinbase: 100_000 };
    await expect(getBtcUsdForMoney()).rejects.toMatchObject({ status: 503, code: 'price_unavailable' });
  });

  it('just inside the tolerance is not a dispute', async () => {
    answers = { mempool: 100_000, coinbase: 100_000 * (1 + MAX_SPREAD) - 1_000 };
    expect(await getBtcUsd()).toMatchObject({ disputed: false });
  });

  it('a dispute is not kept: the next call asks again', async () => {
    answers = { mempool: 100_000, coinbase: 150_000 };
    expect((await getBtcUsd()).disputed).toBe(true);
    answers = { mempool: 100_000, coinbase: 100_100 };
    expect(await getBtcUsd()).toMatchObject({ disputed: false, usd: 100_050 });
  });

  it('keeps a recent live price when every source goes down, then falls back to the configured one', async () => {
    answers = { mempool: 100_000, coinbase: 100_000 };
    await getBtcUsd();
    answers = { mempool: 'down', coinbase: 'down' };
    now += 2 * 60_000; // kept price expired, still within the fifteen minutes it may be reused
    expect(await getBtcUsd()).toMatchObject({ usd: 100_000, stale: true });
    expect((await getBtcUsdForMoney()).usd).toBe(100_000); // a price a few minutes old is a real price
    now += 20 * 60_000;
    expect(await getBtcUsd()).toMatchObject({ usd: 65_000, source: 'config', stale: true });
  });

  it('real money never moves on the configured fallback', async () => {
    answers = { mempool: 'down', coinbase: 'down' };
    expect(await getBtcUsd()).toMatchObject({ source: 'config', stale: true });
    await expect(getBtcUsdForMoney()).rejects.toMatchObject({ status: 503, code: 'price_unavailable', message: expect.stringContaining('indisponible') });
  });
});
