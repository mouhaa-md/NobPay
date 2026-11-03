import { EN } from './en';

/**
 * The text of the app is written in French in the code, and the English wording lives in one dictionary (en.ts) keyed by
 * the French sentence. A sentence with no English counterpart is shown in French rather than not at all, so a missing
 * translation is a gap, never a broken screen; `npm test` reports how many are missing. A sentence may carry
 * `{name}` placeholders, filled from `vars`. Other languages (Wolof, ...) are added the same way: one more dictionary.
 */

export type Lang = 'fr' | 'en';
export const LANGS: readonly Lang[] = ['fr', 'en'];
export const LANG_COOKIE = 'nobpay-lang';

export const isLang = (v: unknown): v is Lang => v === 'fr' || v === 'en';

/** JSX collapses whitespace; keys are stored the same way. */
export const normalizeKey = (s: string): string => s.replace(/\s+/g, ' ').trim();

/**
 * Marks a French sentence kept in a table (`label: fr('Payée')`) that is translated where it is shown (`t(row.label)`).
 * It does nothing at run time; scripts/i18n-missing.mjs reads it like t('…'), so a missing translation is reported.
 */
export const fr = (sentence: string): string => sentence;

export type Vars = Record<string, string | number>;

/** What `getT()` and `useT()` return: the translator, which also knows its language (amounts and dates follow it). */
export type Translator = ((fr: string, vars?: Vars) => string) & { lang: Lang };
export const translatorFor = (lang: Lang): Translator => Object.assign((fr: string, vars?: Vars) => translate(lang, fr, vars), { lang });

export function translate(lang: Lang, sentence: string, vars?: Vars): string {
  let text = sentence;
  if (lang === 'en') {
    const key = normalizeKey(sentence);
    // own entries only: a step the user called « constructor » must not find Object.prototype.constructor
    const found = Object.prototype.hasOwnProperty.call(EN, key) ? EN[key] : undefined;
    // the English sentence takes the French one's leading and trailing spaces, so text built around it still reads right
    if (found !== undefined) text = (sentence.match(/^\s*/)?.[0] ?? '') + found + (sentence.match(/\s*$/)?.[0] ?? '');
  }
  return vars ? text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole)) : text;
}

/** The visitor's language: their explicit choice (cookie), else what the browser asks for, else French. */
export function pickLang(cookie: string | undefined, acceptLanguage: string | null | undefined): Lang {
  if (isLang(cookie)) return cookie;
  for (const part of (acceptLanguage ?? '').split(',')) {
    const tag = part.split(';')[0].trim().toLowerCase();
    if (tag.startsWith('fr')) return 'fr';
    if (tag.startsWith('en')) return 'en';
  }
  return 'fr';
}

/** Where `/lang/<code>?next=…` may send the visitor back to: a path of this site, nothing else. */
export function safeNext(next: string | null | undefined): string {
  if (!next || !/^\/(?![/\\])[^\s\\]*$/.test(next)) return '/';
  return next;
}
