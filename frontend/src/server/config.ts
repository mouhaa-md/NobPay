import path from 'node:path';
import type { GatewayMode } from '@/lib/types';

/** Development fallback only. It is public (it is in the repository): never accepted where it would matter. */
export const DEV_SESSION_SECRET = 'nobpay-dev-session-secret';
const WEAK_SESSION_SECRETS = new Set([DEV_SESSION_SECRET, 'change-me', 'changeme', 'secret']);

/** Why a SESSION_SECRET is not acceptable, or null when it is fine. */
export function sessionSecretProblem(secret: string | undefined): string | null {
  if (!secret) return "SESSION_SECRET est absent : le cookie de session pourrait être forgé par n'importe qui.";
  if (WEAK_SESSION_SECRETS.has(secret)) return 'SESSION_SECRET a une valeur par défaut (publique).';
  if (secret.length < 32) return 'SESSION_SECRET doit faire au moins 32 caractères.';
  return null;
}

/**
 * Demo conveniences (demo account, the one-for-all SMS code, data reset, simulated payments) are accepted when
 * ALLOW_DEMO=1, refused when ALLOW_DEMO=0, and by default only in mock mode (nothing real is at stake there).
 */
export function isDemoAllowed(): boolean {
  const flag = process.env.ALLOW_DEMO;
  if (flag === '1') return true;
  if (flag === '0') return false;
  return process.env.BITNOB_MODE !== 'sandbox';
}

/** The session secret must be strong as soon as Bitnob keys are in play, or in production without demo mode. */
export function sessionSecretMustBeStrong(): boolean {
  return process.env.BITNOB_MODE === 'sandbox' || (process.env.NODE_ENV === 'production' && !isDemoAllowed());
}

/** Read lazily so tests and `.env.local` changes are picked up. */
export function getConfig() {
  const mode: GatewayMode = process.env.BITNOB_MODE === 'sandbox' ? 'sandbox' : 'mock';
  const publicBaseUrl = (process.env.PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
  return {
    mode,
    allowDemo: isDemoAllowed(),
    /** session cookie gets the Secure flag when the public URL is https */
    secureCookies: publicBaseUrl.startsWith('https://'),
    baseUrl: (process.env.BITNOB_BASE_URL || 'https://api.bitnob.com').replace(/\/$/, ''),
    clientId: process.env.BITNOB_CLIENT_ID || '',
    clientSecret: process.env.BITNOB_CLIENT_SECRET || '',
    // In mock mode the simulator signs its own events with this default secret.
    webhookSecret: process.env.BITNOB_WEBHOOK_SECRET || (mode === 'mock' ? 'nobpay-mock-webhook-secret' : ''),
    publicBaseUrl,
    sessionSecret: process.env.SESSION_SECRET || DEV_SESSION_SECRET,
    demoOtp: process.env.DEMO_OTP || '123456',
    usdXof: Number(process.env.USD_XOF_RATE) || 760,
    btcUsd: Number(process.env.BTC_USD_RATE) || 81500,
    dataDir: process.env.DATA_DIR || path.join(process.cwd(), '.data'),
    captureWebhooks: process.env.CAPTURE_WEBHOOKS === '1',
  };
}

export type AppConfig = ReturnType<typeof getConfig>;
