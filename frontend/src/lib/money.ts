import { translate, type Lang } from './i18n/messages';
// Number and date formatting, in the reader's language. Amounts are always integer cents (USD).
// Every formatter takes the language last: a `Lang`, or the translator `t` of the component (it carries its language).
// Without one, French.

/** A language, or anything that knows its language (the translator returned by getT() and useT()). */
export type LangLike = Lang | { lang?: Lang } | undefined | null;
// (a translator is a function with a `lang` property, hence the `typeof l === 'function'` below)
export const langOf = (l?: LangLike): Lang => (typeof l === 'string' ? l : l && (typeof l === 'object' || typeof l === 'function') && (l as { lang?: Lang }).lang === 'en' ? 'en' : 'fr');

const NBSP = ' ';

// fr-FR groups digits with a narrow no-break space (U+202F). The app fonts (Figtree, Bricolage Grotesque)
// have no glyph for it, so large amounts would render glued together: use a plain no-break space instead.
const groups = (s: string) => s.replace(/ /g, NBSP);

const LOCALE: Record<Lang, string> = { fr: 'fr-FR', en: 'en-US' };
type Digits = 'int' | 'two' | 'max2';
const cache = new Map<string, Intl.NumberFormat>();
function number(l: LangLike, kind: Digits): Intl.NumberFormat {
  const lang = langOf(l);
  const key = `${lang}:${kind}`;
  let f = cache.get(key);
  if (!f) {
    const options: Intl.NumberFormatOptions = kind === 'int' ? { maximumFractionDigits: 0 } : kind === 'two' ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { maximumFractionDigits: 2 };
    f = new Intl.NumberFormat(LOCALE[lang], options);
    cache.set(key, f);
  }
  return f;
}
const fmt = (n: number, l: LangLike, kind: Digits) => groups(number(l, kind).format(n));

/** 1 520 000 (French) or 1,520,000 (English), digit groups kept together */
export function formatInt(n: number, l?: LangLike): string {
  return fmt(n, l, 'int');
}

/** 760 or 612,5 (exchange rates) */
export function formatRate(rate: number, l?: LangLike): string {
  return fmt(rate, l, 'max2');
}

/** 56 893,30 $ (French) or $56,893.30 (English) */
export function formatUsd(cents: number, l?: LangLike): string {
  const n = fmt(cents / 100, l, 'two');
  return langOf(l) === 'en' ? `$${n}` : `${n}${NBSP}$`;
}

/** 24 000 $ or $24,000 (no decimals when the amount is round) */
export function formatUsdShort(cents: number, l?: LangLike): string {
  const n = fmt(cents / 100, l, cents % 100 === 0 ? 'int' : 'two');
  return langOf(l) === 'en' ? `$${n}` : `${n}${NBSP}$`;
}

/** 1 520 000 FCFA */
export function formatFcfa(amount: number, l?: LangLike): string {
  return `${fmt(Math.round(amount), l, 'int')}${NBSP}FCFA`;
}

/** 23 144 € (French) or €23,144 (English) */
export function formatEur(amount: number, l?: LangLike): string {
  const n = fmt(Math.round(amount), l, 'int');
  return langOf(l) === 'en' ? `€${n}` : `${n}${NBSP}€`;
}

/** 2 500 sats */
export function formatSats(sats: number, l?: LangLike): string {
  return `${fmt(Math.round(sats), l, 'int')}${NBSP}sats`;
}

export function formatBtc(btc: number): string {
  return `${btc.toFixed(8).replace(/0+$/, '').replace(/\.$/, '')}${NBSP}BTC`;
}

export function usdToFcfa(cents: number, rate: number): number {
  return Math.round((cents / 100) * rate);
}

/** The CFA franc is pegged to the euro by treaty. */
export const XOF_PER_EUR = 655.957;

/** Euros for dollars, from the dollar's rate in FCFA (the peg makes it exact: no second source of prices). */
export function usdToEur(cents: number, usdXof: number): number {
  return (cents / 100) * (usdXof / XOF_PER_EUR);
}

/** Countries whose residents think in euros (the funder's residence country decides whether euros are shown). */
const EURO_COUNTRIES = new Set(['FR', 'BE', 'DE', 'IT', 'ES', 'PT', 'NL', 'IE', 'LU', 'AT', 'FI', 'GR']);
export const usesEuro = (country: string | undefined): boolean => EURO_COUNTRIES.has(String(country ?? '').toUpperCase());

export function usdToSats(cents: number, btcUsd: number): number {
  return Math.max(1, Math.round((cents / 100 / btcUsd) * 1e8));
}

export function parseUsdToCents(input: string): number {
  const cleaned = input.replace(/[^0-9.,]/g, '').replace(',', '.');
  const value = Number.parseFloat(cleaned);
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}

const dateFormats = new Map<string, Intl.DateTimeFormat>();
function dates(l: LangLike, kind: 'short' | 'long'): Intl.DateTimeFormat {
  const lang = langOf(l);
  const key = `${lang}:${kind}`;
  let f = dateFormats.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(LOCALE[lang], kind === 'short' ? { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'long', year: 'numeric' });
    dateFormats.set(key, f);
  }
  return f;
}

/** 2 nov., 19:05 or Nov 2, 07:05 PM */
export function formatDateTime(iso: string, l?: LangLike): string {
  return dates(l, 'short').format(new Date(iso));
}

/** 2 novembre 2026 or November 2, 2026 */
export function formatDate(iso: string, l?: LangLike): string {
  return dates(l, 'long').format(new Date(iso));
}

/** « il y a 3 jours », « hier, 18:30 », « aujourd'hui, 11:05 » (`t` puts the words, and the clock, in the visitor's language) */
export function relativeDay(iso: string, t: ((fr: string, vars?: Record<string, string | number>) => string) & { lang?: Lang } = (fr, vars) => translate('fr', fr, vars), now: Date = new Date()): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString(LOCALE[langOf(t as LangLike)], { hour: '2-digit', minute: '2-digit' });
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  if (days <= 0) return t("Aujourd'hui, {time}", { time });
  if (days === 1) return t('Hier, {time}', { time });
  if (days < 7) return t('Il y a {days} jours', { days });
  return formatDate(iso, t as LangLike);
}

export function initials(first: string, last = ''): string {
  return `${first.trim().charAt(0)}${last.trim().charAt(0)}`.toUpperCase() || first.trim().slice(0, 2).toUpperCase();
}
