#!/usr/bin/env node
/**
 * Checks, against REAL Nostr relays, that the ones you plan to use accept NobPay's commitment events (kind 8421) and
 * give them back. Before a deployment, once.
 *
 * It PUBLISHES one small event to each relay, signed by a throwaway key made for this run (nothing to do with your
 * projects): its content is two random hashes. Events on relays cannot be reliably removed, so run it deliberately.
 * Add --read-only to only ask each relay for events of our kind (nothing is published).
 *
 * Usage:  node scripts/nostr-smoke.mjs [--read-only] [wss://relay-one wss://relay-two ...]
 * Without relays it uses the defaults of the verification page (NOSTR_RELAYS is not read).
 */
import { createHash, randomBytes } from 'node:crypto';
import { finalizeEvent, generateSecretKey, getPublicKey, verifyEvent } from 'nostr-tools/pure';

const KIND = 8421;
const args = process.argv.slice(2);
const readOnly = args.includes('--read-only');
const relays = args.filter((a) => a.startsWith('wss://'));
if (relays.length === 0) relays.push('wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.primal.net');

const sk = generateSecretKey();
const pk = getPublicKey(sk);
const sha = () => createHash('sha256').update(randomBytes(16)).digest('hex');
const event = finalizeEvent(
  { kind: KIND, created_at: Math.floor(Date.now() / 1000), tags: [['t', 'nobpay'], ['t', 'smoke-test']], content: JSON.stringify({ v: 1, seq: 1, hash: sha(), prev: '0'.repeat(64) }) },
  sk,
);

/** One conversation with a relay: send `frames`, resolve with the first message `match` accepts. */
function talk(url, frames, match, ms = 8000) {
  return new Promise((resolve) => {
    const ws = new WebSocket(url);
    const timer = setTimeout(() => done('timeout'), ms);
    const done = (value) => {
      clearTimeout(timer);
      try { ws.close(); } catch { /* closed */ }
      resolve(value);
    };
    ws.onopen = () => frames.forEach((f) => ws.send(JSON.stringify(f)));
    ws.onerror = () => done('unreachable');
    ws.onmessage = (m) => {
      let msg;
      try { msg = JSON.parse(m.data); } catch { return; }
      const out = match(msg);
      if (out !== undefined) done(out);
    };
  });
}

console.log(readOnly ? 'Mode lecture seule : rien n’est publié.\n' : `Publication d’un évènement de test (clé jetable ${pk.slice(0, 12)}…, id ${event.id.slice(0, 12)}…)\n`);
let failures = 0;
for (const url of relays) {
  let line = url.padEnd(28);
  if (!readOnly) {
    const ok = await talk(url, [['EVENT', event]], (m) => (m[0] === 'OK' && m[1] === event.id ? { ok: m[2], detail: m[3] ?? '' } : undefined));
    if (typeof ok === 'string') line += `envoi : ${ok}`;
    else line += ok.ok ? 'envoi : accepté' : `envoi : REFUSÉ (${ok.detail})`;
    if (typeof ok === 'string' || !ok.ok) failures += 1;
    line += ' | ';
  }
  const events = [];
  const read = await talk(
    url,
    [['REQ', 'smoke', { kinds: [KIND], authors: readOnly ? undefined : [pk], limit: readOnly ? 5 : 10 }]],
    (m) => {
      if (m[1] !== 'smoke') return undefined;
      if (m[0] === 'EVENT') events.push(m[2]);
      if (m[0] === 'EOSE') return 'eose';
      if (m[0] === 'CLOSED') return `refusé (${m[2]})`;
      return undefined;
    },
  );
  if (read === 'eose') {
    const back = events.find((e) => e.id === event.id);
    line += readOnly ? `lecture : ok (${events.length} évènement(s) de notre type)` : back && verifyEvent(back) ? 'relecture : ok, signature valide' : 'relecture : ÉVÈNEMENT ABSENT';
    if (!readOnly && !back) failures += 1;
  } else {
    line += `lecture : ${read}`;
    failures += 1;
  }
  console.log(line);
}
console.log(failures === 0 ? '\nTous les relais testés conviennent.' : `\n${failures} problème(s) : retirez ces relais de NOSTR_RELAYS, ou choisissez-en d’autres.`);
process.exit(failures === 0 ? 0 : 1);
