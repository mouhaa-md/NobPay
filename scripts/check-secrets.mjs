#!/usr/bin/env node
// Fails when a tracked file contains something that looks like a real secret. Run from the repository root.
// Deliberately small and dependency-free; it complements (does not replace) a full scanner such as gitleaks.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const PATTERNS = [
  ['Bitnob API key', /prd:(sandbox|live)_[0-9a-f]{24,}/i],
  ['private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['Twilio auth token assigned', /TWILIO_AUTH_TOKEN\s*=\s*[0-9a-f]{32}\b/i],
  ['Twilio account SID', /\bAC[0-9a-f]{32}\b/],
  ['long hex secret assigned', /(SECRET|TOKEN|API_KEY)\s*=\s*[0-9a-f]{48,}\b/i],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{36,}\b/],
];
const SKIP = /(^|\/)(package-lock\.json|.*\.(png|jpe?g|webp|ico|woff2?|pdf|ots))$/i;

const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean);
let found = 0;
for (const f of files) {
  if (SKIP.test(f)) continue;
  let text;
  try {
    text = readFileSync(f, 'utf8');
  } catch {
    continue;
  }
  text.split('\n').forEach((line, i) => {
    for (const [name, re] of PATTERNS) {
      if (re.test(line)) {
        found++;
        console.error(`${f}:${i + 1}  looks like a secret (${name})`);
      }
    }
  });
}
if (found) {
  console.error(`\n${found} possible secret(s). Remove them, rotate the credential, and keep real values in frontend/.env.local (ignored by Git).`);
  process.exit(1);
}
console.log(`secret scan: ${files.length} tracked files, nothing suspicious`);
