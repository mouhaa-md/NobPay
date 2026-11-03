#!/usr/bin/env node
/**
 * Makes a pair of VAPID keys for the notifications (Web Push).
 *
 *   node scripts/vapid-keys.mjs
 *
 * Put the two lines it prints in the instance's environment (deploy/.env or .env.local), never in Git. The public key is
 * given to browsers; the private key signs the notifications and stays on the server. Changing the pair later makes every
 * phone that asked for notifications ask again.
 */
import { createRequire } from 'node:module';

const webpush = createRequire(import.meta.url)('web-push');
const { publicKey, privateKey } = webpush.generateVAPIDKeys();
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
console.log('VAPID_SUBJECT=mailto:you@example.org   # an address the push services can reach (mailto: or https:)');
