import { NextResponse, type NextRequest } from 'next/server';

/**
 * Cross-site request protection for the API. A browser tells us where a request comes from (Sec-Fetch-Site, Origin):
 * a state-changing call that comes from another site is refused, so a page on another domain cannot make a signed-in
 * visitor's browser create projects or release payments. Server-to-server calls (Bitnob webhooks) send neither
 * header and are not affected: they are protected by their signature instead.
 */
const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

function allowedHosts(req: NextRequest): Set<string> {
  const hosts = new Set<string>();
  for (const h of [req.headers.get('host'), req.headers.get('x-forwarded-host'), req.nextUrl.host]) {
    if (h) for (const part of h.split(',')) hosts.add(part.trim().toLowerCase());
  }
  try {
    if (process.env.PUBLIC_BASE_URL) hosts.add(new URL(process.env.PUBLIC_BASE_URL).host.toLowerCase());
  } catch {
    /* ignore a malformed PUBLIC_BASE_URL */
  }
  return hosts;
}

export function middleware(req: NextRequest) {
  if (SAFE.has(req.method)) return NextResponse.next();

  const site = req.headers.get('sec-fetch-site');
  const origin = req.headers.get('origin');
  let crossSite = site !== null && site !== 'same-origin' && site !== 'none';
  if (!crossSite && origin && origin !== 'null') {
    try {
      crossSite = !allowedHosts(req).has(new URL(origin).host.toLowerCase());
    } catch {
      crossSite = true;
    }
  } else if (!crossSite && origin === 'null') {
    crossSite = true; // sandboxed iframes and some redirects
  }

  if (crossSite) {
    return NextResponse.json({ error: 'Requête refusée : elle ne vient pas de cette application.', code: 'cross_site' }, { status: 403 });
  }
  return NextResponse.next();
}

export const config = { matcher: '/api/:path*' };
