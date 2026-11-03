'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { translate, translatorFor, type Lang, type Translator, type Vars } from './messages';

const LangContext = createContext<Lang>('fr');

/** Put once in the root layout: client components then read the language of the request. */
export function I18nProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

export const useLang = (): Lang => useContext(LangContext);

/** `const t = useT(); t('Bonjour {name}', { name })` in a client component. */
export function useT(): Translator {
  return translatorFor(useLang());
}

/** `<Tc>Texte</Tc>` in a client component (the server counterpart is `T` from ./server). */
export function Tc({ children, vars }: { children: string; vars?: Vars }) {
  return <>{translate(useLang(), String(children), vars)}</>;
}
