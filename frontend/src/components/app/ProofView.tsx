import { Icon } from '@/components/ui/Icon';
import { formatDateTime, formatFcfa } from '@/lib/money';
import { shortHash } from '@/lib/ledgerLabels';
import { MOBILE_NETWORKS } from '@/lib/templates';
import type { Proof, StoredFile } from '@/lib/types';

interface Props {
  proof: Proof;
  projectId: string;
  /** the field manager's token: lets the owner-less field page load the images */
  token?: string;
  /** what the step is worth, to compare with the invoice (indicative rate) */
  expectedFcfa?: number;
}

const fileUrl = (projectId: string, file: StoredFile, token?: string) => `/api/files/${projectId}/${file.id}${token ? `?t=${token}` : ''}`;
const isImage = (f: StoredFile) => f.mime.startsWith('image/');

/** What the person on site sent: photos with their metadata, invoice, who to pay, note. */
export function ProofView({ proof, projectId, token, expectedFcfa }: Props) {
  const gap = proof.invoiceAmountFcfa && expectedFcfa ? Math.round(((proof.invoiceAmountFcfa - expectedFcfa) / expectedFcfa) * 100) : null;

  return (
    <div className="flex flex-col gap-space-md">
      {proof.photos.length > 0 && (
        <section>
          <h3 className="mb-2 flex items-center gap-2 font-title-md text-title-md">
            <Icon name="photo_camera" size={20} className="text-primary" /> Photos ({proof.photos.length})
          </h3>
          <ul className="grid grid-cols-2 gap-2.5">
            {proof.photos.map((p) => (
              <li key={p.id} className="overflow-hidden rounded-2xl bg-surface-container-lowest shadow-sm ring-1 ring-outline-variant/30">
                <a href={fileUrl(projectId, p, token)} target="_blank" rel="noopener noreferrer" className="relative block aspect-[4/3] bg-surface-container">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={fileUrl(projectId, p, token)} alt={`Photo prise le ${formatDateTime(p.takenAt)}`} className="h-full w-full object-cover" loading="lazy" />
                  {p.gps && (
                    <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-[#0A0F24]/70 px-2 py-0.5 font-label-sm text-label-sm text-white backdrop-blur">
                      <Icon name="location_on" size={13} filled /> Géolocalisée
                    </span>
                  )}
                </a>
                <div className="flex flex-col gap-0.5 p-2.5 font-label-sm text-label-sm text-on-surface-variant">
                  <span>{formatDateTime(p.takenAt)}</span>
                  {p.gps ? (
                    <a
                      href={`https://www.openstreetmap.org/?mlat=${p.gps.lat}&mlon=${p.gps.lng}#map=17/${p.gps.lat}/${p.gps.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-primary hover:underline"
                    >
                      {p.gps.lat.toFixed(4)}, {p.gps.lng.toFixed(4)}
                      {p.gps.accuracy ? ` · ±${p.gps.accuracy} m` : ''}
                    </a>
                  ) : (
                    <span className="text-outline">Position non communiquée</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {proof.invoice && (
        <section>
          <h3 className="mb-2 flex items-center gap-2 font-title-md text-title-md">
            <Icon name="receipt_long" size={20} className="text-primary" /> Facture du fournisseur
          </h3>
          <a
            href={fileUrl(projectId, proof.invoice, token)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-2xl bg-surface-container-lowest p-3 shadow-sm ring-1 ring-outline-variant/30 transition hover:shadow-md"
          >
            {isImage(proof.invoice) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fileUrl(projectId, proof.invoice, token)} alt="" className="h-20 w-16 shrink-0 rounded-lg bg-surface-container object-cover" loading="lazy" />
            ) : (
              <span className="flex h-20 w-16 shrink-0 items-center justify-center rounded-lg bg-surface-container text-error">
                <Icon name="picture_as_pdf" size={30} />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate font-label-lg text-label-lg">{proof.invoice.name}</span>
              {proof.invoiceAmountFcfa ? <span className="block font-title-md text-title-md font-bold text-primary">{formatFcfa(proof.invoiceAmountFcfa)}</span> : <span className="block font-body-sm text-body-sm text-on-surface-variant">Montant non indiqué</span>}
              {gap !== null && (
                <span className={`mt-0.5 block font-label-sm text-label-sm ${Math.abs(gap) <= 15 ? 'text-[#15803D]' : 'text-[#B45309]'}`}>
                  {Math.abs(gap) <= 15 ? 'Cohérent avec le montant prévu' : `Écart de ${gap > 0 ? '+' : ''}${gap} % avec le montant prévu`} (≈ {formatFcfa(expectedFcfa!)})
                </span>
              )}
            </span>
            <Icon name="open_in_new" size={18} className="text-on-surface-variant" />
          </a>
        </section>
      )}

      {proof.supplier && (
        <section className="flex items-center gap-3 rounded-2xl bg-surface-container-low p-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Icon name="smartphone" size={22} />
          </span>
          <span className="min-w-0">
            <span className="block font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">Sera payé directement</span>
            <span className="block truncate font-title-md text-title-md">{proof.supplier.name}</span>
            <span className="block truncate font-body-sm text-body-sm text-on-surface-variant">
              {MOBILE_NETWORKS[proof.supplier.network]} · {proof.supplier.phone}
            </span>
          </span>
        </section>
      )}

      {proof.note && (
        <section className="rounded-2xl bg-surface-container-low p-3.5">
          <span className="mb-1 block font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">Message de l&apos;équipe sur place</span>
          <p className="font-body-md text-body-md italic text-on-surface">« {proof.note} »</p>
        </section>
      )}

      <details className="rounded-2xl bg-surface-container-low p-3.5 font-label-sm text-label-sm text-on-surface-variant">
        <summary className="cursor-pointer list-none font-label-md text-label-md font-semibold text-primary">
          <span className="inline-flex items-center gap-1.5">
            <Icon name="fingerprint" size={18} /> Empreintes des fichiers (SHA-256)
          </span>
        </summary>
        <p className="mb-2 mt-2">Ces empreintes sont inscrites dans le registre de preuves. Modifier une photo après coup changerait son empreinte.</p>
        <ul className="flex flex-col gap-1 font-mono text-[11px]">
          {[...proof.photos, ...(proof.invoice ? [proof.invoice] : [])].map((f) => (
            <li key={f.id} className="break-all" title={f.sha256}>
              {f.name.slice(0, 22)} · {shortHash(f.sha256, 12, 8)}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
