import { OPERATOR_LOGOS } from '@/lib/templates';
import type { SupplierNetwork } from '@/lib/types';

/** The logo of a mobile money operator, when we have it (decorative: the name is always written next to it). Nothing for the others. */
export function OperatorLogo({ network, size = 20, className = '' }: { network: SupplierNetwork; size?: number; className?: string }) {
  const src = network === 'lightning' ? undefined : OPERATOR_LOGOS[network];
  if (!src) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" width={size} height={size} className={`inline-block shrink-0 rounded-md align-middle ${className}`} />;
}
