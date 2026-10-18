import { getConfig } from './config';
import { HttpError } from './http';

/**
 * SMS delivery behind one small interface, so the provider can change without touching the sign-in logic.
 *  - `log`    : writes the message to the SERVER console. Development only: anyone with the logs can read the codes.
 *  - `twilio` : Twilio REST API (needs TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM).
 * Which provider fits Senegal / France best (cost, coverage) is a product decision still to be taken.
 */

export interface SmsProvider {
  readonly name: string;
  send(to: string, text: string): Promise<void>;
}

export const logSmsProvider: SmsProvider = {
  name: 'log',
  async send(to, text) {
    // Deliberate exception to the masking rules: this provider exists to PRINT the code, for local development.
    console.info(`[sms:log] to ${to}: ${text}`);
  },
};

export function twilioSmsProvider(opts: { accountSid: string; authToken: string; from: string }): SmsProvider {
  return {
    name: 'twilio',
    async send(to, text) {
      const body = new URLSearchParams({ To: to.startsWith('+') ? to : `+${to}`, From: opts.from, Body: text });
      let res: Response;
      try {
        res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(opts.accountSid)}/Messages.json`, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${opts.accountSid}:${opts.authToken}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body,
          signal: AbortSignal.timeout(15_000),
        });
      } catch {
        throw new HttpError(502, "Impossible d'envoyer le SMS pour le moment. Réessayez.", 'sms_failed');
      }
      if (!res.ok) throw new HttpError(502, "Le SMS n'a pas pu être envoyé. Vérifiez le numéro ou réessayez.", 'sms_failed');
    },
  };
}

const g = globalThis as unknown as { __nobpaySms?: SmsProvider | null };

/** Tests (and nothing else) can force a provider. */
export function setSmsProviderForTests(p: SmsProvider | null): void {
  g.__nobpaySms = p;
}

/** The configured provider, or null when none is (then only the demo code can exist). */
export function getSmsProvider(): SmsProvider | null {
  if (g.__nobpaySms) return g.__nobpaySms;
  const c = getConfig();
  if (c.smsProvider === 'log') return logSmsProvider;
  if (c.smsProvider === 'twilio') {
    if (!c.twilio.accountSid || !c.twilio.authToken || !c.twilio.from) return null; // incomplete: treated as not configured
    return twilioSmsProvider(c.twilio);
  }
  return null;
}
