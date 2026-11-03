import type { Db, User } from '@/lib/types';
import { hmacHex, safeEqual } from './crypto';
import { readDb, withDb } from './db';
import { HttpError } from './http';
import { assertSessionSecret } from './secret';

/**
 * A guest account has no phone number and no code: the cookie of one browser is its only key. Lose the cookie (another
 * browser, cleared data, a week without a visit) or sign out, and the account, with the escrow in it, can never be
 * opened again. The recovery link is the second key: `<userId>.<version>.<hmac>`, signed with the server secret, so
 * nothing reusable is stored. The owner can renew it (the version goes up and every older link dies).
 * It opens the account, so it is shown to its owner only, and said to be kept like a password.
 */

const mac = (userId: string, version: number) => hmacHex('sha256', assertSessionSecret(), `recover:${userId}:${version}`).slice(0, 32);

/** The recovery token of a guest account, or null for any other account (those sign in with their phone). */
export function recoveryTokenOf(user: Pick<User, 'id' | 'guest' | 'recoveryVersion'>): string | null {
  if (!user.guest) return null;
  const version = user.recoveryVersion ?? 0;
  return `${user.id}.${version}.${mac(user.id, version)}`;
}

/** The guest account a token opens, or undefined. Only guest accounts can be recovered this way. */
export function guestForRecoveryToken(db: Pick<Db, 'users'>, token: string): User | undefined {
  const parts = String(token ?? '').split('.');
  if (parts.length !== 3) return undefined;
  const [id, v, given] = parts;
  const version = Number(v);
  if (!id || !Number.isInteger(version) || version < 0) return undefined;
  const user = db.users.find((u) => u.id === id);
  if (!user?.guest || (user.recoveryVersion ?? 0) !== version) return undefined;
  return safeEqual(given, mac(id, version)) ? user : undefined;
}

export async function recoverGuest(token: string): Promise<User> {
  const user = guestForRecoveryToken(await readDb(), token);
  if (!user) throw new HttpError(404, 'Ce lien de récupération n’est pas valable (ou il a été renouvelé).', 'bad_recovery');
  return user;
}

/** New link, and the old one stops working at once. */
export async function renewRecovery(user: User): Promise<string> {
  if (!user.guest) throw new HttpError(403, 'Seul un compte invité a un lien de récupération.', 'not_guest');
  return withDb((db) => {
    const u = db.users.find((x) => x.id === user.id);
    if (!u) throw new HttpError(404, 'Compte introuvable');
    u.recoveryVersion = (u.recoveryVersion ?? 0) + 1;
    return recoveryTokenOf(u)!;
  });
}
