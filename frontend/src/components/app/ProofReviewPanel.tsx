'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { ErrorNote, Spinner } from '@/components/ui/primitives';
import type { AiReview, CheckLevel, ProofCheck } from '@/lib/types';

const LOOK: Record<CheckLevel, { icon: string; dot: string }> = {
  ok: { icon: 'check', dot: 'bg-[#16A34A] text-white' },
  attention: { icon: 'warning', dot: 'bg-[#F59E0B] text-white' },
  info: { icon: 'remove', dot: 'bg-surface-container-high text-on-surface-variant' },
};

const MATCH: Record<string, string> = { yes: 'correspond à l’étape', partly: 'correspond en partie', no: 'ne correspond pas à l’étape', unclear: 'difficile à juger' };
const PHOTO_CONCERN: Record<string, string> = {
  screenshot_or_screen_photo: 'photo d’un écran ou capture d’écran',
  stock_or_internet_image: 'ressemble à une image d’internet',
  looks_generated: 'semble générée par ordinateur',
  unrelated_to_step: 'sans rapport apparent avec l’étape',
  low_quality: 'image de mauvaise qualité',
};

function Points({ checks }: { checks: ProofCheck[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {checks.map((c) => (
        <li key={c.id} className="flex items-start gap-2.5">
          <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${LOOK[c.level].dot}`}>
            <Icon name={LOOK[c.level].icon} size={13} />
          </span>
          <span className="font-body-sm text-body-sm text-on-surface">{c.text}</span>
        </li>
      ))}
    </ul>
  );
}

interface Props {
  projectId: string;
  stepId: string;
  /** controls computed by the server from the data, always shown */
  checks: ProofCheck[];
  /** the AI is available on this instance */
  aiEnabled: boolean;
  /** the advice already obtained for this proof */
  review?: AiReview;
}

/**
 * What to look at before releasing money. The first part is plain checks done by the server. The second is the AI's
 * advice, which only exists if the funder asks for it (the photos and the invoice are then sent to the Anthropic API).
 */
export function ProofReviewPanel({ projectId, stepId, checks, aiEnabled, review: initial }: Props) {
  const router = useRouter();
  const [review, setReview] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const attention = checks.filter((c) => c.level === 'attention').length;

  const ask = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/steps/${stepId}/review`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'Impossible d’obtenir l’avis de l’IA.');
      setReview(json.review);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const done = review?.state === 'done';
  const aiPoints: ProofCheck[] = done ? [...(review!.checks ?? []), ...(review!.flags ?? []).map((f, i) => ({ id: `flag-${i}`, level: f.level as CheckLevel, text: f.text }))] : [];

  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-surface-container-lowest p-4 shadow-sm ring-1 ring-outline-variant/30" aria-label="Points à vérifier">
      <h3 className="flex items-center gap-2 font-title-md text-title-md">
        <Icon name="fact_check" size={20} className="text-primary" /> À regarder avant de payer
        {attention > 0 && <span className="rounded-full bg-[#FEF3C7] px-2 py-0.5 font-label-sm text-label-sm font-semibold text-[#92400E]">{attention} point{attention > 1 ? 's' : ''} d’attention</span>}
      </h3>
      {checks.length > 0 ? <Points checks={checks} /> : <p className="font-body-sm text-body-sm text-on-surface-variant">Rien à signaler automatiquement.</p>}
      <p className="font-label-sm text-label-sm text-on-surface-variant">Ces contrôles sont faits par notre serveur à partir des fichiers et de leurs métadonnées. Ils aident, ils ne décident pas.</p>

      {aiEnabled && (
        <div className="mt-1 border-t border-outline-variant/40 pt-3">
          <p className="mb-2 flex items-center gap-2 font-label-lg text-label-lg font-semibold">
            <Icon name="visibility" size={18} className="text-primary" /> Avis de l’IA <span className="font-normal text-on-surface-variant">(consultatif)</span>
          </p>

          {done ? (
            <div className="flex flex-col gap-3">
              {review!.summary && <p className="font-body-md text-body-md">{review!.summary}</p>}
              {review!.photos && review!.photos.length > 0 && (
                <ul className="flex flex-col gap-1.5">
                  {review!.photos.map((p) => (
                    <li key={p.index} className="font-body-sm text-body-sm text-on-surface-variant">
                      <strong className="text-on-surface">Photo {p.index}</strong> : {MATCH[p.matchesStep] ?? p.matchesStep}. {p.observation}
                      {p.concerns.length > 0 && <span className="text-[#92400E]"> ({p.concerns.map((c) => PHOTO_CONCERN[c] ?? c).join(', ')})</span>}
                    </li>
                  ))}
                </ul>
              )}
              {review!.invoice && (
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  <strong className="text-on-surface">Facture lue par l’IA</strong> :{' '}
                  {review!.invoice.readable
                    ? [review!.invoice.supplierName, review!.invoice.totalAmount !== null ? `${review!.invoice.totalAmount} ${review!.invoice.currency ?? ''}`.trim() : null, review!.invoice.date, review!.invoice.reference ? `réf. ${review!.invoice.reference}` : null].filter(Boolean).join(' · ') || 'rien de lisible'
                    : 'illisible'}
                  {review!.invoice.itemsSummary ? `. ${review!.invoice.itemsSummary}` : ''}
                </p>
              )}
              {aiPoints.length > 0 && <Points checks={aiPoints} />}
              {review!.notes?.map((n) => (
                <p key={n} className="font-label-sm text-label-sm text-on-surface-variant">
                  {n}
                </p>
              ))}
              <p className="rounded-xl bg-surface-container-low px-3 py-2 font-label-sm text-label-sm text-on-surface-variant">
                L’IA peut se tromper : c’est un deuxième regard, pas une preuve. Vous décidez. Avis du {new Date(review!.at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}.
              </p>
            </div>
          ) : (
            <>
              {review && <p className="mb-2 rounded-xl bg-error-container/60 px-3 py-2 font-body-sm text-body-sm text-on-error-container">{review.error ?? 'L’avis de l’IA n’a pas pu être obtenu.'}</p>}
              <p className="mb-2.5 font-body-sm text-body-sm text-on-surface-variant">
                Une IA (Claude, d’Anthropic) regarde les photos et lit la facture, puis signale ce qui ne colle pas. <strong>Les photos et la facture de cette preuve lui sont envoyées</strong>, et rien d’autre sur vous.
              </p>
              <button
                type="button"
                onClick={ask}
                disabled={busy}
                className="inline-flex h-10 items-center gap-2 rounded-full bg-surface-container px-4 font-label-md text-label-md font-semibold text-primary transition hover:bg-surface-container-high disabled:opacity-60"
              >
                {busy ? <Spinner className="h-4 w-4" /> : <Icon name="visibility" size={18} />} {busy ? 'Lecture en cours…' : review ? 'Réessayer' : 'Demander l’avis de l’IA'}
              </button>
            </>
          )}
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}
    </section>
  );
}
