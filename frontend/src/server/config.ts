import path from 'node:path';
import type { GatewayMode } from '@/lib/types';

/** Indicative USD -> XOF rate of the demonstration (observed at Bitnob on 18 Oct. 2026: about 593). Override with USD_XOF_RATE. */
export const DEFAULT_USD_XOF = 593;

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
  return process.env.BITNOB_MODE === 'sandbox' || isRealBitcoin() || (process.env.NODE_ENV === 'production' && !isDemoAllowed());
}

/** Real sats move through a Nostr Wallet Connect wallet (LIGHTNING_RAIL=nwc): everything about this instance is serious. */
export function isRealBitcoin(): boolean {
  return (process.env.LIGHTNING_RAIL || '').toLowerCase() === 'nwc';
}

const positive = (value: string | undefined, fallback: number): number => (Number(value) > 0 ? Number(value) : fallback);

/** How the screens call this instance: simulation, Bitnob test API, or real bitcoin. */
export function instanceMode(): 'mock' | 'sandbox' | 'real' {
  return isRealBitcoin() ? 'real' : process.env.BITNOB_MODE === 'sandbox' ? 'sandbox' : 'mock';
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
    usdXof: Number(process.env.USD_XOF_RATE) || DEFAULT_USD_XOF,
    btcUsd: Number(process.env.BTC_USD_RATE) || 81500,
    dataDir: process.env.DATA_DIR || path.join(process.cwd(), '.data'),
    captureWebhooks: process.env.CAPTURE_WEBHOOKS === '1',
    /** phone numbers (comma separated, any format) allowed to open the back-office page */
    adminPhones: (process.env.ADMIN_PHONES || '')
      .split(',')
      .map((p) => p.replace(/[^0-9+]/g, ''))
      .filter(Boolean),
    /**
     * Largest step a project may have, in dollars (0 = no limit). Bitnob refuses a Senegal mobile money payout above
     * 200 000 XOF (~336 $), so in sandbox a bigger step could never be paid: it is refused when the project is created.
     */
    maxStepUsd: process.env.MAX_STEP_USD !== undefined && process.env.MAX_STEP_USD !== '' ? Number(process.env.MAX_STEP_USD) || 0 : mode === 'sandbox' ? 330 : 0,
    /**
     * Smallest project budget, in dollars. 100 on the Bitnob sandbox (where a payout has real limits), 10 elsewhere so the
     * "essai rapide" (15 $) exists on the demo and on the real-bitcoin instance. MIN_BUDGET_USD overrides it.
     */
    minBudgetUsd: positive(process.env.MIN_BUDGET_USD, mode === 'sandbox' ? 100 : 10),
    /** How long a Lightning invoice can be paid. Short on purpose: the escrow is credited in dollars, the bitcoin price moves. */
    fundingInvoiceTtlSeconds: Math.min(86_400, Math.max(300, Number(process.env.FUNDING_INVOICE_TTL_SECONDS) || 3_600)),
    /**
     * Real Bitcoin over Lightning, through wallets we reach with Nostr Wallet Connect (NIP-47). The RECEIVE connection
     * should only be allowed to make invoices and look them up; the PAYOUT connection pays, and should carry a budget.
     * The ceilings bound what a pilot or a public demo can ever put at risk.
     */
    lightning: {
      rail: (isRealBitcoin() ? 'nwc' : '') as 'nwc' | '',
      receiveUrl: process.env.NWC_RECEIVE_URL || '',
      payoutUrl: process.env.NWC_PAYOUT_URL || '',
      maxFundingUsd: positive(process.env.LIGHTNING_MAX_FUNDING_USD, 100),
      maxPayoutUsd: positive(process.env.LIGHTNING_MAX_PAYOUT_USD, 100),
      /** total real escrow all projects together may hold, in dollars */
      maxEscrowUsd: positive(process.env.LIGHTNING_MAX_ESCROW_USD, 500),
    },
    /**
     * Notifications on the phone (Web Push): need a pair of VAPID keys (node scripts/vapid-keys.mjs). Without them the
     * feature is simply off. The private key never leaves the server.
     */
    push: {
      enabled: process.env.PUSH !== '0' && !!process.env.VAPID_PUBLIC_KEY && !!process.env.VAPID_PRIVATE_KEY,
      publicKey: process.env.VAPID_PUBLIC_KEY || '',
      /** mailto: or https: address the push services can reach in case of trouble */
      subject: process.env.VAPID_SUBJECT || 'mailto:contact@nobpay.invalid',
    },
    /**
     * The AI's advice on a proof (AI_REVIEW=1 and ANTHROPIC_API_KEY). Opt-in: the photos and the invoice of a proof are sent
     * to the Anthropic API when the funder asks for the advice, and each review costs money. Set a spending limit on the key.
     */
    ai: {
      requested: process.env.AI_REVIEW === '1',
      enabled: process.env.AI_REVIEW === '1' && !!process.env.ANTHROPIC_API_KEY,
      model: process.env.AI_MODEL || 'claude-opus-5-5',
      /** reviews the whole instance may run in 24 hours */
      dailyCap: positive(process.env.AI_DAILY_CAP, 50),
    },
    /**
     * Commitments of the ledger on Nostr relays (NOSTR_PUBLISH=1). Opt-in like AUTO_ANCHOR: it talks to public relays.
     * Only hashes leave the machine. The signing keys are derived per project from NOSTR_MASTER_KEY.
     */
    nostr: {
      publish: process.env.NOSTR_PUBLISH === '1',
      relays: (process.env.NOSTR_RELAYS || '')
        .split(',')
        .map((r) => r.trim())
        .filter(Boolean),
      /** relays that must accept a commitment before it counts as published (or all of them, if fewer are configured) */
      minAcks: positive(process.env.NOSTR_MIN_ACKS, 2),
    },
    /** "Try without an account": a private guest account per visitor, no phone number (ALLOW_GUEST=1) */
    allowGuest: process.env.ALLOW_GUEST === '1',
    /** the stablecoin payouts are paid from (and conversions end in) */
    payoutAsset: (process.env.PAYOUT_ASSET || 'USDT').toUpperCase(),
    /** '' = no SMS provider (demo code only), 'log' = codes written to the server console, 'twilio' */
    smsProvider: (process.env.SMS_PROVIDER || '').toLowerCase(),
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID || '',
      authToken: process.env.TWILIO_AUTH_TOKEN || '',
      from: process.env.TWILIO_FROM || '',
    },
  };
}

export type AppConfig = ReturnType<typeof getConfig>;
