import { hkdfSync } from 'node:crypto';
import { getPublicKey } from 'nostr-tools/pure';
import { DEFAULT_RELAYS, isHex64 } from '@/lib/nostr/commitment';
import { relayUrlProblem } from '@/lib/nostr/relayClient';
import { getConfig } from '../config';

/**
 * Every project signs its Nostr commitments with its own key. The keys are not stored: they are derived (HKDF-SHA256)
 * from one master key and the project id, so one secret to back up gives back all of them, and two projects share no
 * public key that would link them.
 *
 * The master key is NOSTR_MASTER_KEY (64 hex characters). Without it, one is derived from SESSION_SECRET: fine for a
 * demo, but changing SESSION_SECRET then changes every key, so a real instance sets NOSTR_MASTER_KEY.
 */

const SALT = 'nobpay/nostr/project-key/v1';

/** Why NOSTR_MASTER_KEY cannot be used, or null when absent (the fallback applies) or fine. */
export function masterKeyProblem(value: string | undefined = process.env.NOSTR_MASTER_KEY): string | null {
  if (!value) return null;
  return isHex64(value.trim().toLowerCase()) ? null : 'doit être 64 caractères hexadécimaux (openssl rand -hex 32)';
}

function masterKey(): Buffer {
  const explicit = process.env.NOSTR_MASTER_KEY?.trim().toLowerCase();
  if (explicit && isHex64(explicit)) return Buffer.from(explicit, 'hex');
  return Buffer.from(hkdfSync('sha256', Buffer.from(getConfig().sessionSecret, 'utf8'), SALT, 'master-from-session-secret', 32));
}

/** The signing key of a project. Deterministic; the first derived value that is a valid secp256k1 key. */
export function projectSecretKey(projectId: string): Uint8Array {
  const master = masterKey();
  for (let counter = 0; counter < 16; counter++) {
    const sk = new Uint8Array(hkdfSync('sha256', master, SALT, `${projectId}|${counter}`, 32));
    try {
      getPublicKey(sk);
      return sk;
    } catch {
      /* not a valid scalar (about one chance in 2^128): derive the next one */
    }
  }
  throw new Error('Impossible de dériver une clé Nostr pour ce projet.');
}

export const projectPublicKey = (projectId: string): string => getPublicKey(projectSecretKey(projectId));

/** The relays commitments go to: NOSTR_RELAYS, or the defaults. Unusable addresses are dropped. */
export function configuredRelays(): string[] {
  const named = getConfig().nostr.relays;
  const wanted = named.length > 0 ? named : DEFAULT_RELAYS;
  return wanted.filter((url) => relayUrlProblem(url, process.env.NODE_ENV !== 'production') === null);
}

export const nostrPublishing = (): boolean => getConfig().nostr.publish;
