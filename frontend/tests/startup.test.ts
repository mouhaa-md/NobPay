import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkStartupConfig } from '@/server/startup';

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
