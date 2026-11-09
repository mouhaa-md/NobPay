import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * deploy/backup.sh archives the data volume: the whole database (phone numbers, names, suppliers, photo positions) and every
 * uploaded proof. The archive must be readable by its owner only, in a folder only its owner can enter. It used to be written
 * by `root` inside the container with the container's umask: 644, readable by every user of the server (found by the first
 * Docker run). Here the script runs in a throw-away folder with a fake `docker run` that executes, on this machine, the command
 * the container would run (with /data and /backup pointing at throw-away folders), under the widest umask. Needs a POSIX shell
 * and tar: skipped on Windows.
 */
const SCRIPT = path.resolve(__dirname, '../../deploy/backup.sh');
const has = (cmd: string) => spawnSync('sh', ['-c', `command -v ${cmd}`]).status === 0;
const runnable = process.platform !== 'win32' && has('tar') && typeof process.getuid === 'function';

let root: string;
let data: string;
let dest: string;

const FAKE_DOCKER = `#!${process.execPath}
const { spawnSync } = require('node:child_process');
const a = process.argv.slice(2);
if (a[0] !== 'run') process.exit(0);
const env = { ...process.env };
const maps = [];
let i = 1;
for (; i < a.length; i++) {
  if (a[i] === '--rm') continue;
  if (a[i] === '-e') { const [k, ...v] = a[++i].split('='); env[k] = v.join('='); continue; }
  if (a[i] === '-v') { const [src, dst] = a[++i].split(':'); maps.push([dst, src]); continue; }
  break;
}
// a[i] is the image, then: sh -c <script>
let script = a[i + 3];
for (const [dst, src] of maps) script = script.split(dst).join(src);
process.exit(spawnSync('sh', ['-c', script], { env, stdio: 'inherit' }).status ?? 1);
`;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'nbpbackup-'));
  data = path.join(root, 'vol');
  dest = path.join(root, 'out', 'backups');
  mkdirSync(path.join(data, 'uploads', 'p_1'), { recursive: true });
  writeFileSync(path.join(data, 'db.json'), '{"users":[{"phone":"+221770000000"}]}');
  writeFileSync(path.join(data, 'uploads', 'p_1', 'photo.jpg'), 'not really a photo');
  mkdirSync(path.join(root, 'bin'));
  const docker = path.join(root, 'bin', 'docker');
  writeFileSync(docker, FAKE_DOCKER);
  chmodSync(docker, 0o755);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

/** The widest umask there is, the worst case for files that must stay private. */
function backup(args: string[], extraEnv: Record<string, string> = {}) {
  return spawnSync('sh', ['-c', 'umask 000; exec sh "$@"', 'sh', SCRIPT, ...args], {
    encoding: 'utf8',
    timeout: 30_000,
    env: { PATH: `${path.join(root, 'bin')}:${process.env.PATH}`, HOME: root, NODE_ENV: 'test', NOBPAY_VOLUME: data, ...extraEnv },
  });
}
const mode = (p: string) => statSync(p).mode & 0o777;
const archives = () => readdirSync(dest).filter((n) => /^nobpay-.*\.tar\.gz$/.test(n)).sort();

describe.skipIf(!runnable)('deploy/backup.sh', () => {
  it('writes the archive readable by its owner only, in a folder only its owner can enter, whatever the umask', () => {
    const r = backup([dest]);
    expect(r.status, r.stderr).toBe(0);
    expect(mode(dest)).toBe(0o700);
    const [name] = archives();
    expect(mode(path.join(dest, name))).toBe(0o600);
    expect(r.stdout).toContain(`ok: ${dest}/${name}`);
  });

  it('closes a folder that already existed and was open to everyone', () => {
    mkdirSync(dest, { recursive: true, mode: 0o755 });
    chmodSync(dest, 0o755);
    expect(backup([dest]).status).toBe(0);
    expect(mode(dest)).toBe(0o700);
  });

  it('hands the archive to the user who ran the script, not to the container’s root', () => {
    backup([dest]);
    expect(statSync(path.join(dest, archives()[0])).uid).toBe(process.getuid!());
  });

  it('archives the database and the proofs', () => {
    backup([dest]);
    const list = spawnSync('tar', ['tzf', path.join(dest, archives()[0])], { encoding: 'utf8' }).stdout;
    expect(list).toContain('./db.json');
    expect(list).toContain('./uploads/p_1/photo.jpg');
  });

  it('keeps only the latest KEEP archives', () => {
    mkdirSync(dest, { recursive: true });
    ['20260101T000000Z', '20260102T000000Z', '20260103T000000Z'].forEach((stamp, i) => {
      const f = path.join(dest, `nobpay-${stamp}.tar.gz`);
      writeFileSync(f, 'old');
      utimesSync(f, new Date(2026, 0, i + 1), new Date(2026, 0, i + 1));
    });
    expect(backup([dest], { KEEP: '2' }).status).toBe(0);
    const kept = archives();
    expect(kept).toHaveLength(2);
    expect(kept).not.toContain('nobpay-20260101T000000Z.tar.gz');
    expect(existsSync(path.join(dest, kept[1]))).toBe(true);
  });

  it('asks for a destination', () => {
    const r = backup([]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/usage: backup\.sh/);
  });
});
