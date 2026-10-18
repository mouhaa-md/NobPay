import { cookies } from 'next/headers';
import type { User } from '@/lib/types';
import { RESIDENCE_COUNTRIES } from '@/lib/templates';
import { getConfig, sessionSecretMustBeStrong, sessionSecretProblem } from './config';
import { hmacHex, randomId, safeEqual } from './crypto';
import { readDb, withDb } from './db';
import { HttpError } from './http';
import { startJobs } from './jobs';
import { smsUnavailable as smsUnavailableError, verifyOtp } from './otp';

export const smsUnavailable = smsUnavailableError;
import { DEMO_USER_ID } from './seed';

/**
 * Prototype authentication: a signed cookie, and a demo-only SMS code (there is no SMS provider here).
 *
 * Cookie value: `<userId>.<version>.<expiresAt>.<hmac>`. The HMAC covers all three fields, so none can be
 * changed. `version` must equal the user's current `sessionVersion`: raising it (sign out) invalidates every
 * cookie issued before, on every device. The lifetime is 7 days, renewed on use (see requireUser).
 */

const COOKIE = 'nobpay_session';
export const SESSION_SECONDS = 60 * 60 * 24 * 7;
const RENEW_AFTER_SECONDS = 60 * 60 * 24; // re-issue the cookie when it is more than a day old

/** Throws when the configuration says the secret must be strong and it is not. */
export function assertSessionSecret(): string {
  const { sessionSecret } = getConfig();
  if (sessionSecretMustBeStrong()) {
    const problem = sessionSecretProblem(process.env.SESSION_SECRET);
    if (problem) throw new HttpError(500, `Configuration refusée : ${problem}`, 'weak_session_secret');
  }
  return sessionSecret;
}

const sign = (uid: string, version: number, exp: number) => hmacHex('sha256', assertSessionSecret(), `session:${uid}:${version}:${exp}`);

export interface SessionToken {
  uid: string;
  version: number;
  /** expiry, seconds since epoch */
  exp: number;
}

export function sessionValue(uid: string, version = 0, now = Date.now(), lifetime = SESSION_SECONDS): string {
  const exp = Math.floor(now / 1000) + lifetime;
  return `${uid}.${version}.${exp}.${sign(uid, version, exp)}`;
}

export function parseSession(value: string | undefined, now = Date.now()): SessionToken | null {
  if (!value) return null;
  const parts = value.split('.');
  if (parts.length !== 4) return null;
  const [uid, v, e, mac] = parts;
  const version = Number(v);
  const exp = Number(e);
  if (!uid || !Number.isInteger(version) || version < 0 || !Number.isInteger(exp)) return null;
  if (!safeEqual(mac, sign(uid, version, exp))) return null;
  if (exp * 1000 <= now) return null;
  return { uid, version, exp };
}

async function readSession(): Promise<{ user: User; token: SessionToken } | null> {
  startJobs(); // fallback: the first request starts the background loop if the startup hook did not
  const token = parseSession(cookies().get(COOKIE)?.value);
  if (!token) return null;
  const db = await readDb();
  const user = db.users.find((u) => u.id === token.uid);
  if (!user || (user.sessionVersion ?? 0) !== token.version) return null;
  return { user, token };
}

export async function getSessionUser(): Promise<User | null> {
  return (await readSession())?.user ?? null;
}

function setSessionCookie(user: User): void {
  cookies().set(COOKIE, sessionValue(user.id, user.sessionVersion ?? 0), {
    httpOnly: true,
    sameSite: 'lax',
    secure: getConfig().secureCookies,
    path: '/',
    maxAge: SESSION_SECONDS,
  });
}

export async function requireUser(): Promise<User> {
  const session = await readSession();
  if (!session) throw new HttpError(401, 'Connectez-vous pour continuer', 'unauthenticated');
  // Sliding expiry: only route handlers can write cookies, which is where requireUser runs.
  if (session.token.exp - Math.floor(Date.now() / 1000) < SESSION_SECONDS - RENEW_AFTER_SECONDS) {
    try {
      setSessionCookie(session.user);
    } catch {
      /* not in a context where cookies can be written */
    }
  }
  return session.user;
}

export function startSession(user: User): void {
  setSessionCookie(user);
}

/**
 * Signs the current user out on every device (raises the session version) and removes the cookie.
 * The shared demo account keeps its version: signing out of it must not kick other visitors.
 */
export async function endSession(): Promise<void> {
  const session = await readSession().catch(() => null);
  if (session && !session.user.demo) {
    await withDb((db) => {
      const u = db.users.find((x) => x.id === session.user.id);
      if (u) u.sessionVersion = (u.sessionVersion ?? 0) + 1;
    });
  }
  cookies().delete(COOKIE);
}

export const normalizePhone = (phone: string): string => phone.replace(/[^0-9+]/g, '');

export async function registerUser(input: {
  firstName: string;
  lastName: string;
  country: string;
  phone: string;
  otp: string;
}): Promise<User> {
  const firstName = String(input.firstName ?? '').trim().slice(0, 60);
  const lastName = String(input.lastName ?? '').trim().slice(0, 60);
  const phone = normalizePhone(String(input.phone ?? ''));
  if (!firstName || !lastName) throw new HttpError(400, 'Prénom et nom requis');
  if (!RESIDENCE_COUNTRIES.some((c) => c.code === input.country)) throw new HttpError(400, 'Pays de résidence invalide');
  if (phone.replace(/\D/g, '').length < 8) throw new HttpError(400, 'Numéro de téléphone invalide');
  await verifyOtp(phone, input.otp);

  return withDb((db) => {
    if (db.users.some((u) => normalizePhone(u.phone) === phone)) {
      throw new HttpError(409, 'Un compte existe déjà avec ce numéro. Connectez-vous.', 'exists');
    }
    const user: User = {
      id: randomId('u'),
      firstName,
      lastName,
      country: input.country,
      phone,
      createdAt: new Date().toISOString(),
    };
    db.users.push(user);
    return user;
  });
}

export async function loginUser(input: { phone: string; otp: string }): Promise<User> {
  const phone = normalizePhone(String(input.phone ?? ''));
  await verifyOtp(phone, input.otp);
  const db = await readDb();
  const user = db.users.find((u) => normalizePhone(u.phone) === phone);
  if (!user) throw new HttpError(404, "Aucun compte avec ce numéro. Créez-en un.", 'not_found');
  return user;
}

export async function demoUser(): Promise<User> {
  if (!getConfig().allowDemo) throw new HttpError(403, 'Le compte de démonstration est désactivé sur cette instance.', 'demo_disabled');
  const db = await readDb();
  const user = db.users.find((u) => u.id === DEMO_USER_ID);
  if (!user) throw new HttpError(404, 'Compte de démonstration absent (réinitialisez les données).');
  return user;
}
