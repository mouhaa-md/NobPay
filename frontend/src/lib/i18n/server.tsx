import { cookies, headers } from 'next/headers';
import { isLang, LANG_COOKIE, LANG_HEADER, pickLang, translate, translatorFor, type Lang, type Translator, type Vars } from './messages';

/**
 * The language of the current request (server components and route handlers): the language of the address when it has
 * one (/en, stated by proxy.ts), else the visitor's cookie, else the browser's.
 */
export async function getLang(): Promise<Lang> {
  const [jar, h] = await Promise.all([cookies(), headers()]);
  const ofAddress = h.get(LANG_HEADER);
  if (isLang(ofAddress)) return ofAddress;
  return pickLang(jar.get(LANG_COOKIE)?.value, h.get('accept-language'));
}

/** `const t = await getT(); t('Bonjour {name}', { name })` in a server component. */
export async function getT(): Promise<Translator> {
  return translatorFor(await getLang());
}

/** `<T>Texte</T>` in a server component. In a client component use `Tc` from ./client. */
export async function T({ children, vars }: { children: string; vars?: Vars }) {
  return <>{translate(await getLang(), String(children), vars)}</>;
}
