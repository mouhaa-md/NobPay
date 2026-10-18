'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Flag } from '@/components/ui/Flag';
import { Icon } from '@/components/ui/Icon';
import { ErrorNote, Spinner } from '@/components/ui/primitives';
import { shrinkImage } from '@/lib/image';
import { formatInt } from '@/lib/money';
import { MOBILE_NETWORKS } from '@/lib/templates';
import type { MobileNetwork, ProofKind, Supplier } from '@/lib/types';

interface Props {
  token: string;
  projectId: string;
  step: { id: string; index: number; title: string; proofKinds: ProofKind[] };
  /** pre-fill after a refusal */
  previous?: Supplier;
}

interface Photo {
  id: string;
  file: File;
  preview: string;
  takenAt: string;
}
interface Gps {
  lat: number;
  lng: number;
  accuracy?: number;
}

const MAX_PHOTOS = 6;
const NETWORKS = Object.keys(MOBILE_NETWORKS) as MobileNetwork[];
const NET_DOT: Record<MobileNetwork, string> = { wave: 'bg-[#1DC8FF]', orange_money: 'bg-[#FF7900]', free_money: 'bg-[#CD1E26]' };
const nf = { format: formatInt };
const digits = (v: string) => v.replace(/\D/g, '');

export function FieldProofForm({ token, projectId, step, previous }: Props) {
  const router = useRouter();
  const wantsTitle = step.proofKinds.includes('titre');
  const wantsPhotos = step.proofKinds.includes('photos') || wantsTitle;
  const wantsInvoice = step.proofKinds.includes('facture');

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [invoice, setInvoice] = useState<File | null>(null);
  const [invoiceAmount, setInvoiceAmount] = useState('');
  const [name, setName] = useState(previous?.name ?? '');
  const [phone, setPhone] = useState(previous?.phone.replace(/^\+221/, '') ?? '');
  const [network, setNetwork] = useState<MobileNetwork | ''>(previous?.network ?? '');
  const [note, setNote] = useState('');
  const [gps, setGps] = useState<Gps | null>(null);
  const [gpsState, setGpsState] = useState<'idle' | 'asking' | 'ok' | 'denied'>('idle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const invoiceInput = useRef<HTMLInputElement>(null);

  useEffect(() => () => photos.forEach((p) => URL.revokeObjectURL(p.preview)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const locate = () => {
    if (gpsState === 'asking' || gpsState === 'ok') return;
    if (!('geolocation' in navigator)) return setGpsState('denied');
    setGpsState('asking');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
        setGpsState('ok');
      },
      () => setGpsState('denied'),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  };

  const addPhotos = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setError('');
    const room = MAX_PHOTOS - photos.length;
    const files = [...list].filter((f) => f.type.startsWith('image/')).slice(0, room);
    if (files.length === 0) return setError('Choisissez des photos (JPEG, PNG ou WebP).');
    const next: Photo[] = [];
    for (const original of files) {
      const file = await shrinkImage(original);
      next.push({ id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 7)}`, file, preview: URL.createObjectURL(file), takenAt: new Date(original.lastModified || Date.now()).toISOString() });
    }
    setPhotos((p) => [...p, ...next]);
    locate();
  };

  const removePhoto = (id: string) =>
    setPhotos((list) => {
      const gone = list.find((p) => p.id === id);
      if (gone) URL.revokeObjectURL(gone.preview);
      return list.filter((p) => p.id !== id);
    });

  const submit = async () => {
    setError('');
    if (wantsPhotos && photos.length === 0) return setError(wantsTitle ? 'Ajoutez la photo du titre foncier.' : 'Ajoutez au moins une photo.');
    if (wantsInvoice && !invoice) return setError('Ajoutez la facture du fournisseur.');
    if (!name.trim()) return setError('Indiquez le nom de la personne ou de l’entreprise à payer.');
    if (digits(phone).length < 8) return setError('Indiquez son numéro de téléphone mobile money.');
    if (!network) return setError('Choisissez son opérateur mobile money.');

    setBusy(true);
    try {
      const form = new FormData();
      form.set('token', token);
      photos.forEach((p) => form.append('photos', p.file, p.file.name));
      form.set(
        'photoMeta',
        JSON.stringify(photos.map((p) => ({ takenAt: p.takenAt, lat: gps?.lat, lng: gps?.lng, accuracy: gps?.accuracy }))),
      );
      if (invoice) form.set('invoice', await shrinkImage(invoice));
      if (invoiceAmount) form.set('invoiceAmountFcfa', digits(invoiceAmount));
      form.set('supplierName', name.trim());
      form.set('supplierPhone', `+221${digits(phone).replace(/^0+/, '')}`);
      form.set('supplierNetwork', network);
      if (note.trim()) form.set('note', note.trim());

      const res = await fetch(`/api/projects/${projectId}/steps/${step.id}/proof`, { method: 'POST', body: form });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'L’envoi a échoué. Vérifiez votre connexion et réessayez.');
      setSent(true);
      // let the confirmation be read, then switch the page to the "waiting for the funder" state
      setTimeout(() => router.refresh(), 2800);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const field =
    'h-12 w-full rounded-2xl bg-surface-container-low px-space-md font-body-md text-on-surface outline-none transition placeholder:text-outline focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary-container';

  if (sent) {
    return (
      <div className="nob-pop flex flex-col items-center gap-3 rounded-3xl bg-[#DCFCE7] p-space-lg text-center text-[#14532D]">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#16A34A] text-white">
          <Icon name="check" size={36} />
        </span>
        <p className="font-title-lg text-title-lg">Preuve envoyée</p>
        <p className="font-body-md text-body-md">Merci. Le financeur va la regarder, puis valider le paiement.</p>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-space-lg"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {/* 1. Photos */}
      {wantsPhotos && (
        <section className="flex flex-col gap-3">
          <h3 className="flex items-center gap-2 font-title-md text-title-md">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-container font-label-md text-label-md font-bold text-on-primary">1</span>
            {wantsTitle ? 'Photo du titre foncier' : 'Photos de l’avancement'}
          </h3>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            {wantsTitle ? 'Prenez le document en entier, bien lisible.' : 'Prenez le chantier sous plusieurs angles. Elles seront datées et localisées.'}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {photos.map((p) => (
              <div key={p.id} className="relative aspect-square overflow-hidden rounded-2xl bg-surface-container">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.preview} alt="Photo ajoutée" className="h-full w-full object-cover" />
                <button type="button" aria-label="Retirer la photo" onClick={() => removePhoto(p.id)} className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white">
                  <Icon name="close" size={16} />
                </button>
              </div>
            ))}
            {photos.length < MAX_PHOTOS && (
              <button type="button" onClick={() => camera.current?.click()} className="flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-primary-container/50 bg-primary/5 text-primary transition active:scale-95">
                <Icon name="photo_camera" size={28} />
                <span className="font-label-sm text-label-sm font-semibold">Photographier</span>
              </button>
            )}
          </div>
          {photos.length < MAX_PHOTOS && (
            <button type="button" onClick={() => gallery.current?.click()} className="self-start font-label-md text-label-md font-semibold text-primary hover:underline">
              Choisir dans la galerie
            </button>
          )}
          <input ref={camera} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => { addPhotos(e.target.files); e.target.value = ''; }} />
          <input ref={gallery} type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { addPhotos(e.target.files); e.target.value = ''; }} />
          <p className={`flex items-center gap-1.5 font-label-sm text-label-sm ${gpsState === 'ok' ? 'text-[#15803D]' : gpsState === 'denied' ? 'text-[#B45309]' : 'text-on-surface-variant'}`} role="status">
            <Icon name={gpsState === 'ok' ? 'location_on' : gpsState === 'denied' ? 'location_off' : 'my_location'} size={16} filled={gpsState === 'ok'} />
            {gpsState === 'ok' && gps ? `Position ajoutée (±${Math.round(gps.accuracy ?? 0)} m)` : gpsState === 'asking' ? 'Recherche de la position…' : gpsState === 'denied' ? 'Position non partagée : le financeur aura moins de certitude.' : 'La position de votre téléphone sera jointe aux photos.'}
            {gpsState === 'denied' && (
              <button type="button" onClick={() => { setGpsState('idle'); locate(); }} className="font-semibold underline">
                Réessayer
              </button>
            )}
          </p>
        </section>
      )}

      {/* 2. Invoice */}
      {wantsInvoice && (
        <section className="flex flex-col gap-3">
          <h3 className="flex items-center gap-2 font-title-md text-title-md">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-container font-label-md text-label-md font-bold text-on-primary">{wantsPhotos ? 2 : 1}</span>
            Facture du fournisseur
          </h3>
          <button type="button" onClick={() => invoiceInput.current?.click()} className={`flex items-center gap-3 rounded-2xl p-3.5 text-left transition active:scale-[0.99] ${invoice ? 'bg-[#F0FDF4] ring-1 ring-[#16A34A]/30' : 'border-2 border-dashed border-primary-container/50 bg-primary/5'}`}>
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${invoice ? 'bg-[#16A34A] text-white' : 'bg-primary/10 text-primary'}`}>
              <Icon name={invoice ? 'check' : 'receipt_long'} size={24} />
            </span>
            <span className="min-w-0">
              <span className="block truncate font-label-lg text-label-lg">{invoice ? invoice.name : 'Photographier ou choisir la facture'}</span>
              <span className="block font-label-sm text-label-sm text-on-surface-variant">{invoice ? 'Touchez pour changer' : 'Photo ou PDF'}</span>
            </span>
          </button>
          <input ref={invoiceInput} type="file" accept="image/*,application/pdf" className="sr-only" onChange={(e) => { setInvoice(e.target.files?.[0] ?? null); e.target.value = ''; }} />
          <label className="flex flex-col gap-1.5 font-label-md text-label-md text-on-surface-variant">
            Montant de la facture
            <span className="flex items-center rounded-2xl bg-surface-container-low px-space-md focus-within:bg-surface-container-lowest focus-within:ring-2 focus-within:ring-primary-container">
              <input className="h-12 w-full bg-transparent font-body-lg text-on-surface outline-none placeholder:text-outline" inputMode="numeric" placeholder="1 500 000" value={invoiceAmount ? nf.format(Number(digits(invoiceAmount))) : ''} onChange={(e) => setInvoiceAmount(digits(e.target.value).slice(0, 9))} />
              <span className="font-label-lg text-label-lg text-on-surface-variant">FCFA</span>
            </span>
          </label>
        </section>
      )}

      {/* 3. Who to pay */}
      <section className="flex flex-col gap-3">
        <h3 className="flex items-center gap-2 font-title-md text-title-md">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-container font-label-md text-label-md font-bold text-on-primary">{(wantsPhotos ? 1 : 0) + (wantsInvoice ? 1 : 0) + 1}</span>
          Qui doit être payé ?
        </h3>
        <p className="font-body-sm text-body-sm text-on-surface-variant">L&apos;argent est envoyé directement sur son mobile money. Il ne passe pas par vous.</p>
        <label className="flex flex-col gap-1.5 font-label-md text-label-md text-on-surface-variant">
          Nom du fournisseur
          <input className={field} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Ex. Quincaillerie Ndiaye" autoComplete="off" />
        </label>
        <label className="flex flex-col gap-1.5 font-label-md text-label-md text-on-surface-variant">
          Son téléphone mobile money
          <span className="flex items-center gap-2 rounded-2xl bg-surface-container-low p-1.5 focus-within:bg-surface-container-lowest focus-within:ring-2 focus-within:ring-primary-container">
            <span className="flex h-9 items-center gap-1.5 rounded-xl bg-surface-container px-3 font-title-md text-title-md font-bold text-on-surface">
              <Flag code="SN" className="h-3.5 w-5" /> +221
            </span>
            <input className="w-full bg-transparent py-2 pr-3 font-body-lg text-on-surface outline-none placeholder:text-outline" value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" placeholder="77 123 45 67" autoComplete="off" />
          </span>
        </label>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 font-label-md text-label-md text-on-surface-variant">Opérateur</legend>
          <div className="grid grid-cols-3 gap-2">
            {NETWORKS.map((n) => (
              <button key={n} type="button" aria-pressed={network === n} onClick={() => setNetwork(n)} className={`flex h-14 flex-col items-center justify-center gap-1 rounded-2xl font-label-md text-label-md transition active:scale-95 ${network === n ? 'bg-primary/5 font-bold text-primary ring-2 ring-primary-container' : 'bg-surface-container-low text-on-surface'}`}>
                <span className={`h-2.5 w-2.5 rounded-full ${NET_DOT[n]}`} />
                {MOBILE_NETWORKS[n]}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="flex flex-col gap-1.5 font-label-md text-label-md text-on-surface-variant">
          Un mot pour le financeur <span className="font-normal text-outline">(facultatif)</span>
          <textarea className="min-h-20 w-full resize-none rounded-2xl bg-surface-container-low p-3 font-body-md text-on-surface outline-none placeholder:text-outline focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary-container" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex. Les fondations sont coulées, le béton a séché trois jours." />
        </label>
      </section>

      <ErrorNote>{error}</ErrorNote>
      <button type="submit" disabled={busy} className="flex h-14 w-full items-center justify-center gap-space-xs rounded-full bg-primary-container font-label-lg text-label-lg font-bold text-on-primary shadow-lg shadow-primary/25 transition hover:bg-primary active:scale-[0.98] disabled:opacity-60">
        {busy ? <Spinner /> : <Icon name="send" size={22} />} {busy ? 'Envoi en cours…' : 'Envoyer la preuve'}
      </button>
    </form>
  );
}
