import { createHash, randomBytes } from 'node:crypto';
import { encodeBolt11 } from './bolt11';
import { sha256Hex, type FakeWallet } from './fakeWallet';

/** What the fake domain does wrong, when a test wants it to. */
export interface LnurlBehaviour {
  /** added to the amount asked for in the invoice it returns (a lying server) */
  amountOffsetMsat: bigint;
  network: 'mainnet' | 'testnet' | 'signet' | 'regtest';
  badDescriptionHash: boolean;
  /** the domain answers `{status:'ERROR'}` */
  refuse?: string;
  /** hosts that do not answer at all */
  down: Set<string>;
  minSendableMsat: number;
  maxSendableMsat: number;
  /** invoice lifetime in seconds */
  invoiceExpiry: number;
}

export const defaultLnurl = (): LnurlBehaviour => ({
  amountOffsetMsat: 0n,
  network: 'mainnet',
  badDescriptionHash: false,
  down: new Set(),
  minSendableMsat: 1_000,
  maxSendableMsat: 100_000_000_000,
  invoiceExpiry: 600,
});

export const metadataFor = (user: string, host: string) => JSON.stringify([['text/plain', `Paiement à ${user}`], ['text/identifier', `${user}@${host}`]]);

/** A fake LNURL-pay domain: answers the two requests of the protocol and registers each invoice with the paying wallet. */
export function fakeLnurlServer(wallet: FakeWallet, behaviour: LnurlBehaviour) {
  return async (rawUrl: string): Promise<unknown> => {
    const url = new URL(rawUrl);
    if (behaviour.down.has(url.hostname)) throw new Error('domain is down');
    if (behaviour.refuse) return { status: 'ERROR', reason: behaviour.refuse };
    if (url.pathname.startsWith('/.well-known/lnurlp/')) {
      const user = decodeURIComponent(url.pathname.split('/').pop()!);
      return {
        tag: 'payRequest',
        callback: `https://${url.hostname}/lnurlp/${encodeURIComponent(user)}/callback`,
        minSendable: behaviour.minSendableMsat,
        maxSendable: behaviour.maxSendableMsat,
        metadata: metadataFor(user, url.hostname),
      };
    }
    const m = /^\/lnurlp\/([^/]+)\/callback$/.exec(url.pathname);
    if (m) {
      const user = decodeURIComponent(m[1]);
      const amount = BigInt(url.searchParams.get('amount')!);
      const preimage = randomBytes(32).toString('hex');
      const paymentHash = sha256Hex(preimage);
      const descriptionHash = behaviour.badDescriptionHash ? 'ff'.repeat(32) : createHash('sha256').update(metadataFor(user, url.hostname), 'utf8').digest('hex');
      wallet.knowInvoice(paymentHash, preimage);
      return {
        pr: encodeBolt11({ amountMsat: amount + behaviour.amountOffsetMsat, paymentHash, descriptionHash, expiry: behaviour.invoiceExpiry, timestamp: Math.floor(Date.now() / 1000), network: behaviour.network }),
        routes: [],
      };
    }
    throw new Error(`unexpected request ${rawUrl}`);
  };
}
