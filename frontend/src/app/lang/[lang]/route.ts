import { isLang, LANG_COOKIE, safeNext } from '@/lib/i18n/messages';

export const dynamic = 'force-dynamic';

/**
 * `/lang/en?next=/app` remembers the visitor's language choice (a cookie, one year) and sends them back where they were.
 * The Location is a path of this site and relative, so it stays right behind a reverse proxy and cannot be turned into
 * a redirect to another site.
 */
export async function GET(request: Request, props: { params: Promise<{ lang: string }> }) {
  const { lang } = await props.params;
  const next = safeNext(new URL(request.url).searchParams.get('next'));
  const headers = new Headers({ Location: next, 'Cache-Control': 'no-store' });
  if (isLang(lang)) headers.append('Set-Cookie', `${LANG_COOKIE}=${lang}; Path=/; Max-Age=31536000; SameSite=Lax`);
  return new Response(null, { status: 303, headers });
}
