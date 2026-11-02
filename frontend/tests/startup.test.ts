import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkStartupConfig, nwcUrlProblem } from '@/server/startup';

const STRONG = 'a-long-random-secret-of-more-than-32-characters';
afterEach(() => vi.unstubAllEnvs());

describe('startup configuration check', () => {
  it('lets the default mock demo start with no setting at all', () => {
    vi.stubEnv('BITNOB_MODE', '');
    vi.stubEnv('SESSION_SECRET', '');
    expect(checkStartupConfig()).toEqual({ fatal: [], warnings: [] });
  });

  it('only warns for a production build in mock mode with the default secret (local plan B)', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('BITNOB_MODE', 'mock');
    vi.stubEnv('SESSION_SECRET', '');
    const r = checkStartupConfig();
    expect(r.fatal).toEqual([]);
    expect(r.warnings).toHaveLength(1);
  });

  it.each([['', 'absent'], ['change-me', 'default'], ['x'.repeat(20), 'short']])('refuses to start in sandbox with a %j SESSION_SECRET (%s)', (secret) => {
    vi.stubEnv('BITNOB_MODE', 'sandbox');
    vi.stubEnv('SESSION_SECRET', secret);
    expect(checkStartupConfig().fatal.join(' ')).toMatch(/SESSION_SECRET/);
  });

  it('refuses a weak secret in production when demo mode is off', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('BITNOB_MODE', 'mock');
    vi.stubEnv('ALLOW_DEMO', '0');
    vi.stubEnv('SESSION_SECRET', 'change-me');
    expect(checkStartupConfig().fatal).toHaveLength(1);
  });

  it('starts in sandbox with a strong secret; warns loudly when the shared demo code is also on', () => {
    vi.stubEnv('BITNOB_MODE', 'sandbox');
    vi.stubEnv('SESSION_SECRET', STRONG);
    vi.stubEnv('ALLOW_DEMO', '');
    expect(checkStartupConfig()).toEqual({ fatal: [], warnings: [] });
    vi.stubEnv('ALLOW_DEMO', '1');
    const r = checkStartupConfig();
    expect(r.fatal).toEqual([]);
    expect(r.warnings.join(' ')).toMatch(/DEMO_OTP/);
  });

  describe('real bitcoin (LIGHTNING_RAIL=nwc)', () => {
    const KEY = 'ab'.repeat(32);
    const SECRET = 'cd'.repeat(32);
    const nwc = (over: { host?: string; secret?: string | null; relays?: string[]; scheme?: string } = {}) => {
      const params = new URLSearchParams();
      for (const r of over.relays ?? ['wss://relay.example']) params.append('relay', r);
      if (over.secret !== null) params.set('secret', over.secret ?? SECRET);
      return `${over.scheme ?? 'nostr+walletconnect'}://${over.host ?? KEY}?${params}`;
    };
    const real = () => {
      vi.stubEnv('LIGHTNING_RAIL', 'nwc');
      vi.stubEnv('SESSION_SECRET', STRONG);
      vi.stubEnv('ALLOW_DEMO', '0');
      vi.stubEnv('NWC_RECEIVE_URL', nwc());
    };

    it('starts with a valid receive connection and a valid payout connection, nothing to say', () => {
      real();
      vi.stubEnv('NWC_PAYOUT_URL', nwc({ secret: 'ef'.repeat(32) }));
      expect(checkStartupConfig()).toEqual({ fatal: [], warnings: [] });
    });

    it('starts without a payout connection, and says payments and refunds are then off', () => {
      real();
      const r = checkStartupConfig();
      expect(r.fatal).toEqual([]);
      expect(r.warnings.join(' ')).toMatch(/NWC_PAYOUT_URL/);
    });

    it('refuses to start with a weak session secret (the sessions guard real money)', () => {
      real();
      vi.stubEnv('SESSION_SECRET', 'change-me');
      expect(checkStartupConfig().fatal.join(' ')).toMatch(/SESSION_SECRET/);
    });

    it('refuses to start with the shared demo code on (anyone could open an account that holds real sats)', () => {
      real();
      for (const flag of ['1', '']) {
        vi.stubEnv('ALLOW_DEMO', flag); // unset also counts as on outside sandbox mode
        expect(checkStartupConfig().fatal.join(' ')).toMatch(/ALLOW_DEMO=0/);
      }
    });

    it('refuses to start without a receive connection, or with an unusable one, without ever printing the secret', () => {
      real();
      for (const url of ['', 'https://example.com', nwc({ scheme: 'http' }), nwc({ host: 'nothex' }), nwc({ secret: null }), nwc({ secret: 'short' }), nwc({ relays: [] }), nwc({ relays: ['https://not-a-relay'] })]) {
        vi.stubEnv('NWC_RECEIVE_URL', url);
        const fatal = checkStartupConfig().fatal.join(' ');
        expect(fatal, url).toMatch(/NWC_RECEIVE_URL/);
        expect(fatal).not.toContain(SECRET);
      }
    });

    it('refuses to start with a payout connection that is set but unusable', () => {
      real();
      vi.stubEnv('NWC_PAYOUT_URL', nwc({ secret: 'oops' }));
      const r = checkStartupConfig();
      expect(r.fatal.join(' ')).toMatch(/NWC_PAYOUT_URL/);
      expect(r.fatal.join(' ')).not.toContain('oops');
    });

    it.each([
      [`nostr+walletconnect://${'ab'.repeat(32)}?relay=wss%3A%2F%2Frelay.example&secret=${'cd'.repeat(32)}`, null],
      [`nostr+walletconnect://${'AB'.repeat(32)}?relay=ws://localhost:7777&secret=${'CD'.repeat(32)}`, null],
      [`  nostr+walletconnect://${'ab'.repeat(32)}?relay=wss://a.example&relay=wss://b.example&secret=${'cd'.repeat(32)}  `, null],
      [undefined, 'absente'],
      ['', 'absente'],
      ['not a url', 'illisible'],
      [`nostr+walletconnect:${'ab'.repeat(32)}`, 'clé publique du portefeuille invalide'],
    ])('nwcUrlProblem(%j) = %j', (value, expected) => {
      expect(nwcUrlProblem(value)).toBe(expected);
    });
  });

  describe('Nostr commitments (NOSTR_PUBLISH=1)', () => {
    it('says nothing while publishing is off, whatever the key', () => {
      vi.stubEnv('NOSTR_MASTER_KEY', 'not hex');
      expect(checkStartupConfig()).toEqual({ fatal: [], warnings: [] });
    });

    it('refuses a master key that is not 64 hexadecimal characters', () => {
      vi.stubEnv('NOSTR_PUBLISH', '1');
      for (const bad of ['abc', 'zz'.repeat(32), 'ab'.repeat(33)]) {
        vi.stubEnv('NOSTR_MASTER_KEY', bad);
        expect(checkStartupConfig().fatal.join(' ')).toMatch(/NOSTR_MASTER_KEY/);
      }
    });

    it('refuses to publish with keys that anyone could derive: no master key and a missing, default or short session secret', () => {
      vi.stubEnv('NOSTR_PUBLISH', '1');
      vi.stubEnv('NOSTR_MASTER_KEY', '');
      for (const secret of ['', 'change-me', 'x'.repeat(20)]) {
        vi.stubEnv('SESSION_SECRET', secret);
        expect(checkStartupConfig().fatal.join(' '), secret).toMatch(/NOSTR_MASTER_KEY/);
      }
      vi.stubEnv('NOSTR_MASTER_KEY', 'ab'.repeat(32)); // with its own master key the session secret is another matter
      vi.stubEnv('SESSION_SECRET', '');
      expect(checkStartupConfig().fatal.join(' ')).not.toMatch(/Nostr|NOSTR/);
    });

    it('accepts a good master key; warns about the fallback only where it matters (production, real bitcoin)', () => {
      vi.stubEnv('NOSTR_PUBLISH', '1');
      vi.stubEnv('NOSTR_MASTER_KEY', 'ab'.repeat(32));
      expect(checkStartupConfig()).toEqual({ fatal: [], warnings: [] });

      vi.stubEnv('NOSTR_MASTER_KEY', '');
      vi.stubEnv('SESSION_SECRET', STRONG);
      expect(checkStartupConfig().warnings).toEqual([]); // a demo may derive the keys from a strong SESSION_SECRET
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('SESSION_SECRET', STRONG);
      expect(checkStartupConfig().warnings.join(' ')).toMatch(/NOSTR_MASTER_KEY/);
    });
  });

  it('refuses keys that look like production (live) keys, in sandbox mode', () => {
    vi.stubEnv('BITNOB_MODE', 'sandbox');
    vi.stubEnv('SESSION_SECRET', STRONG);
    vi.stubEnv('BITNOB_CLIENT_ID', 'some-id');
    vi.stubEnv('BITNOB_CLIENT_SECRET', 'prd:live_' + 'ab'.repeat(8));
    expect(checkStartupConfig().fatal.join(' ')).toMatch(/production/);
    vi.stubEnv('BITNOB_CLIENT_SECRET', 'prd:sandbox_' + 'ab'.repeat(8)); // a sandbox key shares the prd: prefix
    expect(checkStartupConfig().fatal).toEqual([]);
  });
});
