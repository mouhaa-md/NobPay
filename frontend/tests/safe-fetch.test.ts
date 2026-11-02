import { EventEmitter } from 'node:events';
import type https from 'node:https';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { HttpStatusError, isPublicIp, makeSafeLookup, parsePublicHttpsUrl, safeGetJson, UnsafeUrlError } from '@/server/lightning/safeFetch';

describe('isPublicIp', () => {
  it.each(['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.32.0.1', '172.15.255.255', '2606:4700:4700::1111', '::ffff:8.8.8.8', '::ffff:808:808'])('%s is public', (ip) => {
    expect(isPublicIp(ip)).toBe(true);
  });

  it.each([
    '127.0.0.1', '127.8.8.8', '10.0.0.1', '10.255.255.255', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1',
    '0.0.0.0', '224.0.0.1', '255.255.255.255', '192.0.2.1', '198.18.0.1', '::', '::1', 'fe80::1', 'fc00::1', 'fd12:3456::1',
    '::ffff:127.0.0.1', '::ffff:10.0.0.1', '::ffff:7f00:1', '0:0:0:0:0:ffff:a00:1', '::ffff:c0a8:101', '2001:db8::1', '64:ff9b::7f00:1', 'not-an-ip', '',
  ])('%j is refused', (ip) => {
    expect(isPublicIp(ip)).toBe(false);
  });
});

describe('parsePublicHttpsUrl', () => {
  it('accepts a normal https address', () => {
    expect(parsePublicHttpsUrl('https://wallet.example/.well-known/lnurlp/moussa').hostname).toBe('wallet.example');
    expect(parsePublicHttpsUrl('https://wallet.example:443/x').port).toBe('');
  });

  it.each([
    'http://wallet.example/x',
    'ftp://wallet.example/x',
    'https://user:pw@wallet.example/x',
    'https://wallet.example:8443/x',
    'https://127.0.0.1/x',
    'https://169.254.169.254/latest/meta-data',
    'https://[::1]/x',
    'https://localhost/x',
    'https://app.localhost/x',
    'https://printer.local/x',
    'https://db.internal/x',
    'https://intranet/x',
    'not a url',
    '',
  ])('refuses %j', (raw) => {
    expect(() => parsePublicHttpsUrl(raw)).toThrow(UnsafeUrlError);
  });
});

describe('makeSafeLookup: the connection only ever gets a public address', () => {
  type Addr = { address: string; family: number };
  const dns = (addresses: Addr[]) =>
    ((host: string, opts: unknown, cb: (e: Error | null, a: Addr[]) => void) => {
      void host;
      void opts;
      cb(null, addresses);
    }) as never;
  const call = (lookup: ReturnType<typeof makeSafeLookup>, opts: object) =>
    new Promise<{ err: (Error & { code?: string }) | null; result: unknown }>((resolve) => {
      (lookup as unknown as (h: string, o: object, cb: (e: Error | null, a?: unknown, f?: number) => void) => void)('wallet.example', opts, (err, a, f) => resolve({ err, result: f === undefined ? a : [a, f] }));
    });

  it('hands over a public address (both calling styles)', async () => {
    const lookup = makeSafeLookup(dns([{ address: '93.184.216.34', family: 4 }]));
    expect(await call(lookup, {})).toEqual({ err: null, result: ['93.184.216.34', 4] });
    expect(await call(lookup, { all: true })).toEqual({ err: null, result: [{ address: '93.184.216.34', family: 4 }] });
  });

  it('refuses a name that resolves to a private address, even when only one of several answers is private', async () => {
    const mixed = makeSafeLookup(dns([{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.7', family: 4 }]));
    expect((await call(mixed, {})).err?.code).toBe('EBLOCKED');
    const loopback = makeSafeLookup(dns([{ address: '127.0.0.1', family: 4 }]));
    expect((await call(loopback, { all: true })).err?.code).toBe('EBLOCKED');
    expect((await call(makeSafeLookup(dns([])), {})).err?.code).toBe('EBLOCKED');
  });
});

describe('safeGetJson', () => {
  /** A fake https.request that answers with a status and a body. */
  const answering = (status: number, body: string) =>
    vi.fn((_url: URL, options: { lookup?: unknown }, cb: (res: PassThrough & { statusCode?: number }) => void) => {
      void options;
      const req = new EventEmitter() as EventEmitter & { end(): void; destroy: ReturnType<typeof vi.fn> };
      req.destroy = vi.fn();
      req.end = () => {
        const res = new PassThrough() as PassThrough & { statusCode?: number };
        res.statusCode = status;
        cb(res);
        res.write(body);
        res.end();
      };
      return req;
    }) as unknown as typeof https.request;

  const lookup = makeSafeLookup(((h: string, o: unknown, cb: (e: null, a: { address: string; family: number }[]) => void) => cb(null, [{ address: '93.184.216.34', family: 4 }])) as never);

  it('parses a JSON answer', async () => {
    const request = answering(200, '{"tag":"payRequest"}');
    await expect(safeGetJson('https://wallet.example/x', { request, lookup })).resolves.toEqual({ tag: 'payRequest' });
  });

  it('passes the safe lookup to the connection', async () => {
    const request = answering(200, '{}');
    await safeGetJson('https://wallet.example/x', { request, lookup });
    expect((request as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].lookup).toBe(lookup);
  });

  it('refuses a redirect (it could lead anywhere)', async () => {
    await expect(safeGetJson('https://wallet.example/x', { request: answering(302, ''), lookup })).rejects.toThrow(UnsafeUrlError);
  });

  it('reports an HTTP error with its status', async () => {
    await expect(safeGetJson('https://wallet.example/x', { request: answering(503, 'down'), lookup })).rejects.toMatchObject({ name: 'HttpStatusError', status: 503 });
    expect(HttpStatusError).toBeDefined();
  });

  it('refuses an answer that is too big', async () => {
    await expect(safeGetJson('https://wallet.example/x', { request: answering(200, JSON.stringify({ x: 'y'.repeat(500) })), lookup, maxBytes: 100 })).rejects.toThrow(/volumineuse/);
  });

  it('refuses something that is not JSON', async () => {
    await expect(safeGetJson('https://wallet.example/x', { request: answering(200, '<html>'), lookup })).rejects.toThrow(/JSON/);
  });

  it('never even connects to an unsafe address', async () => {
    const request = answering(200, '{}');
    await expect(safeGetJson('https://127.0.0.1/x', { request, lookup })).rejects.toThrow(UnsafeUrlError);
    await expect(safeGetJson('http://wallet.example/x', { request, lookup })).rejects.toThrow(UnsafeUrlError);
    expect(request).not.toHaveBeenCalled();
  });
});
