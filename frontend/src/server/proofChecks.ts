import type { Db, Project, ProofCheck, Step, StoredFile } from '@/lib/types';
import { formatFcfa } from '@/lib/money';

/**
 * What can be checked about a proof without asking anybody (and without any AI): were these very files already used,
 * where and when were the photos taken, does the invoice amount fit the step. Cheap, deterministic, always shown.
 * A check never blocks a payment: `attention` tells the funder where to look more closely.
 */

/** Senegal, with a margin: latitude 12.2 to 16.8, longitude -17.7 to -11.3. */
const SENEGAL = { latMin: 12.2, latMax: 16.8, lngMin: -17.7, lngMax: -11.3 };
const DAY = 24 * 60 * 60_000;
/** The funder is told when the invoice differs from the step by more than this. */
export const AMOUNT_TOLERANCE = 0.15;

export interface ChecksInput {
  db: Pick<Db, 'projects'>;
  project: Project;
  step: Step;
  usdXof: number;
}

export function proofChecks({ db, project, step, usdXof }: ChecksInput): ProofCheck[] {
  const proof = step.proof;
  if (!proof) return [];
  const checks: ProofCheck[] = [];
  const submitted = Date.parse(proof.submittedAt);

  // 1. The same file sent twice, or already used for another step or another project.
  // (the images bundled with the demonstration data are shared on purpose: they are not uploads)
  const uploaded = (files: StoredFile[]) => files.filter((f) => !f.publicPath);
  const own = uploaded([...proof.photos, ...(proof.invoice ? [proof.invoice] : [])]);
  const seenHere = new Set<string>();
  let repeatedHere = 0;
  for (const f of own) {
    if (seenHere.has(f.sha256)) repeatedHere += 1;
    seenHere.add(f.sha256);
  }
  const elsewhere = new Map<string, string>(); // sha256 -> where
  for (const p of db.projects) {
    for (const s of p.steps) {
      if (s.id === step.id || !s.proof) continue;
      for (const f of uploaded([...s.proof.photos, ...(s.proof.invoice ? [s.proof.invoice] : [])])) {
        if (!seenHere.has(f.sha256) || elsewhere.has(f.sha256)) continue;
        elsewhere.set(f.sha256, p.id === project.id ? `l’étape ${s.index} de ce projet` : 'un autre projet');
      }
    }
  }
  if (repeatedHere > 0) checks.push({ id: 'duplicate-here', level: 'attention', text: `${repeatedHere === 1 ? 'Un même fichier a été envoyé' : `${repeatedHere} fichiers ont été envoyés`} plusieurs fois dans cette preuve.` });
  if (elsewhere.size > 0) {
    const where = [...new Set(elsewhere.values())].join(' et ');
    checks.push({ id: 'duplicate-elsewhere', level: 'attention', text: `${elsewhere.size === 1 ? 'Un fichier a déjà servi' : `${elsewhere.size} fichiers ont déjà servi`} comme preuve pour ${where}. Une photo ou une facture ne devrait pas servir deux fois.` });
  }
  if (repeatedHere === 0 && elsewhere.size === 0 && own.length > 0) checks.push({ id: 'duplicate', level: 'ok', text: 'Aucun de ces fichiers n’a déjà servi comme preuve.' });

  // 2. Where the photos were taken.
  if (proof.photos.length > 0) {
    const located = proof.photos.filter((p) => p.gps);
    if (located.length === 0) {
      checks.push({ id: 'gps', level: 'attention', text: 'Aucune photo n’est géolocalisée : impossible de savoir où elles ont été prises.' });
    } else {
      const outside = project.country === 'SN' ? located.filter((p) => !(p.gps!.lat >= SENEGAL.latMin && p.gps!.lat <= SENEGAL.latMax && p.gps!.lng >= SENEGAL.lngMin && p.gps!.lng <= SENEGAL.lngMax)) : [];
      if (outside.length > 0) {
        checks.push({ id: 'gps-outside', level: 'attention', text: `${outside.length === 1 ? 'Une photo a été prise' : `${outside.length} photos ont été prises`} hors du Sénégal d’après leur position.` });
      } else if (located.length < proof.photos.length) {
        checks.push({ id: 'gps', level: 'info', text: `${located.length} photo${located.length > 1 ? 's' : ''} sur ${proof.photos.length} ${located.length > 1 ? 'sont géolocalisées' : 'est géolocalisée'}.` });
      } else {
        checks.push({ id: 'gps', level: 'ok', text: `${located.length === 1 ? 'La photo est géolocalisée' : `Les ${located.length} photos sont géolocalisées`}, au Sénégal.` });
      }
    }

    // 3. When.
    const old = proof.photos.filter((p) => submitted - Date.parse(p.takenAt) > 7 * DAY);
    const future = proof.photos.filter((p) => Date.parse(p.takenAt) - submitted > 10 * 60_000);
    if (future.length > 0) checks.push({ id: 'date-future', level: 'attention', text: 'La date d’une photo est postérieure à son envoi : l’horloge de l’appareil est peut-être fausse.' });
    if (old.length > 0) checks.push({ id: 'date-old', level: 'attention', text: `${old.length === 1 ? 'Une photo date' : `${old.length} photos datent`} de plus d’une semaine avant l’envoi : a-t-elle été prise pour cette étape ?` });
    if (old.length === 0 && future.length === 0) checks.push({ id: 'date', level: 'ok', text: 'Les photos ont été prises dans la semaine qui précède l’envoi.' });
  }

  // 4. The invoice against the step (indicative rate).
  if (proof.invoice) {
    const expected = (step.amountCents / 100) * usdXof;
    if (!proof.invoiceAmountFcfa) {
      checks.push({ id: 'invoice-amount', level: 'info', text: 'Le montant de la facture n’a pas été indiqué.' });
    } else {
      const gap = (proof.invoiceAmountFcfa - expected) / expected;
      const within = Math.abs(gap) <= AMOUNT_TOLERANCE;
      checks.push({
        id: 'invoice-amount',
        level: within ? 'ok' : 'attention',
        text: within
          ? `Le montant de la facture (${formatFcfa(proof.invoiceAmountFcfa)}) est cohérent avec l’étape (≈ ${formatFcfa(expected)}).`
          : `Le montant de la facture (${formatFcfa(proof.invoiceAmountFcfa)}) s’écarte de ${Math.round(Math.abs(gap) * 100)} % de l’étape (≈ ${formatFcfa(expected)}).`,
      });
    }
  }
  return checks;
}
