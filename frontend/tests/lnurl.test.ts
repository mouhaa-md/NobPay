import { describe, expect, it } from 'vitest';
import { decodeBolt11 } from '@/server/lightning/bolt11';
import { LnurlError, normalizeLightningAddress, requestInvoice, type FetchJson } from '@/server/lightning/lnurl';
import { UnsafeUrlError } from '@/server/lightning/safeFetch';
import { defaultLnurl, fakeLnurlServer, metadataFor } from './helpers/fakeLnurl';
import { FakeWallet } from './helpers/fakeWallet';

const ADDRESS = 'moussa@wallet.example';

describe('Lightning address format', () => {
  it.each([
    ['moussa@wallet.example', 'moussa@wallet.example'],
    ['  Moussa.Diop_1@Wallet.Example ', 'moussa.diop_1@wallet.example'],
    ['lightning:moussa@wallet.example', 'moussa@wallet.example'],
  ])('normalises %j', (raw, expected) => {
    expect(normalizeLightningAddress(raw)).toBe(expected);
  });

  it.each(['', 'moussa', 'moussa@', '@wallet.example', 'moussa@localhost', 'moussa@wallet', 'mou ssa@wallet.example', 'mou+ssa@wallet.example', 'a@b@wallet.example', `${'a'.repeat(70)}@wallet.example`])('refuses %j', (raw) => {
    expect(normalizeLightningAddress(raw)).toBeNull();
  });
});

describe('asking a Lightning address for an invoice', () => {
  const setup = () => {
    const wallet = new FakeWallet();
    const behaviour = defaultLnurl();
    return { wallet, behaviour, fetchJson: fakeLnurlServer(wallet, behaviour) as FetchJson };
  };
  const ask = (fetchJson: FetchJson, amountSats = 5_000, network: 'mainnet' | 'testnet' = 'mainnet') => requestInvoice(ADDRESS, amountSats, { network, fetchJson });
  const refused = (code: string) => expect.objectContaining({ name: 'LnurlError', code });

  it('returns an invoice for exactly the amount asked, tied to the address', async () => {
    const { fetchJson } = setup();
    const inv = await ask(fetchJson, 5_000);
    const decoded = decodeBolt11(inv.bolt11);
    expect(decoded.amountMsat).toBe(5_000_000n);
    expect(decoded.paymentHash).toBe(inv.paymentHash);
    expect(inv.amountSats).toBe(5_000);
    expect(inv.address).toBe(ADDRESS);
    expect(Date.parse(inv.expiresAt)).toBeGreaterThan(Date.now() + 60_000);
  });

  it('refuses a malformed address before any request', async () => {
    let called = false;
    await expect(requestInvoice('nope', 1000, { network: 'mainnet', fetchJson: async () => ((called = true), {}) })).rejects.toEqual(refused('bad_address'));
    expect(called).toBe(false);
  });

  it('refuses an amount outside what the domain accepts, and says the limits', async () => {
    const { fetchJson, behaviour } = setup();
    behaviour.minSendableMsat = 10_000_000;
    const err = await ask(fetchJson, 5_000).catch((e) => e as LnurlError);
    expect(err).toMatchObject({ code: 'out_of_range' });
    expect((err as LnurlError).message).toContain('10000');
  });

  it('says so when the domain does not answer', async () => {
    const { fetchJson, behaviour } = setup();
    behaviour.down.add('wallet.example');
    await expect(ask(fetchJson)).rejects.toEqual(refused('unreachable'));
  });

  it('passes on the reason when the domain refuses', async () => {
    const { fetchJson, behaviour } = setup();
    behaviour.refuse = 'Utilisateur inconnu';
    await expect(ask(fetchJson)).rejects.toMatchObject({ code: 'refused', message: expect.stringContaining('Utilisateur inconnu') });
  });

  it('an unsafe address is reported as such, not as an outage', async () => {
    await expect(requestInvoice(ADDRESS, 1000, { network: 'mainnet', fetchJson: async () => { throw new UnsafeUrlError('Adresse non autorisée.'); } })).rejects.toEqual(refused('unsafe'));
  });

  it('REFUSES an invoice for another amount (a lying server cannot make us overpay)', async () => {
    const { fetchJson, behaviour } = setup();
    behaviour.amountOffsetMsat = 1_000_000n;
    await expect(ask(fetchJson)).rejects.toEqual(refused('wrong_invoice'));
    behaviour.amountOffsetMsat = -1_000n;
    await expect(ask(fetchJson)).rejects.toEqual(refused('wrong_invoice'));
  });

  it('REFUSES an invoice from another Bitcoin network', async () => {
    const { fetchJson, behaviour } = setup();
    behaviour.network = 'testnet';
    await expect(ask(fetchJson, 5_000, 'mainnet')).rejects.toEqual(refused('wrong_invoice'));
    behaviour.network = 'mainnet';
    await expect(ask(fetchJson, 5_000, 'testnet')).rejects.toEqual(refused('wrong_invoice'));
  });

  it('REFUSES an invoice whose description hash is not the hash of the announced metadata', async () => {
    const { fetchJson, behaviour } = setup();
    behaviour.badDescriptionHash = true;
    await expect(ask(fetchJson)).rejects.toEqual(refused('wrong_invoice'));
  });

  it('refuses an invoice that expires too soon to be paid', async () => {
    const { fetchJson, behaviour } = setup();
    behaviour.invoiceExpiry = 30;
    await expect(ask(fetchJson)).rejects.toEqual(refused('wrong_invoice'));
  });

  it('refuses a domain that names another identifier than the one we asked', async () => {
    const { fetchJson } = setup();
    const lying: FetchJson = async (url) => {
      const json = (await fetchJson(url)) as Record<string, unknown>;
      return json.metadata ? { ...json, metadata: metadataFor('someone-else', 'wallet.example') } : json;
    };
    await expect(ask(lying)).rejects.toEqual(refused('bad_answer'));
  });

  it('refuses an answer that is not a pay request', async () => {
    await expect(ask(async () => ({ tag: 'withdrawRequest' }))).rejects.toEqual(refused('bad_answer'));
    await expect(ask(async () => 'hello')).rejects.toEqual(refused('bad_answer'));
  });

  it('refuses a callback that points at a private address (SSRF through the protocol itself)', async () => {
    const { fetchJson } = setup();
    const sneaky: FetchJson = async (url) => {
      const json = (await fetchJson(url)) as Record<string, unknown>;
      return json.callback ? { ...json, callback: 'https://10.0.0.5/callback' } : json;
    };
    await expect(ask(sneaky)).rejects.toEqual(refused('unsafe'));
  });
});
