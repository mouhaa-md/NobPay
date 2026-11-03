import { translate, type Vars } from '@/lib/i18n/messages';
import type { Db, Project, ProofCheck, Step, StoredFile } from '@/lib/types';
import { formatFcfa } from '@/lib/money';

/**
 * What can be checked about a proof without asking anybody (and without any AI): were these very files already used,
 * where and when were the photos taken, does the invoice amount fit the step. Cheap, deterministic, always shown.
 * A check never blocks a payment: `attention` tells the funder where to look more closely.
 * The sentences are written in French and put in the visitor's language with `t`.
 */

/** Senegal, with a margin: latitude 12.2 to 16.8, longitude -17.7 to -11.3. */
const SENEGAL = { latMin: 12.2, latMax: 16.8, lngMin: -17.7, lngMax: -11.3 };
const DAY = 24 * 60 * 60_000;
/** The funder is told when the invoice differs from the step by more than this. */
export const AMOUNT_TOLERANCE = 0.15;

export type Translate = (fr: string, vars?: Vars) => string;
export const inFrench: Translate = (fr, vars) => translate('fr', fr, vars);

export interface ChecksInput {
  db: Pick<Db, 'projects'>;
  project: Project;
  step: Step;
  usdXof: number;
  t?: Translate;
}

export function proofChecks({ db, project, step, usdXof, t = inFrench }: ChecksInput): ProofCheck[] {
  const proof = step.proof;
  if (!proof) return [];
  const checks: ProofCheck[] = [];
  const submitted = Date.parse(proof.submittedAt);
  const one = (n: number, singular: string, plural: string, vars: Vars = {}) => t(n === 1 ? singular : plural, { n, ...vars });

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
        elsewhere.set(f.sha256, p.id === project.id ? t('l’étape {index} de ce projet', { index: s.index }) : t('un autre projet'));
      }
    }
  }
  if (repeatedHere > 0) {
    checks.push({ id: 'duplicate-here', level: 'attention', text: one(repeatedHere, 'Un même fichier a été envoyé plusieurs fois dans cette preuve.', '{n} fichiers ont été envoyés plusieurs fois dans cette preuve.') });
  }
  if (elsewhere.size > 0) {
    const where = [...new Set(elsewhere.values())].join(t(' et '));
    checks.push({
      id: 'duplicate-elsewhere',
      level: 'attention',
      text: one(elsewhere.size, 'Un fichier a déjà servi comme preuve pour {where}. Une photo ou une facture ne devrait pas servir deux fois.', '{n} fichiers ont déjà servi comme preuve pour {where}. Une photo ou une facture ne devrait pas servir deux fois.', { where }),
    });
  }
  if (repeatedHere === 0 && elsewhere.size === 0 && own.length > 0) checks.push({ id: 'duplicate', level: 'ok', text: t('Aucun de ces fichiers n’a déjà servi comme preuve.') });

  // 2. Where the photos were taken.
  if (proof.photos.length > 0) {
    const located = proof.photos.filter((p) => p.gps);
    if (located.length === 0) {
      checks.push({ id: 'gps', level: 'attention', text: t('Aucune position n’a été jointe aux photos : impossible de savoir d’où la preuve a été envoyée.') });
    } else {
      const outside = project.country === 'SN' ? located.filter((p) => !(p.gps!.lat >= SENEGAL.latMin && p.gps!.lat <= SENEGAL.latMax && p.gps!.lng >= SENEGAL.lngMin && p.gps!.lng <= SENEGAL.lngMax)) : [];
      if (outside.length > 0) {
        checks.push({ id: 'gps-outside', level: 'attention', text: one(outside.length, 'Une photo a été envoyée depuis un téléphone situé hors du Sénégal (d’après sa position).', '{n} photos ont été envoyées depuis un téléphone situé hors du Sénégal (d’après sa position).') });
      } else if (located.length < proof.photos.length) {
        checks.push({ id: 'gps', level: 'info', text: one(located.length, '{n} photo sur {total} porte la position du téléphone.', '{n} photos sur {total} portent la position du téléphone.', { total: proof.photos.length }) });
      } else {
        // what is checked is where the phone was when it SENT the proof, not where each photo was taken
        checks.push({ id: 'gps', level: 'ok', text: one(located.length, 'La position du téléphone à l’envoi est au Sénégal.', 'La position du téléphone à l’envoi (jointe aux {n} photos) est au Sénégal.') });
      }
    }

    // 3. When.
    const old = proof.photos.filter((p) => submitted - Date.parse(p.takenAt) > 7 * DAY);
    const future = proof.photos.filter((p) => Date.parse(p.takenAt) - submitted > 10 * 60_000);
    if (future.length > 0) checks.push({ id: 'date-future', level: 'attention', text: t('La date d’une photo est postérieure à son envoi : l’horloge de l’appareil est peut-être fausse.') });
    if (old.length > 0) {
      checks.push({ id: 'date-old', level: 'attention', text: one(old.length, 'Une photo date de plus d’une semaine avant l’envoi : a-t-elle été prise pour cette étape ?', '{n} photos datent de plus d’une semaine avant l’envoi : ont-elles été prises pour cette étape ?') });
    }
    if (old.length === 0 && future.length === 0) checks.push({ id: 'date', level: 'ok', text: t('D’après la date de leurs fichiers, les photos datent de la semaine qui précède l’envoi.') });
  }

  // 4. The invoice against the step (indicative rate).
  if (proof.invoice) {
    const expected = (step.amountCents / 100) * usdXof;
    if (!proof.invoiceAmountFcfa) {
      checks.push({ id: 'invoice-amount', level: 'info', text: t('Le montant de la facture n’a pas été indiqué.') });
    } else {
      const gap = (proof.invoiceAmountFcfa - expected) / expected;
      const within = Math.abs(gap) <= AMOUNT_TOLERANCE;
      const vars = { invoice: formatFcfa(proof.invoiceAmountFcfa), expected: formatFcfa(expected), gap: Math.round(Math.abs(gap) * 100) };
      checks.push({
        id: 'invoice-amount',
        level: within ? 'ok' : 'attention',
        text: within
          ? t('Le montant de la facture ({invoice}) est cohérent avec l’étape (≈ {expected}).', vars)
          : t('Le montant de la facture ({invoice}) s’écarte de {gap} % de l’étape (≈ {expected}).', vars),
      });
    }
  }
  return checks;
}
