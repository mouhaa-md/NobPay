import { getConfig } from '../config';
import type { InvoiceNetwork } from './bolt11';
import { nwcWallet } from './nwc';
import type { LightningWallet } from './wallet';

export { WalletError } from './wallet';
export type { LightningWallet } from './wallet';

/**
 * The two wallets of a real-Bitcoin instance (LIGHTNING_RAIL=nwc):
 *  - RECEIVE: makes invoices and looks them up. It can never spend, so a stolen connection string cannot empty it.
 *  - PAYOUT: pays suppliers and refunds. Give its connection a budget in the wallet; it is the only one that can spend.
 * Both may point at the same wallet (two connections with different rights).
 */
interface Registry {
  receive?: LightningWallet | null;
  payout?: LightningWallet | null;
  built?: { receiveUrl: string; payoutUrl: string; receive: LightningWallet | null; payout: LightningWallet | null };
  override?: { receive?: LightningWallet | null; payout?: LightningWallet | null } | null;
  networks: WeakMap<LightningWallet, InvoiceNetwork>;
}
const g = globalThis as unknown as { __nobpayWallets?: Registry };
const registry = (): Registry => (g.__nobpayWallets ??= { networks: new WeakMap() });

/** Tests only: put fake wallets in place (null removes the override). */
export function setWalletsForTests(w: { receive?: LightningWallet | null; payout?: LightningWallet | null } | null): void {
  const r = registry();
  r.override = w;
  r.networks = new WeakMap();
}

function build() {
  const r = registry();
  if (r.override) return { receive: r.override.receive ?? null, payout: r.override.payout ?? null };
  const { rail, receiveUrl, payoutUrl } = getConfig().lightning;
  if (rail !== 'nwc') return { receive: null, payout: null };
  if (!r.built || r.built.receiveUrl !== receiveUrl || r.built.payoutUrl !== payoutUrl) {
    r.built?.receive?.close?.();
    r.built?.payout?.close?.();
    r.built = {
      receiveUrl,
      payoutUrl,
      receive: receiveUrl ? nwcWallet(receiveUrl) : null,
      payout: payoutUrl ? nwcWallet(payoutUrl) : null,
    };
  }
  return { receive: r.built.receive, payout: r.built.payout };
}

export const getReceiveWallet = (): LightningWallet | null => build().receive;
export const getPayoutWallet = (): LightningWallet | null => build().payout;

/** Real bitcoin can be received on this instance. */
export const lightningEnabled = (): boolean => getReceiveWallet() !== null;
/** Real bitcoin can be sent (payments to a Lightning address, refunds). */
export const lightningPayoutsEnabled = (): boolean => getPayoutWallet() !== null;

/** The Bitcoin network the wallet lives on, asked once. An invoice from another network is always refused. */
export async function walletNetwork(wallet: LightningWallet): Promise<InvoiceNetwork> {
  const known = registry().networks.get(wallet);
  if (known) return known;
  const { network } = await wallet.info();
  const value: InvoiceNetwork = network === 'unknown' ? 'mainnet' : network;
  registry().networks.set(wallet, value);
  return value;
}
