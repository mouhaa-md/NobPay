import { randomInt } from 'node:crypto';
import { getConfig } from './config';
import { hmacHex, safeEqual } from './crypto';
import { withDb } from './db';
import { HttpError } from './http';
import { getSmsProvider } from './sms';

/**
 * SMS sign-in codes: 6 random digits per request, stored hashed (HMAC of phone + code, so a code is only
 * good for the phone it was sent to), valid 5 minutes, 5 attempts, single use, and a delay between two requests.
 * Without an SMS provider the only code that exists is the shared demo code, and only if ALLOW_DEMO permits.
 */

export const OTP_TTL_MS = 5 * 60_000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_MS = 30_000;

const hash = (phone: string, code: string) => hmacHex('sha256', getConfig().sessionSecret, `otp:${phone}:${code}`);

export type OtpDelivery = { kind: 'demo'; demoCode: string } | { kind: 'sms'; resendIn: number };

export function smsUnavailable(): HttpError {
  return new HttpError(503, "La connexion par SMS n'est pas encore disponible sur cette instance.", 'sms_unavailable');
}

/** Creates a code for `phone` and sends it. In demo mode (no provider) it just returns the shared demo code. */
export async function requestOtp(phone: string): Promise<OtpDelivery> {
  const { allowDemo, demoOtp } = getConfig();
  const provider = getSmsProvider();
  if (!provider) {
    if (!allowDemo) throw smsUnavailable();
    return { kind: 'demo', demoCode: demoOtp };
  }
  if (phone.replace(/\D/g, '').length < 8) throw new HttpError(400, 'Numéro de téléphone invalide', 'bad_phone');

  const now = Date.now();
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await withDb((db) => {
    const list = (db.otps ??= []);
    // forget old records, then check the resend delay on the last one for this phone
    for (let i = list.length - 1; i >= 0; i--) if (Date.parse(list[i].expiresAt) < now - 3_600_000) list.splice(i, 1);
    const last = list.filter((o) => o.phone === phone).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (last && now - Date.parse(last.createdAt) < OTP_RESEND_MS) {
      const wait = Math.ceil((OTP_RESEND_MS - (now - Date.parse(last.createdAt))) / 1000);
      throw new HttpError(429, `Un code vient d'être envoyé. Patientez ${wait} secondes avant d'en redemander un.`, 'otp_too_soon', wait);
    }
    for (const o of list) if (o.phone === phone && !o.usedAt) o.usedAt = new Date(now).toISOString(); // the new code replaces the old ones
    list.push({ phone, codeHash: hash(phone, code), createdAt: new Date(now).toISOString(), expiresAt: new Date(now + OTP_TTL_MS).toISOString(), attempts: 0 });
  });
  try {
    await provider.send(phone, `NobPay : votre code est ${code}. Il expire dans 5 minutes. Ne le partagez avec personne.`);
  } catch (err) {
    // the code never left: forget it so the resend delay does not lock the user out of a retry
    const h = hash(phone, code);
    await withDb((db) => {
      db.otps = (db.otps ?? []).filter((o) => o.codeHash !== h);
    });
    throw err;
  }
  return { kind: 'sms', resendIn: OTP_RESEND_MS / 1000 };
}

/** Checks the code typed for `phone`. Consumes it on success. Throws a French HttpError otherwise. */
export async function verifyOtp(phone: string, typed: string): Promise<void> {
  const { allowDemo, demoOtp } = getConfig();
  const code = String(typed ?? '').trim();
  if (!getSmsProvider()) {
    if (!allowDemo) throw smsUnavailable();
    if (!safeEqual(code, demoOtp)) throw new HttpError(400, 'Code incorrect', 'bad_otp');
    return;
  }
  const now = Date.now();
  await withDb((db) => {
    const rec = (db.otps ?? [])
      .filter((o) => o.phone === phone && !o.usedAt)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (!rec) throw new HttpError(400, 'Code incorrect ou expiré. Demandez un nouveau code.', 'bad_otp');
    if (Date.parse(rec.expiresAt) < now) {
      rec.usedAt = new Date(now).toISOString();
      throw new HttpError(400, 'Ce code a expiré. Demandez-en un nouveau.', 'otp_expired');
    }
    if (rec.attempts >= OTP_MAX_ATTEMPTS) throw new HttpError(429, 'Trop d\'essais. Demandez un nouveau code.', 'otp_locked');
    if (!/^\d{6}$/.test(code) || !safeEqual(rec.codeHash, hash(phone, code))) {
      rec.attempts += 1;
      // this write must survive the error: withDb discards the draft when the callback throws, so report after
      return { wrong: true as const, left: OTP_MAX_ATTEMPTS - rec.attempts };
    }
    rec.usedAt = new Date(now).toISOString();
    return { wrong: false as const, left: 0 };
  }).then((r) => {
    if (r?.wrong) throw new HttpError(400, r.left > 0 ? `Code incorrect (${r.left} essai${r.left > 1 ? 's' : ''} restant${r.left > 1 ? 's' : ''}).` : 'Code incorrect. Demandez un nouveau code.', 'bad_otp');
  });
}
