import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { LANG_HEADER } from '@/lib/i18n/messages';
import { config, proxy } from '@/proxy';

/**
 * The English landing page lives at /en whatever the visitor's browser says. The root layout writes <html lang> from
 * getLang(), which reads the cookie and then Accept-Language: a French browser opening /en used to get an English page
 * declared as French (screen readers and search engines read it with the wrong language). Found by the first Docker run.
 * proxy.ts now states the language of that address in a request header that getLang() reads first.
 */
const state = vi.hoisted(() => ({ cookie: undefined as string | undefined, headers: {} as Record<string, string> }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (name: string) => (name === 'nobpay-lang' && state.cookie ? { name, value: state.cookie } : undefined) }),
  headers: async () => new Headers(state.headers),
}));
const { getLang } = await import('@/lib/i18n/server');

afterEach(() => {
  state.cookie = undefined;
  state.headers = {};
});

/** What the page will see of the request: Next carries the headers a proxy sets in x-middleware-request-* */
const seenByPage = (res: Response, name: string) => res.headers.get(`x-middleware-request-${name}`);
const get = (path: string, headers: Record<string, string> = {}) => proxy(new NextRequest(`http://localhost:3000${path}`, { headers }));

describe('the proxy states the language of /en', () => {
  it('forces English on /en, for a French browser, an English one and one that says nothing', () => {
    const browsers: Record<string, string>[] = [{ 'accept-language': 'fr-FR,fr;q=0.9' }, { 'accept-language': 'en-US' }, {}];
    for (const headers of browsers) {
      expect(seenByPage(get('/en', headers), LANG_HEADER)).toBe('en');
    }
  });

  it('overrides a value sent by the visitor, and leaves every other address alone', () => {
    expect(seenByPage(get('/en', { [LANG_HEADER]: 'fr' }), LANG_HEADER)).toBe('en');
    for (const path of ['/', '/app/accueil', '/api/health', '/verifier']) {
      expect(seenByPage(get(path), LANG_HEADER), path).toBeNull();
    }
  });

  it('runs for /en and for the API, and for nothing else', () => {
    expect(config.matcher).toEqual(['/api/:path*', '/en']);
  });
});

describe('getLang', () => {
  it('takes the language of the address before the cookie and the browser', async () => {
    state.headers = { [LANG_HEADER]: 'en', 'accept-language': 'fr-FR' };
    state.cookie = 'fr';
    expect(await getLang()).toBe('en');
  });

  it('ignores a value that is not a language, then reads the cookie, then the browser, as before', async () => {
    state.headers = { [LANG_HEADER]: 'de', 'accept-language': 'en-US' };
    expect(await getLang()).toBe('en');
    state.cookie = 'fr';
    expect(await getLang()).toBe('fr');
    state.cookie = undefined;
    state.headers = { 'accept-language': 'fr-SN,fr' };
    expect(await getLang()).toBe('fr');
    state.headers = {};
    expect(await getLang()).toBe('fr');
  });
});
