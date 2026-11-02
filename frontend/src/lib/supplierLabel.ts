import { SUPPLIER_NETWORKS } from './templates';
import type { Supplier } from './types';

/** "Wave · +221 77 123 45 67" for mobile money, "Bitcoin Lightning · nom@domaine.com" for Lightning. */
export function supplierRoute(s: Pick<Supplier, 'network' | 'phone' | 'lightningAddress'>): string {
  return `${SUPPLIER_NETWORKS[s.network]} · ${s.network === 'lightning' ? (s.lightningAddress ?? '') : s.phone}`;
}

/** ma••••@walletofsatoshi.com: a link that gets forwarded must not print the whole address. */
export function maskAddress(address: string): string {
  const [user = '', domain = ''] = address.split('@');
  return `${user.slice(0, 2)}${'•'.repeat(Math.max(2, user.length - 2))}@${domain}`;
}
