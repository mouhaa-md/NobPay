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
  // A fake docker that can play an app container: FAKE_APP_STATE is "<status> <restart count> <health>", FAKE_LOGS what its log says.
  const fakeDocker = [
    '#!/bin/sh',
    `echo "docker $*" >> "${calls}"`,
    'case "$*" in',
    '  *" ps -q app"*) echo fakecid ;;',
    '  inspect*) echo "${FAKE_APP_STATE:-running 0 healthy}" ;;',
    '  *" logs "*) printf "%s\\n" "${FAKE_LOGS:-}" ;;',
    '  *" ps"*) echo "NAME STATUS"; echo "deploy-app-1 ${FAKE_APP_STATE:-running}" ;;',
    'esac',
    'exit 0',
    '',
  ].join('\n');
  // a fake curl that answers like the health check does, or fails like a server that is not there (FAKE_CURL_RC)
  const fakeCurl = ['#!/bin/sh', `echo "curl $*" >> "${calls}"`, 'exit "${FAKE_CURL_RC:-0}"', ''].join('\n');
  for (const [name, body] of [['docker', fakeDocker], ['curl', fakeCurl]]) {
    const file = path.join(root, 'bin', name);
    writeFileSync(file, body);
    chmodSync(file, 0o755);
  }
}

/** Runs the script with the widest umask there is, the worst case for a file that must stay private. */
function run(args: string[], input: string, extraEnv: Record<string, string> = {}) {
  return spawnSync('sh', ['-c', 'umask 000; exec sh deploy/bootstrap.sh "$@"', 'sh', ...args], {
    cwd: root,
    input,
    encoding: 'utf8',
    timeout: 30_000,
    // a minimal environment on purpose: the script gets nothing from the developer's shell
    env: { PATH: `${path.join(root, 'bin')}:${process.env.PATH}`, HOME: root, NODE_ENV: 'test', ...extraEnv },
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

  describe('when the app does not come up', () => {
    const answers = 'demo.example.org\nn\n';
    const refusal = '[nobpay] Démarrage refusé :\n- VAPID_PUBLIC_KEY n’est pas une clé publique VAPID valable';
    const fast = { BOOTSTRAP_WAIT_SLEEP: '0', BOOTSTRAP_WAIT_TRIES: '3', FAKE_CURL_RC: '7' };

    it('stops at once and prints the state and the last lines of the log when the container keeps restarting', () => {
      const r = run(['demo'], answers, { ...fast, FAKE_APP_STATE: 'restarting 3 starting', FAKE_LOGS: refusal });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('Démarrage refusé');
      expect(r.stderr).toContain('VAPID_PUBLIC_KEY');
      expect(r.stderr).toMatch(/deploy-app-1/); // the container state, from `compose ps`
      const log = readFileSync(calls, 'utf8');
      expect(log).toMatch(/docker compose .* logs .*--tail 40 app/);
      expect(log.match(/curl /g)).toHaveLength(1); // it did not keep asking for 40 rounds
    });

    it('prints the log too when the container runs but never answers, after the whole wait', () => {
      const r = run(['demo'], answers, { ...fast, FAKE_APP_STATE: 'running 0 starting', FAKE_LOGS: 'the last line of the log' });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('the last line of the log');
      expect(r.stderr).toMatch(/pas de réponse/);
      expect(readFileSync(calls, 'utf8').match(/curl /g)!.length).toBeGreaterThan(1);
    });

    it('stops as well when Docker itself says the container is unhealthy', () => {
      const r = run(['demo'], answers, { ...fast, FAKE_APP_STATE: 'running 0 unhealthy', FAKE_LOGS: 'unhealthy log line' });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('unhealthy log line');
    });

    it('never prints the generated secrets, even while it dumps the log', () => {
      const r = run(['demo'], answers, { ...fast, FAKE_APP_STATE: 'exited 1 none', FAKE_LOGS: refusal });
      const env = readEnv(path.join(root, 'deploy', '.env'));
      for (const s of [env.SESSION_SECRET, env.BITNOB_WEBHOOK_SECRET, env.NOSTR_MASTER_KEY]) {
        expect(r.stdout).not.toContain(s);
        expect(r.stderr).not.toContain(s);
      }
    });

    it('prints no log and succeeds when the health check answers', () => {
      const r = run(['demo'], answers, { BOOTSTRAP_WAIT_SLEEP: '0' });
      expect(r.status).toBe(0);
      expect(readFileSync(calls, 'utf8')).not.toMatch(/ logs /);
    });
  });

  it('never touches an existing deploy/.env', () => {
    const file = path.join(root, 'deploy', '.env');
    writeFileSync(file, 'KEEP=1\n');
    const r = run(['demo'], 'demo.example.org\nn\n');
    expect(r.status).toBe(1);
    expect(readFileSync(file, 'utf8')).toBe('KEEP=1\n');
    expect(existsSync(path.join(root, 'calls.log'))).toBe(false);
  });

  it.each([['demo.example.org/../x'], ['demo example.org'], [':8080'], ['http://demo.example.org'], ['']])('refuses the address %j and leaves nothing behind', (answer) => {
    const r = run(['demo'], `${answer}\nn\n`);
    expect(r.status).toBe(1);
    expect(existsSync(path.join(root, 'deploy', '.env'))).toBe(false);
  });

  describe('plain HTTP (":80"), for a local trial', () => {
    const WARNING = 'HTTP simple : essai local uniquement';
    const envFile = () => readEnv(path.join(root, 'deploy', '.env'));

    it('is accepted for the demo profile, with the warning, over a public address of localhost', () => {
      const r = run(['demo'], ':80\nn\n', { BOOTSTRAP_WAIT_SLEEP: '0' });
      expect(r.status, r.stderr).toBe(0);
      expect(r.stderr).toContain(WARNING);
      expect(envFile()).toMatchObject({ SITE_ADDRESS: ':80', PUBLIC_BASE_URL: 'http://localhost', ALLOW_DEMO: '1', BITNOB_MODE: 'mock', LIGHTNING_RAIL: '' });
      expect(mode(path.join(root, 'deploy', '.env'))).toBe(0o600);
      // the health check is made on this machine over plain HTTP, not on a certificate that does not exist
      expect(readFileSync(calls, 'utf8')).toMatch(/curl .*http:\/\/localhost\/api\/health/);
      expect(readFileSync(calls, 'utf8')).not.toMatch(/curl .*https:/);
    });

    it('takes the forwarded address of a Codespace as the public address', () => {
      const r = run(['demo'], ':80\nn\n', { BOOTSTRAP_WAIT_SLEEP: '0', CODESPACE_NAME: 'my-space-abc', GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: 'app.github.dev' });
      expect(r.status, r.stderr).toBe(0);
      expect(envFile().PUBLIC_BASE_URL).toBe('https://my-space-abc-80.app.github.dev');
    });

    it('can be given as SITE_ADDRESS in the environment, and PUBLIC_BASE_URL can be overridden', () => {
      const r = run(['demo'], 'n\n', { BOOTSTRAP_WAIT_SLEEP: '0', SITE_ADDRESS: ':80', PUBLIC_BASE_URL: 'http://192.168.1.20' });
      expect(r.status, r.stderr).toBe(0);
      expect(envFile()).toMatchObject({ SITE_ADDRESS: ':80', PUBLIC_BASE_URL: 'http://192.168.1.20' });
      expect(r.stderr).not.toMatch(/Nom de domaine de cette instance/); // it did not ask
    });

    it.each([['javascript:alert(1)'], ['http://localhost/path'], ['http://local host'], ['ftp://localhost']])('refuses the public address %j', (url) => {
      const r = run(['demo'], ':80\nn\n', { SITE_ADDRESS: '', PUBLIC_BASE_URL: url });
      expect(r.status).toBe(1);
      expect(existsSync(path.join(root, 'deploy', '.env'))).toBe(false);
    });

    it('is refused for the real-sats profile, before any wallet string is asked for or anything is written', () => {
      const environments: Record<string, string>[] = [{}, { SITE_ADDRESS: ':80' }];
      for (const env of environments) {
        const r = run(['real'], ':80\nnostr+walletconnect://x\n', env);
        expect(r.status).toBe(1);
        expect(r.stderr).toMatch(/réservé au profil demo/);
        expect(r.stderr).not.toContain(WARNING);
        expect(r.stderr).not.toMatch(/NWC_RECEIVE_URL/); // never reached the question
        expect(existsSync(path.join(root, 'deploy', '.env'))).toBe(false);
        expect(existsSync(calls) ? readFileSync(calls, 'utf8') : '').not.toMatch(/ up /); // nothing was started
      }
    });

    it('does not warn about plain HTTP, and still uses https, for a domain name', () => {
      const r = run(['demo'], 'demo.example.org\nn\n', { BOOTSTRAP_WAIT_SLEEP: '0' });
      expect(r.stderr).not.toContain(WARNING);
      expect(envFile().PUBLIC_BASE_URL).toBe('https://demo.example.org');
    });
  });

  it('shows how to use it when the profile is missing or unknown', () => {
    for (const args of [[], ['prod']]) {
      const r = run(args, '');
      expect(r.status).toBe(2);
      expect(r.stderr).toMatch(/usage: sh deploy\/bootstrap\.sh demo\|real/);
    }
  });
});
