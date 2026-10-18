import { cookies } from 'next/headers';
import type { User } from '@/lib/types';
import { RESIDENCE_COUNTRIES } from '@/lib/templates';
import { getConfig } from './config';
import { hmacHex, randomId, safeEqual } from './crypto';
import { readDb, withDb } from './db';
import { HttpError } from './http';
import { DEMO_USER_ID } from './seed';

/**
 * Prototype authentication: a signed cookie holding the user id, and a demo-only
 * SMS code (there is no SMS provider here). Do not reuse as-is for real users.
 */

const COOKIE = 'nobpay_session';

const sign = (uid: string) => hmacHex('sha256', getConfig().sessionSecret, `session:${uid}`).slice(0, 40);

export function sessionValue(uid: string): string {
  return `${uid}.${sign(uid)}`;
}

export function parseSession(value: string | undefined): string | null {
  if (!value) return null;
  const i = value.lastIndexOf('.');
  if (i < 1) return null;
  const uid = value.slice(0, i);
  return safeEqual(value.slice(i + 1), sign(uid)) ? uid : null;
}

export async function getSessionUser(): Promise<User | null> {
  const uid = parseSession(cookies().get(COOKIE)?.value);
  if (!uid) return null;
  const db = await readDb();
  return db.users.find((u) => u.id === uid) ?? null;
}

export async function requireUser(): Promise<User> {
  const user = await getSessionUser();
  if (!user) throw new HttpError(401, 'Connectez-vous pour continuer', 'unauthenticated');
  return user;
}

export function startSession(uid: string): void {
  cookies().set(COOKIE, sessionValue(uid), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
}

export function endSession(): void {
  cookies().delete(COOKIE);
}

export const normalizePhone = (phone: string): string => phone.replace(/[^0-9+]/g, '');

function checkOtp(otp: string): void {
  if (!safeEqual(String(otp ?? '').trim(), getConfig().demoOtp)) {
    throw new HttpError(400, 'Code incorrect', 'bad_otp');
  }
}

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
  checkOtp(input.otp);

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
  checkOtp(input.otp);
  const db = await readDb();
  const user = db.users.find((u) => normalizePhone(u.phone) === phone);
  if (!user) throw new HttpError(404, "Aucun compte avec ce numéro. Créez-en un.", 'not_found');
  return user;
}

export async function demoUser(): Promise<User> {
  const db = await readDb();
  const user = db.users.find((u) => u.id === DEMO_USER_ID);
  if (!user) throw new HttpError(404, 'Compte de démonstration absent (réinitialisez les données).');
  return user;
}
