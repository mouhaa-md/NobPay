import dns from 'node:dns';
import https from 'node:https';
import net from 'node:net';

/**
 * Fetching a JSON document from an address a USER typed (a Lightning address names a domain) is a classic way to make a
 * server call its own internal network (SSRF). This client only talks HTTPS to public hosts:
 *  - no credentials, no custom port, no IP literal, no "localhost" or internal suffix;
 *  - the connection uses the very address that was checked (the check IS the DNS lookup of the connection, so a host
 *    that answers "public" first and "private" a moment later cannot slip through);
 *  - redirects are refused, the answer is size-limited and time-limited.
 */

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeUrlError';
  }
}

const BLOCKED = new net.BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) BLOCKED.addSubnet(address, prefix, 'ipv4');
for (const [address, prefix] of [
  ['::', 128], ['::1', 128], ['64:ff9b::', 96], ['100::', 64], ['2001::', 23], ['2001:db8::', 32],
  ['2002::', 16], ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8],
] as const) BLOCKED.addSubnet(address, prefix, 'ipv6');

/** The IPv4 address hidden inside an IPv4-mapped IPv6 address (::ffff:a.b.c.d), or null. */
function mappedIpv4(ip: string): string | null {
  let host: string;
  try {
    host = new URL(`http://[${ip}]/`).hostname.replace(/^\[|\]$/g, '').toLowerCase(); // the URL parser writes every IPv6 form the same way
  } catch {
    return null;
  }
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(host);
  if (!hex) return null;
  const hi = parseInt(hex[1], 16);
  const lo = parseInt(hex[2], 16);
  return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
}

/**
 * True for a routable public address. Anything unparsable, private, loopback, link-local or reserved is refused.
 * (An IPv4 address wrapped in IPv6 is judged as the IPv4 address it is. The wrapper range itself is NOT in the block
 * list: Node also checks plain IPv4 addresses against IPv6 rules, and that range would then block the whole Internet.)
 */
export function isPublicIp(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 0) return false;
  if (family === 6) {
    const inner = mappedIpv4(ip);
    if (inner) return isPublicIp(inner);
  }
  return !BLOCKED.check(ip, family === 4 ? 'ipv4' : 'ipv6');
}

/** The URL must be https, on a normal domain name. Throws UnsafeUrlError otherwise. */
export function parsePublicHttpsUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError('Adresse invalide.');
  }
  if (url.protocol !== 'https:') throw new UnsafeUrlError('Seules les adresses https sont acceptées.');
  if (url.username || url.password) throw new UnsafeUrlError('Adresse invalide.');
  if (url.port && url.port !== '443') throw new UnsafeUrlError('Port non autorisé.');
  const host = url.hostname.toLowerCase();
  if (net.isIP(host.replace(/^\[|\]$/g, '')) !== 0) throw new UnsafeUrlError('Une adresse IP n’est pas acceptée : utilisez un nom de domaine.');
  if (host === 'localhost' || !host.includes('.') || /\.(localhost|local|internal|lan|home|corp|intranet)$/.test(host)) {
    throw new UnsafeUrlError('Nom de domaine non autorisé.');
  }
  return url;
}

type LookupFn = typeof dns.lookup;

/** A DNS lookup that refuses to hand the connection anything but public addresses. */
export function makeSafeLookup(real: LookupFn = dns.lookup): LookupFn {
  const safe = (hostname: string, options: unknown, callback?: unknown) => {
    const cb = (typeof options === 'function' ? options : callback) as (err: Error | null, a?: unknown, f?: number) => void;
    const opts = (typeof options === 'function' ? {} : options) as dns.LookupOptions;
    (real as unknown as (h: string, o: dns.LookupOptions, c: (e: Error | null, a: dns.LookupAddress[]) => void) => void)(
      hostname,
      { ...opts, all: true },
      (err, addresses) => {
        if (err) return cb(err);
        if (!addresses.length || addresses.some((a) => !isPublicIp(a.address))) {
          return cb(Object.assign(new UnsafeUrlError('Adresse non autorisée.'), { code: 'EBLOCKED' }));
        }
        if (opts.all) return cb(null, addresses);
        return cb(null, addresses[0].address, addresses[0].family);
      },
    );
  };
  return safe as unknown as LookupFn;
}

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  /** tests only */
  lookup?: LookupFn;
  request?: typeof https.request;
}

export class HttpStatusError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'HttpStatusError';
  }
}

/** GET a JSON document from a public https address. */
export async function safeGetJson(rawUrl: string, options: SafeFetchOptions = {}): Promise<unknown> {
  const url = parsePublicHttpsUrl(rawUrl);
  const maxBytes = options.maxBytes ?? 64 * 1024;
  const timeoutMs = options.timeoutMs ?? 8_000;
  const send = options.request ?? https.request;
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      fn();
    };
    const req = send(
      url,
      { method: 'GET', lookup: options.lookup ?? makeSafeLookup(), headers: { accept: 'application/json', 'user-agent': 'NobPay/1.0 (+lnurl-pay)' } },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          res.resume();
          return done(() => reject(new UnsafeUrlError('Redirection refusée.')));
        }
        if (status !== 200) {
          res.resume();
          return done(() => reject(new HttpStatusError(`Réponse HTTP ${status}.`, status)));
        }
        const chunks: Buffer[] = [];
        let total = 0;
        res.on('data', (chunk: Buffer) => {
          total += chunk.length;
          if (total > maxBytes) {
            req.destroy();
            return done(() => reject(new Error('Réponse trop volumineuse.')));
          }
          chunks.push(chunk);
        });
        res.on('end', () =>
          done(() => {
            try {
              resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
            } catch {
              reject(new Error('Réponse illisible (JSON attendu).'));
            }
          }),
        );
        res.on('error', (e) => done(() => reject(e)));
      },
    );
    const deadline = setTimeout(() => {
      req.destroy();
      done(() => reject(new Error('Délai dépassé.')));
    }, timeoutMs);
    req.on('error', (e) => done(() => reject(e)));
    req.end();
  });
}
