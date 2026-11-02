import { z } from 'zod';
import { HttpError, readTextLimited } from './http';

/**
 * Every route validates its input here, at one place: expected types, lengths, ranges, known fields only.
 * Errors are 400 `{ error: <French sentence>, code: 'invalid_input' }`, the shape the screens already display.
 * Services still re-check their business rules (budget = sum of steps...): this is the first line, not the only one.
 */

const GENERIC = /^(Required|Expected|String must|Number must|Array must|Invalid|Unrecognized|Input not instance|Too )/;

function describe(issue: z.ZodIssue): string {
  const field = issue.path.length ? issue.path.join('.') : 'corps de la requête';
  if (issue.message && !GENERIC.test(issue.message)) return issue.message; // a message we wrote ourselves
  switch (issue.code) {
    case 'unrecognized_keys':
      return `Champ inattendu : ${issue.keys.join(', ')}.`;
    case 'invalid_type':
      // zod 4 words a missing field as "...received undefined"
      return /received undefined/.test(issue.message) ? `Le champ « ${field} » est obligatoire.` : `Le champ « ${field} » n'a pas le bon type.`;
    case 'too_small':
      return issue.origin === 'string' || issue.origin === 'array' ? `Le champ « ${field} » est trop court.` : `Le champ « ${field} » est trop petit.`;
    case 'too_big':
      return issue.origin === 'string' || issue.origin === 'array' ? `Le champ « ${field} » est trop long.` : `Le champ « ${field} » est trop grand.`;
    case 'invalid_value':
      return `Le champ « ${field} » a une valeur non autorisée.`;
    default:
      return `Le champ « ${field} » est invalide.`;
  }
}

/** Throws a French 400 describing the first problem. */
export function validate<S extends z.ZodTypeAny>(schema: S, raw: unknown): z.infer<S> {
  const r = schema.safeParse(raw);
  if (r.success) return r.data;
  throw new HttpError(400, describe(r.error.issues[0]), 'invalid_input');
}

export const MAX_JSON_BYTES = 100_000;

/** Reads a JSON body (size-limited; empty = `{}`) and validates it. */
export async function readJson<S extends z.ZodTypeAny>(request: Request, schema: S): Promise<z.infer<S>> {
  const text = await readTextLimited(request, MAX_JSON_BYTES); // 413 as soon as the limit is crossed, not after reading it all
  let raw: unknown = {};
  if (text.trim()) {
    try {
      raw = JSON.parse(text);
    } catch {
      throw new HttpError(400, 'Corps de la requête illisible (JSON invalide).', 'bad_json');
    }
  }
  return validate(schema, raw);
}

/* ------------------------------------------------------------------------- *
 * Schemas
 * ------------------------------------------------------------------------- */

const text = (min: number, max: number, message?: string) => z.string(message ? { error: message } : undefined).trim().min(min, message).max(max, message);
// zod 4: z.number() already refuses NaN and Infinity (reported as an invalid type, which carries our message)
const money = (min: number, max: number, message: string) => z.number({ error: message }).int(message).min(min, message).max(max, message);

const INTERNATIONAL_PHONE = /^\+[1-9]\d{7,14}$/;
export const phoneField = text(6, 24, 'Numéro de téléphone invalide').refine(
  (v) => INTERNATIONAL_PHONE.test(v.replace(/[^0-9+]/g, '')),
  'Numéro de téléphone invalide : utilisez le format international (ex. +221 77 123 45 67).',
);
const codeField = z.string({ error: (issue) => (issue.input === undefined ? 'Entrez le code reçu' : 'Code incorrect') }).trim().max(12, 'Code incorrect');

export const otpRequestSchema = z.object({ phone: phoneField }).strict();
export const loginSchema = z.object({ phone: phoneField, otp: codeField }).strict();
export const registerSchema = z
  .object({
    firstName: text(1, 60, 'Prénom et nom requis'),
    lastName: text(1, 60, 'Prénom et nom requis'),
    country: z.string().regex(/^[A-Z]{2}$/, 'Pays de résidence invalide'),
    phone: phoneField,
    otp: codeField,
  })
  .strict();

export const projectSchema = z
  .object({
    name: text(2, 80, 'Donnez un nom au projet (2 à 80 caractères)'),
    sector: z.enum(['immobilier', 'agricole', 'commerce'], { error: 'Secteur invalide' }),
    city: text(1, 80, 'Indiquez la ville'),
    // the absolute floor; the instance may ask for more (config minBudgetUsd, checked in createProject)
    budgetCents: money(1_000, 50_000_000, 'Le budget doit être compris entre 10 $ et 500 000 $'),
    managerName: text(1, 80, 'Indiquez la personne de confiance sur place'),
    managerPhone: text(0, 24).optional(),
    steps: z
      .array(
        z
          .object({
            title: text(1, 200, "Donnez un nom à chaque étape"),
            amountCents: money(100, 50_000_000, "Montant d'étape invalide"),
            proofKinds: z.array(z.enum(['titre', 'photos', 'facture'])).max(3).optional(),
          })
          .strict(),
        { error: 'Prévoyez entre 1 et 12 étapes' },
      )
      .min(1, 'Prévoyez entre 1 et 12 étapes')
      .max(12, 'Prévoyez entre 1 et 12 étapes'),
  })
  .strict();

export const fundingSchema = z
  .object({
    amountCents: z.number({ error: 'Montant invalide' }).min(1, 'Montant invalide').max(100_000_000, 'Montant trop élevé'),
    method: z.enum(['lightning', 'usdt', 'usdc']).optional(),
  })
  .strict();

export const refundSchema = z
  .object({
    amountCents: money(100, 50_000_000, 'Montant de remboursement invalide'),
    address: z.string({ error: 'Indiquez votre adresse Lightning' }).trim().min(3, 'Indiquez votre adresse Lightning').max(130, 'Adresse Lightning invalide'),
  })
  .strict();

export const quoteSchema = z.object({ simulate: z.boolean().optional() }).strict();
export const rejectSchema = z.object({ note: z.string().max(1000, 'Note trop longue').optional() }).strict();

/** One entry per photo, in the same order as the files. */
export const photoMetaSchema = z
  .array(
    z
      .object({
        takenAt: z
          .string()
          .max(40)
          .refine((s) => !Number.isNaN(Date.parse(s)), 'Date de la photo invalide')
          .refine((s) => Date.parse(s) <= Date.now() + 86_400_000, 'Date de la photo dans le futur')
          .optional(),
        lat: z.number().min(-90).max(90).optional(),
        lng: z.number().min(-180).max(180).optional(),
        accuracy: z.number().min(0).max(1_000_000).optional(),
      })
      .strict(),
  )
  .max(6, 'Six photos au plus');

export const proofFieldsSchema = z
  .object({
    supplierName: z.string().max(200),
    supplierPhone: z.string().max(40),
    supplierNetwork: z.enum(['wave', 'orange_money', 'free_money', 'lightning'], { error: "Choisissez comment le fournisseur est payé (mobile money ou Bitcoin Lightning)" }),
    /** only for supplierNetwork = lightning */
    supplierLightningAddress: z.string().max(130).optional(),
    invoiceAmountFcfa: z.number().min(0).max(1e11).optional(),
    note: z.string().max(2000),
  })
  .strict();
