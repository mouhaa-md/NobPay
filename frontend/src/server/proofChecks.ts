import { hamming } from '@/lib/dhash';
import { translate, type Lang, type Vars } from '@/lib/i18n/messages';
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
/** Differing bits (of 64) under which two photos are taken for the same picture: against another proof, and inside one proof. */
export const SIMILAR_ELSEWHERE = 6;
export const SIMILAR_HERE = 3;

export type Translate = ((fr: string, vars?: Vars) => string) & { lang?: Lang };
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

  // 1b. The same picture again, though the file is not the same (cropped, shrunk differently, saved again).
  const similar = new Map<string, string>(); // fingerprint of mine -> where it was seen
  const mine = proof.photos.filter((p) => p.dhash && !p.publicPath);
  for (const p of db.projects) {
    for (const s of p.steps) {
      if (s.id === step.id || !s.proof) continue;
      for (const other of s.proof.photos) {
        if (!other.dhash || other.publicPath) continue;
        for (const m of mine) {
          if (m.sha256 === other.sha256 || hamming(m.dhash!, other.dhash) > SIMILAR_ELSEWHERE) continue; // an identical file is the check above
          similar.set(m.dhash!, p.id === project.id ? t('l’étape {index} de ce projet', { index: s.index }) : t('un autre projet'));
        }
      }
    }
  }
  if (similar.size > 0) {
    const where = [...new Set(similar.values())].join(t(' et '));
    checks.push({
      id: 'duplicate-similar',
      level: 'attention',
      text: one(similar.size, 'Une photo ressemble beaucoup à une photo déjà envoyée comme preuve pour {where} (la même image, recadrée ou réenregistrée ?).', '{n} photos ressemblent beaucoup à des photos déjà envoyées comme preuve pour {where} (les mêmes images, recadrées ou réenregistrées ?).', { where }),
    });
  }
  let pairs = 0;
  for (let i = 0; i < mine.length; i++) for (let j = i + 1; j < mine.length; j++) if (mine[i].sha256 !== mine[j].sha256 && hamming(mine[i].dhash!, mine[j].dhash!) <= SIMILAR_HERE) pairs += 1;
  if (pairs > 0) checks.push({ id: 'duplicate-similar-here', level: 'attention', text: one(pairs, 'Deux photos de cette preuve sont presque identiques.', '{n} paires de photos de cette preuve sont presque identiques.') });

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

    // 2b. What the photos themselves say (read inside the original file by the phone): where they were taken.
    const inside = (g: { lat: number; lng: number }) => g.lat >= SENEGAL.latMin && g.lat <= SENEGAL.latMax && g.lng >= SENEGAL.lngMin && g.lng <= SENEGAL.lngMax;
    const withPlace = proof.photos.filter((p) => p.exif?.gps);
    const withMoment = proof.photos.filter((p) => p.exif?.takenAt);
    if (withPlace.length === 0 && withMoment.length === 0) {
      checks.push({ id: 'exif-none', level: 'info', text: t('Ces photos ne portent ni date ni position de prise de vue (elles ont peut-être transité par une messagerie, qui les efface) : on ne peut s’appuyer que sur la date du fichier et la position du téléphone.') });
    } else if (withPlace.length > 0) {
      const far = project.country === 'SN' ? withPlace.filter((p) => !inside(p.exif!.gps!)) : [];
      if (far.length > 0) {
        checks.push({ id: 'exif-gps-outside', level: 'attention', text: one(far.length, 'Une photo porte, dans ses données, une position hors du Sénégal : elle n’a pas été prise là.', '{n} photos portent, dans leurs données, une position hors du Sénégal : elles n’ont pas été prises là.') });
      } else if (withPlace.length < proof.photos.length) {
        checks.push({ id: 'exif-gps', level: 'info', text: one(withPlace.length, '{n} photo sur {total} porte sa propre position de prise de vue.', '{n} photos sur {total} portent leur propre position de prise de vue.', { total: proof.photos.length }) });
      } else {
        checks.push({ id: 'exif-gps', level: 'ok', text: t('La position inscrite dans les photos elles-mêmes (celle de la prise de vue) est au Sénégal.') });
      }
    }

    // 3. When.
    const shot = (p: (typeof proof.photos)[number]) => Date.parse(p.exif?.takenAt ?? p.takenAt);
    const old = proof.photos.filter((p) => submitted - shot(p) > 7 * DAY);
    const future = proof.photos.filter((p) => shot(p) - submitted > 10 * 60_000);
    if (future.length > 0) checks.push({ id: 'date-future', level: 'attention', text: t('La date d’une photo est postérieure à son envoi : l’horloge de l’appareil est peut-être fausse.') });
    if (old.length > 0) {
      checks.push({ id: 'date-old', level: 'attention', text: one(old.length, 'Une photo date de plus d’une semaine avant l’envoi : a-t-elle été prise pour cette étape ?', '{n} photos datent de plus d’une semaine avant l’envoi : ont-elles été prises pour cette étape ?') });
    }
    if (old.length === 0 && future.length === 0) {
      const fromShot = proof.photos.every((p) => p.exif?.takenAt);
      checks.push({ id: 'date', level: 'ok', text: fromShot ? t('D’après leurs données de prise de vue, les photos datent de la semaine qui précède l’envoi.') : t('D’après la date de leurs fichiers, les photos datent de la semaine qui précède l’envoi.') });
    }
  }

  // 4. The invoice against the step (indicative rate).
  if (proof.invoice) {
    const expected = (step.amountCents / 100) * usdXof;
    if (!proof.invoiceAmountFcfa) {
      checks.push({ id: 'invoice-amount', level: 'info', text: t('Le montant de la facture n’a pas été indiqué.') });
    } else {
      const gap = (proof.invoiceAmountFcfa - expected) / expected;
      const within = Math.abs(gap) <= AMOUNT_TOLERANCE;
      const vars = { invoice: formatFcfa(proof.invoiceAmountFcfa, t), expected: formatFcfa(expected, t), gap: Math.round(Math.abs(gap) * 100) };
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
