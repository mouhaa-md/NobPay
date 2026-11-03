'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { ErrorNote, Spinner } from '@/components/ui/primitives';
import { Tc, useT } from '@/lib/i18n/client';
import { ShareLink } from './ShareLink';

interface Props {
  projectId: string;
  /** null when no witness is named */
  witness: { name: string; required: boolean; expired: boolean } | null;
  /** `/temoin/<token>`, only when there is a witness */
  path: string | null;
}

/** The funder names an independent witness, sends them the link, and chooses whether nothing is paid without their yes. */
export function WitnessCard({ projectId, witness, path }: Props) {
  const t = useT();
  const router = useRouter();
  const [name, setName] = useState(witness?.name ?? '');
  const [required, setRequired] = useState(witness?.required ?? false);
  const [editing, setEditing] = useState(!witness);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const call = async (what: string, init: RequestInit) => {
    setBusy(what);
    setError('');
    const res = await fetch(`/api/projects/${projectId}/witness`, { ...init, headers: { 'content-type': 'application/json' } });
    setBusy(null);
    if (!res.ok) return setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? t('Une erreur est survenue'));
    setEditing(false);
    router.refresh();
  };
  const save = (renew = false) => call(renew ? 'renew' : 'save', { method: 'POST', body: JSON.stringify({ name, required, ...(renew ? { renew: true } : {}) }) });

  return (
    <section className="rounded-2xl bg-surface-container-low p-4 lg:p-6">
      <div className="mb-2 flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#E0F2FE] text-[#0369A1]">
          <Icon name="how_to_reg" size={24} />
        </span>
        <div className="min-w-0">
          <p className="font-title-md text-title-md"><Tc>Témoin indépendant</Tc></p>
          <p className="font-body-sm text-body-sm text-on-surface-variant"><Tc>Un voisin, un maçon, un proche : il regarde chaque preuve et dit si elle correspond.</Tc></p>
        </div>
      </div>

      {witness && !editing ? (
        <div className="flex flex-col gap-3">
          <p className="font-body-md text-body-md">
            <strong>{witness.name}</strong> ·{' '}
            {witness.required ? <Tc>aucun paiement sans sa confirmation</Tc> : <Tc>son avis est un conseil, vous décidez</Tc>}
          </p>
          {witness.expired || !path ? (
            <p className="rounded-xl bg-[#FEF3C7] px-3 py-2 font-label-md text-label-md text-[#B45309]"><Tc>Le lien est arrivé à son terme : renouvelez-le.</Tc></p>
          ) : (
            <ShareLink path={path} text={t('Bonjour {name}, voici le lien pour regarder les preuves du projet et dire si elles correspondent :', { name: witness.name })} label={t('Envoyer le lien')} copyLabel={t('Copier le lien')} />
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 font-label-md text-label-md">
            <button type="button" onClick={() => setEditing(true)} className="font-semibold text-primary hover:underline"><Tc>Modifier</Tc></button>
            <button type="button" disabled={busy !== null} onClick={() => save(true)} className="font-semibold text-primary hover:underline disabled:opacity-60">
              {busy === 'renew' ? <Spinner /> : <Tc>Renouveler le lien</Tc>}
            </button>
            <button type="button" disabled={busy !== null} onClick={() => call('remove', { method: 'DELETE' })} className="font-semibold text-error hover:underline disabled:opacity-60">
              {busy === 'remove' ? <Spinner /> : <Tc>Retirer le témoin</Tc>}
            </button>
          </div>
        </div>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label className="flex flex-col gap-1.5">
            <span className="font-label-md text-label-md text-on-surface-variant"><Tc>Son nom (visible dans le dossier public)</Tc></span>
            <input
              className="h-12 w-full rounded-2xl bg-surface-container-lowest px-4 font-body-lg text-on-surface outline-none ring-1 ring-outline-variant/40 focus:ring-2 focus:ring-primary-container"
              value={name}
              maxLength={60}
              autoComplete="off"
              onChange={(e) => setName(e.target.value)}
              placeholder={t('Ex. Ibrahima, voisin du terrain')}
            />
          </label>
          <label className="flex items-start gap-3 rounded-2xl bg-surface-container-lowest p-3 ring-1 ring-outline-variant/40">
            <input type="checkbox" className="mt-1 h-5 w-5 accent-[#1d4ed8]" checked={required} onChange={(e) => setRequired(e.target.checked)} />
            <span className="font-body-sm text-body-sm">
              <strong className="font-label-lg text-label-lg"><Tc>Ne rien payer sans sa confirmation</Tc></strong>
              <br />
              <Tc>Sinon son avis reste un conseil : vous décidez toujours seul.</Tc>
            </span>
          </label>
          <div className="flex items-center gap-2">
            <button type="submit" disabled={busy !== null || name.trim().length < 2} className="inline-flex h-11 items-center gap-2 rounded-full bg-primary-container px-5 font-label-lg text-label-lg font-bold text-on-primary shadow-md disabled:opacity-60">
              {busy === 'save' ? <Spinner /> : <Icon name="person_add" size={20} />} {witness ? <Tc>Enregistrer</Tc> : <Tc>Nommer le témoin</Tc>}
            </button>
            {witness && (
              <button type="button" onClick={() => setEditing(false)} className="h-11 rounded-full px-4 font-label-lg text-label-lg text-on-surface-variant hover:bg-surface-container">
                <Tc>Annuler</Tc>
              </button>
            )}
          </div>
        </form>
      )}
      <ErrorNote>{error}</ErrorNote>
    </section>
  );
}
