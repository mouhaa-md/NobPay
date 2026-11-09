import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * deploy/bootstrap.sh writes the secrets of an instance (session secret, Nostr master key and, for real sats, the two wallet
 * connection strings, which can spend). It is run here in a throw-away copy of the repository, with a fake `docker` and a
 * fake `curl`: nothing is started, nothing leaves the machine. It needs a POSIX shell, so it is skipped on Windows.
 */
const DEPLOY = path.resolve(__dirname, '../../deploy');
const has = (cmd: string) => spawnSync('sh', ['-c', `command -v ${cmd}`]).status === 0;
const runnable = process.platform !== 'win32' && has('openssl') && has('awk');

let root: string;
let calls: string;

function setup() {
  root = mkdtempSync(path.join(tmpdir(), 'nobpay-bootstrap-'));
  mkdirSync(path.join(root, 'deploy'));
  copyFileSync(path.join(DEPLOY, 'bootstrap.sh'), path.join(root, 'deploy', 'bootstrap.sh'));
  copyFileSync(path.join(DEPLOY, '.env.example'), path.join(root, 'deploy', '.env.example'));
  mkdirSync(path.join(root, 'bin'));
  calls = path.join(root, 'calls.log');
  for (const name of ['docker', 'curl']) {
    const file = path.join(root, 'bin', name);
    writeFileSync(file, `#!/bin/sh\necho "${name} $*" >> "${calls}"\nexit 0\n`);
    chmodSync(file, 0o755);
  }
}

/** Runs the script with the widest umask there is, the worst case for a file that must stay private. */
function run(args: string[], input: string) {
  return spawnSync('sh', ['-c', 'umask 000; exec sh deploy/bootstrap.sh "$@"', 'sh', ...args], {
    cwd: root,
    input,
    encoding: 'utf8',
    timeout: 30_000,
    // a minimal environment on purpose: the script gets nothing from the developer's shell
    env: { PATH: `${path.join(root, 'bin')}:${process.env.PATH}`, HOME: root, NODE_ENV: 'test' },
  });
}

function readEnv(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

const mode = (file: string) => statSync(file).mode & 0o777;

describe.skipIf(!runnable)('deploy/bootstrap.sh', () => {
  beforeEach(setup);
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('writes deploy/.env readable by its owner only, whatever the umask', () => {
    const r = run(['demo'], 'demo.example.org\nn\n');
    expect(r.status).toBe(0);
    const file = path.join(root, 'deploy', '.env');
    expect(mode(file)).toBe(0o600);
    expect(existsSync(`${file}.tmp`)).toBe(false);
  });

  it('generates three different 256-bit secrets on the spot and never prints them', () => {
    const r = run(['demo'], 'demo.example.org\nn\n');
    const env = readEnv(path.join(root, 'deploy', '.env'));
    const secrets = [env.SESSION_SECRET, env.BITNOB_WEBHOOK_SECRET, env.NOSTR_MASTER_KEY];
    for (const s of secrets) expect(s).toMatch(/^[0-9a-f]{64}$/);
    expect(new Set(secrets).size).toBe(3);
    for (const s of secrets) {
      expect(r.stdout).not.toContain(s);
      expect(r.stderr).not.toContain(s);
    }
  });

  it('sets up the demo profile: everything simulated, address from the answer, one docker compose build', () => {
    run(['demo'], 'demo.example.org\nn\n');
    const env = readEnv(path.join(root, 'deploy', '.env'));
    expect(env).toMatchObject({
      SITE_ADDRESS: 'demo.example.org',
      PUBLIC_BASE_URL: 'https://demo.example.org',
      ALLOW_DEMO: '1',
      BITNOB_MODE: 'mock',
      LIGHTNING_RAIL: '',
      NOSTR_PUBLISH: '',
    });
    const log = readFileSync(calls, 'utf8');
    expect(log).toMatch(/docker compose .* up -d --build/);
    expect(log).toMatch(/curl .*https:\/\/demo\.example\.org\/api\/health/);
  });

  it('real profile: demo sign-in off, guest accounts on, wallet strings stored but never echoed, file private', () => {
    const wallet = 'ab'.repeat(32);
    const key = 'cd'.repeat(32);
    const receive = `nostr+walletconnect://${wallet}?relay=wss%3A%2F%2Frelay.example.org&secret=${key}`;
    const payout = `nostr+walletconnect://${wallet}?relay=wss%3A%2F%2Frelay.example.org&secret=${'ef'.repeat(32)}`;
    const r = run(['real'], ['essai.example.org', receive, payout, '5', '', '', 'n', ''].join('\n'));
    expect(r.status).toBe(0);
    const file = path.join(root, 'deploy', '.env');
    expect(mode(file)).toBe(0o600);
    const env = readEnv(file);
    expect(env).toMatchObject({
      ALLOW_DEMO: '0',
      ALLOW_GUEST: '1',
      LIGHTNING_RAIL: 'nwc',
      NWC_RECEIVE_URL: receive,
      NWC_PAYOUT_URL: payout,
      LIGHTNING_MAX_FUNDING_USD: '5',
      LIGHTNING_MAX_PAYOUT_USD: '20',
      LIGHTNING_MAX_ESCROW_USD: '60',
    });
    for (const secret of [receive, payout, key, 'ef'.repeat(32)]) {
      expect(r.stdout).not.toContain(secret);
      expect(r.stderr).not.toContain(secret);
    }
  });

  it('never touches an existing deploy/.env', () => {
    const file = path.join(root, 'deploy', '.env');
    writeFileSync(file, 'KEEP=1\n');
    const r = run(['demo'], 'demo.example.org\nn\n');
    expect(r.status).toBe(1);
    expect(readFileSync(file, 'utf8')).toBe('KEEP=1\n');
    expect(existsSync(path.join(root, 'calls.log'))).toBe(false);
  });

  it.each([[':80'], ['demo.example.org/../x'], ['demo example.org'], ['']])('refuses the address %j and leaves nothing behind', (answer) => {
    const r = run(['demo'], `${answer}\nn\n`);
    expect(r.status).toBe(1);
    expect(existsSync(path.join(root, 'deploy', '.env'))).toBe(false);
  });

  it('shows how to use it when the profile is missing or unknown', () => {
    for (const args of [[], ['prod']]) {
      const r = run(args, '');
      expect(r.status).toBe(2);
      expect(r.stderr).toMatch(/usage: sh deploy\/bootstrap\.sh demo\|real/);
    }
  });
});
