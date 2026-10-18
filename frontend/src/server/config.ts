import path from 'node:path';
import type { GatewayMode } from '@/lib/types';

/** Read lazily so tests and `.env.local` changes are picked up. */
export function getConfig() {
  const mode: GatewayMode = process.env.BITNOB_MODE === 'sandbox' ? 'sandbox' : 'mock';
  return {
    mode,
    baseUrl: (process.env.BITNOB_BASE_URL || 'https://api.bitnob.com').replace(/\/$/, ''),
    clientId: process.env.BITNOB_CLIENT_ID || '',
    clientSecret: process.env.BITNOB_CLIENT_SECRET || '',
    // In mock mode the simulator signs its own events with this default secret.
    webhookSecret: process.env.BITNOB_WEBHOOK_SECRET || (mode === 'mock' ? 'nobpay-mock-webhook-secret' : ''),
    publicBaseUrl: (process.env.PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/$/, ''),
    sessionSecret: process.env.SESSION_SECRET || 'nobpay-dev-session-secret',
    demoOtp: process.env.DEMO_OTP || '123456',
    usdXof: Number(process.env.USD_XOF_RATE) || 760,
    btcUsd: Number(process.env.BTC_USD_RATE) || 81500,
    dataDir: process.env.DATA_DIR || path.join(process.cwd(), '.data'),
  };
}

export type AppConfig = ReturnType<typeof getConfig>;
