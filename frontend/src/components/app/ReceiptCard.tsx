import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { ShareLink } from './ShareLink';

/** Gives the supplier his receipt page (the only view of NobPay the person who gets paid has). */
export function ReceiptCard({ token, supplierName, compact = false }: { token: string; supplierName: string; compact?: boolean }) {
  const path = `/recu/${token}`;
  return (
    <section className={`rounded-2xl bg-surface-container-low ${compact ? 'p-3.5' : 'p-4'}`}>
      <p className="mb-1 flex items-center gap-2 font-title-md text-title-md">
        <Icon name="receipt_long" size={20} className="text-primary" /> Reçu pour {supplierName}
      </p>
      {!compact && <p className="mb-3 font-body-sm text-body-sm text-on-surface-variant">Une page simple, sans compte, où le fournisseur voit le montant, l’état du paiement et la référence à donner en cas de souci.</p>}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <ShareLink path={path} text={`Bonjour ${supplierName}, voici le reçu de votre paiement NobPay :`} label="Envoyer le reçu" title="Reçu de paiement NobPay" />
        <Link href={path} className="font-label-md text-label-md font-semibold text-primary hover:underline">
          Voir le reçu
        </Link>
      </div>
    </section>
  );
}
