import { cookies, headers } from 'next/headers';
import { LANG_COOKIE, pickLang, translate, type Lang, type Vars } from './messages';

/** The language of the current request (server components and route handlers). */
export async function getLang(): Promise<Lang> {
  const [jar, h] = await Promise.all([cookies(), headers()]);
  return pickLang(jar.get(LANG_COOKIE)?.value, h.get('accept-language'));
}

/** `const t = await getT(); t('Bonjour {name}', { name })` in a server component. */
export async function getT() {
  const lang = await getLang();
  return (fr: string, vars?: Vars) => translate(lang, fr, vars);
}

/** `<T>Texte</T>` in a server component. In a client component use `Tc` from ./client. */
export async function T({ children, vars }: { children: string; vars?: Vars }) {
  return <>{translate(await getLang(), String(children), vars)}</>;
}
